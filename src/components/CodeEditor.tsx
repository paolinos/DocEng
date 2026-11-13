import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import {
  Compartment,
  EditorState,
  StateEffect,
  StateField,
  Transaction,
} from "@codemirror/state";
import type { Extension, Range } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import {
  LanguageDescription,
  bracketMatching,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { yaml } from "@codemirror/lang-yaml";
import { languages } from "@codemirror/language-data";
import { docEngHighlightStyle, docEngTheme } from "../lib/editorTheme";
import type { SearchMatch } from "../lib/search";
import { basename } from "../lib/utils";
import type { DocumentKind } from "../types";

export interface CodeEditorHandle {
  focus: () => void;
  revealRange: (
    start: number,
    end: number,
    options?: { focus?: boolean },
  ) => void;
}

interface CodeEditorProps {
  content: string;
  kind: DocumentKind;
  language: string | null;
  path: string | null;
  ariaLabel: string;
  spellCheck: boolean;
  matches: readonly SearchMatch[];
  activeMatchIndex: number;
  onChange: (content: string) => void;
}

interface EditorSearchState {
  matches: readonly SearchMatch[];
  activeIndex: number;
}

const setSearchMatches = StateEffect.define<EditorSearchState>();

/**
 * Layer-match search highlights. Passing `matches` as the sole source in
 * `Decoration.set` sorts and deduplicates the ranges.
 */
function buildMatchDecorations(
  matches: readonly SearchMatch[],
  activeIndex: number,
  documentLength: number,
): DecorationSet {
  const marks: Range<Decoration>[] = [];

  matches.forEach((match, index) => {
    const from = Math.max(0, Math.min(match.start, documentLength));
    const to = Math.max(from, Math.min(match.end, documentLength));
    if (to <= from) return;

    marks.push(
      Decoration.mark({
        class:
          index === activeIndex
            ? "cm-find-match cm-find-match--active"
            : "cm-find-match",
      }).range(from, to),
    );
  });

  return Decoration.set(marks, true);
}

/** Find-in-file highlights layered above the syntax highlighting. */
const searchMatchField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    decorations = decorations.map(transaction.changes);

    for (const effect of transaction.effects) {
      if (!effect.is(setSearchMatches)) continue;

      return buildMatchDecorations(
        effect.value.matches,
        effect.value.activeIndex,
        transaction.state.doc.length,
      );
    }

    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

function languageDescriptionFor(
  kind: DocumentKind,
  language: string | null,
  path: string | null,
): LanguageDescription | null {
  if (kind !== "code" || language === null) return null;

  return (
    (path === null
      ? null
      : LanguageDescription.matchFilename(languages, basename(path))) ??
    LanguageDescription.matchLanguageName(languages, language, true)
  );
}

function languageExtensionFor(
  kind: DocumentKind,
  language: string | null,
  path: string | null,
): Extension {
  if (kind === "markdown") {
    return markdown({ codeLanguages: languages });
  }

  if (kind === "code" && language === "YAML") {
    return yaml();
  }

  const description = languageDescriptionFor(kind, language, path);
  return description?.support ?? [];
}

function contentAttributes(
  ariaLabel: string,
  spellCheck: boolean,
): Extension {
  return EditorView.contentAttributes.of({
    "aria-label": ariaLabel,
    spellcheck: spellCheck ? "true" : "false",
  });
}

export const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(
  function CodeEditor(
    {
      content,
      kind,
      language,
      path,
      ariaLabel,
      spellCheck,
      matches,
      activeMatchIndex,
      onChange,
    },
    ref,
  ) {
    const hostRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onChangeRef = useRef(onChange);
    const languageCompartment = useRef(new Compartment());
    const attributesCompartment = useRef(new Compartment());

    onChangeRef.current = onChange;

    useImperativeHandle(
      ref,
      () => ({
        focus: () => viewRef.current?.focus(),
        revealRange: (start, end, options) => {
          const view = viewRef.current;
          if (!view) return;

          const documentLength = view.state.doc.length;
          const from = Math.max(0, Math.min(start, documentLength));
          const to = Math.max(from, Math.min(end, documentLength));

          view.dispatch({
            selection: { anchor: from, head: to },
            effects: EditorView.scrollIntoView(from, { y: "center" }),
          });

          if (options?.focus) view.focus();
        },
      }),
      [],
    );

    useEffect(() => {
      const parent = hostRef.current;
      if (!parent) return;

      const state = EditorState.create({
        doc: content,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          history(),
          drawSelection(),
          indentOnInput(),
          indentUnit.of("  "),
          EditorState.tabSize.of(2),
          bracketMatching(),
          highlightActiveLine(),
          syntaxHighlighting(docEngHighlightStyle),
          EditorView.lineWrapping,
          searchMatchField,
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            onChangeRef.current(update.state.doc.toString());
          }),
          languageCompartment.current.of(
            languageExtensionFor(kind, language, path),
          ),
          attributesCompartment.current.of(
            contentAttributes(ariaLabel, spellCheck),
          ),
          docEngTheme,
        ],
      });

      const view = new EditorView({ state, parent });
      viewRef.current = view;

      requestAnimationFrame(() => view.focus());

      return () => {
        view.destroy();
        viewRef.current = null;
      };
      // The component is keyed by document id, so the initial document and
      // language are only read once. Later changes are handled by the effects
      // below.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;

      const extension = languageExtensionFor(kind, language, path);

      view.dispatch({
        effects: languageCompartment.current.reconfigure(extension),
      });
    }, [kind, language, path]);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;

      view.dispatch({
        effects: attributesCompartment.current.reconfigure(
          contentAttributes(ariaLabel, spellCheck),
        ),
      });
    }, [ariaLabel, spellCheck]);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;

      view.dispatch({
        effects: setSearchMatches.of({
          matches,
          activeIndex: activeMatchIndex,
        }),
      });
    }, [matches, activeMatchIndex]);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      if (view.state.doc.toString() === content) return;

      const selection = view.state.selection.main;

      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: content },
        selection: {
          anchor: Math.min(selection.anchor, content.length),
          head: Math.min(selection.head, content.length),
        },
        annotations: Transaction.addToHistory.of(false),
      });
    }, [content]);

    return <div className="code-editor" ref={hostRef} />;
  },
);
