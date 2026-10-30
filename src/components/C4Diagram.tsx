import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  parseC4Source,
  type C4Diagnostic,
  type C4Model,
  type C4ViewSummary,
} from "../lib/likec4";

const C4DiagramImpl = lazy(() => import("./C4DiagramImpl"));

const RENDER_DELAY_MS = 300;

interface C4DiagramProps {
  source: string;
  className?: string;
  viewId?: string;
  compact?: boolean;
  onViewsChange?: (views: C4ViewSummary[]) => void;
  onDiagnostics?: (diagnostics: C4Diagnostic[]) => void;
}

type DiagramState =
  | { status: "empty" }
  | { status: "loading" }
  | {
      status: "ready";
      model: C4Model;
      views: C4ViewSummary[];
      diagnostics: C4Diagnostic[];
    }
  | {
      status: "error";
      message: string;
      diagnostics: C4Diagnostic[];
    };

const NO_VIEWS: C4ViewSummary[] = [];
const NO_DIAGNOSTICS: C4Diagnostic[] = [];

function describeError(error: unknown): string {
  if (typeof error === "string" && error.trim().length > 0) return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }

  return "The diagram could not be rendered.";
}

function pickViewId(
  views: C4ViewSummary[],
  preferred: string | null,
): string | null {
  if (preferred !== null && views.some((view) => view.id === preferred)) {
    return preferred;
  }

  const index = views.find((view) => view.id === "index");
  return index?.id ?? views[0]?.id ?? null;
}

function DiagnosticList({ diagnostics }: { diagnostics: C4Diagnostic[] }) {
  if (diagnostics.length === 0) return null;

  return (
    <ul className="c4-diagram__diagnostics" aria-live="polite">
      {diagnostics.map((diagnostic, index) => (
        <li key={`${diagnostic.line}:${diagnostic.column}:${index}`}>
          <span className="c4-diagram__diagnostic-location">
            {diagnostic.line}:{diagnostic.column}
          </span>{" "}
          {diagnostic.message}
        </li>
      ))}
    </ul>
  );
}

export function C4Diagram({
  source,
  className,
  viewId,
  compact = false,
  onViewsChange,
  onDiagnostics,
}: C4DiagramProps) {
  const [state, setState] = useState<DiagramState>({ status: "loading" });
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null);

  const onViewsChangeRef = useRef(onViewsChange);
  const onDiagnosticsRef = useRef(onDiagnostics);

  useEffect(() => {
    onViewsChangeRef.current = onViewsChange;
    onDiagnosticsRef.current = onDiagnostics;
  }, [onViewsChange, onDiagnostics]);

  useEffect(() => {
    if (source.trim().length === 0) {
      setState({ status: "empty" });
      return;
    }

    setState({ status: "loading" });

    const controller = new AbortController();
    let cancelled = false;

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await parseC4Source(source, controller.signal);
          if (cancelled) return;

          if (result.ok) {
            setState({
              status: "ready",
              model: result.model,
              views: result.views,
              diagnostics: result.diagnostics,
            });
          } else {
            setState({
              status: "error",
              message: result.error,
              diagnostics: result.diagnostics,
            });
          }
        } catch (error) {
          if (cancelled || controller.signal.aborted) return;

          setState({
            status: "error",
            message: describeError(error),
            diagnostics: [],
          });
        }
      })();
    }, RENDER_DELAY_MS);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [source]);

  useEffect(() => {
    if (state.status === "ready") {
      onViewsChangeRef.current?.(state.views);
      onDiagnosticsRef.current?.(state.diagnostics);
    } else if (state.status === "error") {
      onViewsChangeRef.current?.(NO_VIEWS);
      onDiagnosticsRef.current?.(state.diagnostics);
    } else {
      onViewsChangeRef.current?.(NO_VIEWS);
      onDiagnosticsRef.current?.(NO_DIAGNOSTICS);
    }
  }, [state]);

  const views = state.status === "ready" ? state.views : NO_VIEWS;
  const activeViewId = pickViewId(views, selectedViewId ?? viewId ?? null);

  const classes = ["c4-diagram", compact ? "c4-diagram--compact" : null, className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      {state.status === "ready" && state.diagnostics.length > 0 ? (
        <DiagnosticList diagnostics={state.diagnostics} />
      ) : null}

      {state.status === "ready" ? (
        views.length > 0 && activeViewId !== null ? (
          <>
            {views.length > 1 ? (
              <div className="c4-diagram__toolbar">
                <label className="c4-diagram__view-selector">
                  <span>View</span>
                  <select
                    value={activeViewId}
                    onChange={(event) => setSelectedViewId(event.target.value)}
                  >
                    {views.map((view) => (
                      <option key={view.id} value={view.id}>
                        {view.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}

            <div className="c4-diagram__viewport">
              <Suspense
                fallback={
                  <div className="c4-diagram__loading" aria-live="polite">
                    Rendering diagram…
                  </div>
                }
              >
                <C4DiagramImpl
                  model={state.model}
                  viewId={activeViewId}
                  compact={compact}
                />
              </Suspense>
            </div>
          </>
        ) : (
          <div className="c4-diagram__empty">
            This LikeC4 source does not declare any views.
          </div>
        )
      ) : state.status === "error" ? (
        <div className="c4-diagram__error" role="alert">
          <p className="c4-diagram__error-message">
            Diagram error: <code>{state.message}</code>
          </p>
          <DiagnosticList diagnostics={state.diagnostics} />
          <pre className="c4-diagram__source">
            <code>{source}</code>
          </pre>
        </div>
      ) : state.status === "empty" ? (
        <div className="c4-diagram__empty">No LikeC4 source to render.</div>
      ) : (
        <div className="c4-diagram__loading" aria-live="polite">
          Rendering diagram…
        </div>
      )}
    </div>
  );
}
