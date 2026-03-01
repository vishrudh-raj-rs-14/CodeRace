package sandbox

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"syscall"
	"time"

	"github.com/google/uuid"
)

// ---------------------------------------------------------------------------
// Sandbox — a single running nsjail process
// ---------------------------------------------------------------------------

// Sandbox represents an isolated nsjail process executing user-supplied
// Python code.  It exposes pipes for real-time stdin / stdout / stderr
// communication and status helpers so the caller can detect timeouts,
// errors, and process exit.
//
// Every Sandbox gets its own UUID-keyed working directory, so multiple
// sandboxes can run in parallel without interfering with each other.
type Sandbox struct {
	// ID is the unique identifier for this sandbox instance.
	ID string

	// Stdin — write here to send input to the sandboxed Python process.
	// Close it when no more input will be sent (the process will see EOF).
	Stdin io.WriteCloser

	// Stdout — read from here to receive the process's standard output.
	Stdout io.Reader

	// Stderr — read from here to receive the process's standard error.
	// Note: nsjail's own log lines (--log_fd 2) are also written here.
	Stderr io.Reader

	cmd     *exec.Cmd
	workDir string
	cancel  context.CancelFunc
	done    chan struct{} // closed when the process exits

	mu       sync.Mutex
	timedOut bool
	exitCode int
	exitErr  error
}

// Done returns a channel that is closed when the sandbox process exits
// (whether normally, on error, on timeout, or via Kill).
func (s *Sandbox) Done() <-chan struct{} {
	return s.done
}

// TimedOut reports whether the sandbox was killed because it exceeded its
// time limit.  Only meaningful after Done() is closed.
func (s *Sandbox) TimedOut() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.timedOut
}

// Err returns the error from the sandbox process, or nil if it exited
// cleanly (exit code 0).  Only meaningful after Done() is closed.
func (s *Sandbox) Err() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.exitErr
}

// ExitCode returns the exit code of the process.
// Only meaningful after Done() is closed.
func (s *Sandbox) ExitCode() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.exitCode
}

// Alive reports whether the sandbox process is still running.
func (s *Sandbox) Alive() bool {
	select {
	case <-s.done:
		return false
	default:
		return true
	}
}

// Kill forcefully terminates the sandbox process and waits for the
// monitor goroutine to finish (which also removes the working directory).
// Safe to call multiple times or concurrently.
func (s *Sandbox) Kill() {
	s.cancel()
	<-s.done
}

// cleanup removes the sandbox's working directory from disk.
func (s *Sandbox) cleanup() {
	if s.workDir != "" {
		os.RemoveAll(s.workDir)
	}
}

// monitor waits for the process to exit, records exit status, cleans up
// the working directory, de-registers from the Manager, and closes the
// done channel.
func (s *Sandbox) monitor(ctx context.Context, onExit func(string)) {
	defer func() {
		s.cleanup()
		if onExit != nil {
			onExit(s.ID)
		}
		close(s.done)
	}()

	waitErr := s.cmd.Wait()

	s.mu.Lock()
	defer s.mu.Unlock()

	s.timedOut = ctx.Err() == context.DeadlineExceeded

	if waitErr != nil {
		if exitErr, ok := waitErr.(*exec.ExitError); ok {
			if status, ok := exitErr.Sys().(syscall.WaitStatus); ok {
				s.exitCode = status.ExitStatus()
			} else {
				s.exitCode = 1
			}
		}
		if !s.timedOut {
			s.exitErr = waitErr
		}
	}
}

// ---------------------------------------------------------------------------
// Manager — creates, tracks, and tears down sandboxes
// ---------------------------------------------------------------------------

// Manager creates and tracks Sandbox instances.  It is safe for concurrent
// use from multiple goroutines.
type Manager struct {
	nsjailPath string
	nsjailCfg  string
	baseDir    string
	timeout    time.Duration

	mu        sync.Mutex
	sandboxes map[string]*Sandbox
}

// Option configures a Manager.
type Option func(*Manager)

// WithNsjailPath sets the path to the nsjail binary.
func WithNsjailPath(p string) Option { return func(m *Manager) { m.nsjailPath = p } }

// WithConfigPath sets the path to the nsjail protobuf config file.
func WithConfigPath(p string) Option { return func(m *Manager) { m.nsjailCfg = p } }

// WithBaseDir sets the base directory for sandbox working directories.
func WithBaseDir(p string) Option { return func(m *Manager) { m.baseDir = p } }

// WithTimeout sets the maximum execution time for each sandbox.
func WithTimeout(d time.Duration) Option { return func(m *Manager) { m.timeout = d } }

// NewManager creates a Manager with the given options.
// Defaults (suitable for the Docker container):
//
//	nsjailPath = "/usr/local/bin/nsjail"
//	nsjailCfg  = "/app/nsjail/config.cfg"
//	baseDir    = "/app/nsjail/tmp"
//	timeout    = 30s
func NewManager(opts ...Option) *Manager {
	m := &Manager{
		nsjailPath: "/usr/local/bin/nsjail",
		nsjailCfg:  "/app/nsjail/config.cfg",
		baseDir:    "/app/nsjail/tmp",
		timeout:    30 * time.Second,
		sandboxes:  make(map[string]*Sandbox),
	}
	for _, o := range opts {
		o(m)
	}
	return m
}

// Run creates a new sandbox, writes the Python code into an isolated
// working directory, and starts execution inside an nsjail container.
//
// The returned Sandbox exposes Stdin / Stdout / Stderr for real-time I/O.
// Each call gets its own UUID-keyed directory and process, so parallel
// calls never interfere with each other.
//
// The nsjail config already defines the new root filesystem (only the
// required system libraries and the Python binary are mounted).  The
// user's code directory is bind-mounted at /sandbox inside the jail,
// and nsjail executes /sandbox/main.py with unbuffered I/O (-u).
//
// Resources are released automatically when the process exits or times
// out.  The caller can also call Sandbox.Kill() at any time.
func (m *Manager) Run(ctx context.Context, code string) (*Sandbox, error) {
	if code == "" {
		return nil, fmt.Errorf("sandbox: code must not be empty")
	}

	id := uuid.New().String()

	// 1. Create an isolated working directory for this sandbox.
	workDir := filepath.Join(m.baseDir, id)
	if err := os.MkdirAll(workDir, 0755); err != nil {
		return nil, fmt.Errorf("sandbox: create work dir: %w", err)
	}

	// 2. Write the user's code as main.py.
	codePath := filepath.Join(workDir, "main.py")
	if err := os.WriteFile(codePath, []byte(code), 0644); err != nil {
		os.RemoveAll(workDir)
		return nil, fmt.Errorf("sandbox: write code file: %w", err)
	}

	// 3. Resolve absolute path for the bind mount.
	absWorkDir, err := filepath.Abs(workDir)
	if err != nil {
		os.RemoveAll(workDir)
		return nil, fmt.Errorf("sandbox: resolve abs path: %w", err)
	}

	// 4. Create a timeout context derived from the caller's context.
	timeoutCtx, cancel := context.WithTimeout(ctx, m.timeout)

	// 5. Build the nsjail command.
	//    --bindmount maps the working dir to /sandbox inside the jail.
	//    --log_fd 2  sends nsjail's own logs to stderr.
	//    The config's mount entries form the jail's root filesystem,
	//    keeping the sandbox completely isolated from the host.
	bindMount := fmt.Sprintf("%s:/sandbox", absWorkDir)
	cmd := exec.CommandContext(timeoutCtx, m.nsjailPath,
		"--config", m.nsjailCfg,
		"--bindmount", bindMount,
		"--log_fd", "2",
	)

	// 6. Set up stdio pipes for communication.
	stdin, err := cmd.StdinPipe()
	if err != nil {
		cancel()
		os.RemoveAll(workDir)
		return nil, fmt.Errorf("sandbox: stdin pipe: %w", err)
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		os.RemoveAll(workDir)
		return nil, fmt.Errorf("sandbox: stdout pipe: %w", err)
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		cancel()
		os.RemoveAll(workDir)
		return nil, fmt.Errorf("sandbox: stderr pipe: %w", err)
	}

	// 7. Start the process.
	if err := cmd.Start(); err != nil {
		cancel()
		os.RemoveAll(workDir)
		return nil, fmt.Errorf("sandbox: start nsjail: %w", err)
	}

	sb := &Sandbox{
		ID:      id,
		Stdin:   stdin,
		Stdout:  stdout,
		Stderr:  stderr,
		cmd:     cmd,
		workDir: workDir,
		cancel:  cancel,
		done:    make(chan struct{}),
	}

	// 8. Register before starting the monitor so KillAll can see it.
	m.mu.Lock()
	m.sandboxes[id] = sb
	m.mu.Unlock()

	// 9. Monitor the process in the background.
	go sb.monitor(timeoutCtx, m.remove)

	return sb, nil
}

// remove de-registers a sandbox from the manager.  Called automatically
// by the monitor goroutine when the process exits.
func (m *Manager) remove(id string) {
	m.mu.Lock()
	delete(m.sandboxes, id)
	m.mu.Unlock()
}

// Kill terminates a specific sandbox by its ID and waits for cleanup.
// Returns false if no sandbox with that ID is currently running.
func (m *Manager) Kill(id string) bool {
	m.mu.Lock()
	sb, ok := m.sandboxes[id]
	m.mu.Unlock()
	if !ok {
		return false
	}
	sb.Kill()
	return true
}

// KillAll terminates every running sandbox and waits for all of them to
// finish.  After this call all working directories have been removed.
func (m *Manager) KillAll() {
	m.mu.Lock()
	active := make([]*Sandbox, 0, len(m.sandboxes))
	for _, sb := range m.sandboxes {
		active = append(active, sb)
	}
	m.mu.Unlock()

	var wg sync.WaitGroup
	for _, sb := range active {
		wg.Add(1)
		go func(s *Sandbox) {
			defer wg.Done()
			s.Kill()
		}(sb)
	}
	wg.Wait()
}

// Count returns the number of currently active sandboxes.
func (m *Manager) Count() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.sandboxes)
}
