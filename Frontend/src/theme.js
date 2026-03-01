// ══════════════════════════════════════════════════════════════════════════════
// CodeRace — Shared theme constants (derived from CIELab color space)
// ══════════════════════════════════════════════════════════════════════════════

import { EditorView } from "@uiw/react-codemirror";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

/* ── Neon palette ────────────────────────────────────────────────────────── */

export const neon = {
  green:     "#84cc16",   // lab(75.32, -46.65, 86.18)  — primary
  blue:      "#00a5ff",   // lab(65.04, -1.42, -56.98)
  purple:    "#e46fff",   // lab(66.12, 66.07, -52.47)
  orange:    "#ff8800",   // lab(70.04, 42.52, 75.82)
  // Backward-compat aliases
  pink:      "#e46fff",
  gold:      "#ff8800",
  // Dim variants
  greenDim:  "#6ba812",
  blueDim:   "#0085cc",
  purpleDim: "#b85acc",
  pinkDim:   "#b85acc",
  orangeDim: "#cc6e00",
};

export const bg = {
  root:     "#000000",
  dark:     "#060606",
  panel:    "#0c0c0c",
  card:     "#111111",
  elevated: "#181818",
  input:    "#0a0a0a",
};

export const border = {
  default:  "#1e1e1e",
  light:    "#2a2a2a",
  focus:    neon.green,
};

export const text = {
  primary:   "#e0e0e0",
  secondary: "#888888",
  muted:     "#555555",
  dim:       "#333333",
};

export const glow = {
  green:  "0 0 12px rgba(132, 204, 22, 0.5)",
  blue:   "0 0 12px rgba(0, 165, 255, 0.5)",
  purple: "0 0 12px rgba(228, 111, 255, 0.5)",
  pink:   "0 0 12px rgba(228, 111, 255, 0.5)",
  orange: "0 0 12px rgba(255, 136, 0, 0.5)",
  gold:   "0 0 12px rgba(255, 136, 0, 0.5)",
};

export const font = {
  sans: "'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
  mono: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
};

export const radius = { sm: 4, md: 8, lg: 12 };

/* ── CodeMirror editor theme ────────────────────────────────────────────── */

const neonEditorTheme = EditorView.theme(
  {
    "&": {
      background: bg.dark,
      color: text.primary,
      fontFamily: font.mono,
    },
    ".cm-content": {
      caretColor: neon.green,
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: neon.green,
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      background: "rgba(0, 165, 255, 0.15)",
    },
    ".cm-activeLine": {
      background: "rgba(132, 204, 22, 0.04)",
    },
    ".cm-gutters": {
      background: bg.panel,
      color: "rgba(0, 165, 255, 0.3)",
      border: "none",
      borderRight: `1px solid ${border.default}`,
    },
    ".cm-activeLineGutter": {
      background: bg.elevated,
      color: "rgba(0, 165, 255, 0.55)",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      padding: "0 8px 0 4px",
    },
    ".cm-matchingBracket": {
      background: "rgba(132, 204, 22, 0.15)",
      color: `${neon.green} !important`,
      outline: `1px solid rgba(132, 204, 22, 0.3)`,
    },
    ".cm-foldPlaceholder": {
      background: bg.elevated,
      border: `1px solid ${border.light}`,
      color: text.muted,
    },
    ".cm-tooltip": {
      background: bg.card,
      border: `1px solid ${border.light}`,
      color: text.primary,
    },
    ".cm-tooltip-autocomplete": {
      "& > ul > li[aria-selected]": {
        background: "rgba(0, 165, 255, 0.1)",
        color: neon.blue,
      },
    },
  },
  { dark: true }
);

const neonHighlightStyle = HighlightStyle.define([
  // Keywords: purple
  { tag: tags.keyword,              color: neon.purple,   fontWeight: "600" },
  { tag: tags.controlKeyword,       color: neon.purple,   fontWeight: "600" },
  { tag: tags.operatorKeyword,      color: neon.purple },
  { tag: tags.moduleKeyword,        color: neon.purple },

  // Functions & methods: blue
  { tag: tags.function(tags.variableName), color: neon.blue },
  { tag: tags.function(tags.propertyName), color: neon.blue },
  { tag: tags.definition(tags.variableName), color: neon.blue },

  // Strings: green
  { tag: tags.string,               color: neon.green },
  { tag: tags.special(tags.string), color: neon.greenDim },
  { tag: tags.regexp,               color: neon.orange },

  // Numbers: orange
  { tag: tags.number,               color: neon.orange },
  { tag: tags.bool,                 color: neon.orange },
  { tag: tags.null,                 color: neon.orange },

  // Variables
  { tag: tags.variableName,         color: text.primary },
  { tag: tags.propertyName,         color: "#b0b0b0" },

  // Types & classes: blue
  { tag: tags.typeName,             color: neon.blue },
  { tag: tags.className,            color: neon.blue },
  { tag: tags.namespace,            color: neon.blue },

  // Comments: subtle muted green
  { tag: tags.comment,              color: "#3a5136",      fontStyle: "italic" },
  { tag: tags.lineComment,          color: "#3a5136",      fontStyle: "italic" },
  { tag: tags.blockComment,         color: "#3a5136",      fontStyle: "italic" },

  // Operators & punctuation
  { tag: tags.operator,             color: neon.purpleDim },
  { tag: tags.punctuation,          color: text.secondary },
  { tag: tags.bracket,              color: text.secondary },
  { tag: tags.paren,                color: text.secondary },
  { tag: tags.squareBracket,        color: text.secondary },
  { tag: tags.brace,                color: text.secondary },

  // Decorators / meta
  { tag: tags.meta,                 color: neon.orangeDim },
  { tag: tags.annotation,           color: neon.orangeDim },
  { tag: tags.self,                 color: neon.purple,    fontStyle: "italic" },
]);

/** Drop-in replacement for oneDark — neon-themed CodeMirror extensions */
export const neonCodeTheme = [neonEditorTheme, syntaxHighlighting(neonHighlightStyle)];
