#!/usr/bin/env bash
# tests/run_sync_test.sh
#
# Regenerates the Go golden output and validates the JS physics engine
# produces identical results tick-by-tick.
#
# Usage:  bash tests/run_sync_test.sh   (from project root)

set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== Step 1: Generate golden output from Go engine ==="
(cd Backend && go test ./engine/racer/ -run TestGenerateGolden -v)

echo ""
echo "=== Step 2: Validate JS engine against golden output ==="
(cd Frontend && npx vitest run)

echo ""
echo "=== ALL SYNC TESTS PASSED ==="
