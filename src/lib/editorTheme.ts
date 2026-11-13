import { HighlightStyle } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

const MONOSPACE_FONT =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

/**
 * Chrome for the embedded CodeMirror editor. Colors are pulled from the app
 * theme so the editor blends into the surrounding dark UI.
 */
export const docEngTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      color: "var(--text)",
      backgroundColor: "transparent",
      fontSize: "13px",
    },
    "&.cm-focused": {
      outline: "none",
    },
    ".cm-scroller": {
      fontFamily: MONOSPACE_FONT,
      lineHeight: "1.7",
      overflow: "auto",
    },
    ".cm-content": {
      padding: "20px 0 40px",
      caretColor: "var(--accent)",
    },
    ".cm-line": {
      padding: "0 24px",
    },
    ".cm-gutters": {
      border: "none",
      borderRight: "1px solid var(--border)",
      backgroundColor: "rgba(17, 20, 27, 0.45)",
      color: "var(--text-muted)",
      fontFamily: MONOSPACE_FONT,
      fontSize: "12px",
      lineHeight: "1.7",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      minWidth: "32px",
      padding: "0 12px 0 16px",
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: "var(--text-secondary)",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(124, 156, 255, 0.045)",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--accent)",
    },
    ".cm-selectionBackground, .cm-content ::selection":
      {
        backgroundColor: "rgba(124, 156, 255, 0.28)",
      },
    ".cm-selectionMatch": {
      backgroundColor: "rgba(124, 156, 255, 0.16)",
    },
    ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
      backgroundColor: "rgba(124, 156, 255, 0.2)",
      outline: "1px solid rgba(124, 156, 255, 0.35)",
    },
    ".cm-nonmatchingBracket": {
      color: "var(--danger)",
    },
    ".cm-find-match": {
      borderRadius: "2px",
      backgroundColor: "rgba(250, 204, 21, 0.24)",
      boxShadow: "0 0 0 1px rgba(250, 204, 21, 0.32)",
    },
    ".cm-find-match--active": {
      backgroundColor: "rgba(249, 115, 22, 0.42)",
      boxShadow: "0 0 0 1px rgba(249, 115, 22, 0.85)",
    },
  },
  { dark: true },
);

/**
 * Syntax colors for Markdown and the code languages loaded on demand by
 * `@codemirror/language-data`.
 */
export const docEngHighlightStyle = HighlightStyle.define([
  {
    tag: [
      tags.keyword,
      tags.modifier,
      tags.controlKeyword,
      tags.moduleKeyword,
      tags.definitionKeyword,
      tags.operatorKeyword,
    ],
    color: "#c792ea",
  },
  {
    tag: [tags.string, tags.docString, tags.character, tags.attributeValue],
    color: "#a5e075",
  },
  {
    tag: [
      tags.number,
      tags.integer,
      tags.float,
      tags.bool,
      tags.null,
      tags.atom,
      tags.unit,
    ],
    color: "#f78c6c",
  },
  {
    tag: [
      tags.comment,
      tags.lineComment,
      tags.blockComment,
      tags.docComment,
    ],
    color: "#667085",
    fontStyle: "italic",
  },
  {
    tag: [tags.variableName, tags.propertyName],
    color: "#d7dceb",
  },
  {
    tag: [tags.definition(tags.variableName), tags.local(tags.variableName)],
    color: "#82aaff",
  },
  {
    tag: [
      tags.function(tags.variableName),
      tags.function(tags.propertyName),
      tags.labelName,
    ],
    color: "#82aaff",
  },
  {
    tag: [tags.typeName, tags.className, tags.namespace],
    color: "#ffcb6b",
  },
  {
    tag: tags.tagName,
    color: "#f07178",
  },
  {
    tag: tags.attributeName,
    color: "#80cbc4",
  },
  {
    tag: [
      tags.operator,
      tags.punctuation,
      tags.bracket,
      tags.separator,
      tags.angleBracket,
      tags.squareBracket,
      tags.paren,
      tags.brace,
    ],
    color: "#89ddff",
  },
  {
    tag: [tags.regexp, tags.escape, tags.special(tags.string)],
    color: "#f78c6c",
  },
  {
    tag: [
      tags.heading,
      tags.heading1,
      tags.heading2,
      tags.heading3,
      tags.heading4,
      tags.heading5,
      tags.heading6,
    ],
    color: "#c792ea",
    fontWeight: "700",
  },
  {
    tag: tags.strong,
    color: "#f0f3fa",
    fontWeight: "700",
  },
  {
    tag: tags.emphasis,
    fontStyle: "italic",
  },
  {
    tag: tags.strikethrough,
    textDecoration: "line-through",
  },
  {
    tag: [tags.link, tags.url],
    color: "#82aaff",
    textDecoration: "underline",
  },
  {
    tag: tags.monospace,
    color: "#ffcb6b",
  },
  {
    tag: tags.quote,
    color: "#a3abc0",
    fontStyle: "italic",
  },
  {
    tag: tags.list,
    color: "#89ddff",
  },
  {
    tag: [
      tags.meta,
      tags.documentMeta,
      tags.annotation,
      tags.processingInstruction,
    ],
    color: "#737c91",
  },
  {
    tag: tags.inserted,
    color: "#56d19a",
  },
  {
    tag: tags.deleted,
    color: "#ff7a90",
  },
  {
    tag: tags.changed,
    color: "#f2c14e",
  },
  {
    tag: tags.invalid,
    color: "#ff7a90",
    textDecoration: "underline wavy",
  },
]);
