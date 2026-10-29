import { useEffect, useId, useRef, useState } from "react";
import { loadMermaid } from "../lib/mermaid";

interface MermaidDiagramProps {
  source: string;
  className?: string;
}

type RenderState =
  | { status: "loading" }
  | { status: "ready"; svg: string }
  | { status: "error"; message: string };

const RENDER_DELAY_MS = 250;

let diagramSequence = 0;

function describeError(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }

  return "The diagram could not be rendered.";
}

/**
 * Mermaid temporarily appends helper nodes to the document while rendering.
 * Failed renders can leave them behind, so they are removed explicitly.
 */
function removeStrayNodes(renderId: string): void {
  for (const id of [renderId, `d${renderId}`]) {
    document.getElementById(id)?.remove();
  }
}

export function MermaidDiagram({ source, className }: MermaidDiagramProps) {
  const reactId = useId();
  const baseId = reactId.replace(/[^a-zA-Z0-9_-]/g, "") || "diagram";
  const [state, setState] = useState<RenderState>({ status: "loading" });
  const attempt = useRef(0);

  useEffect(() => {
    const trimmed = source.trim();

    if (trimmed.length === 0) {
      setState({ status: "loading" });
      return;
    }

    setState({ status: "loading" });

    let cancelled = false;
    let renderId: string | null = null;
    const timer = window.setTimeout(() => {
      renderId = `mermaid-${baseId}-${diagramSequence++}-${attempt.current++}`;
      const currentId = renderId;

      void (async () => {
        try {
          const mermaid = await loadMermaid();
          if (cancelled) return;

          await mermaid.parse(trimmed);
          if (cancelled) return;

          const { svg } = await mermaid.render(currentId, trimmed);
          if (cancelled) return;

          setState({ status: "ready", svg });
        } catch (error) {
          if (cancelled) return;

          removeStrayNodes(currentId);
          setState({ status: "error", message: describeError(error) });
        }
      })();
    }, RENDER_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (renderId !== null) removeStrayNodes(renderId);
    };
  }, [source, baseId]);

  const classes = className
    ? `mermaid-diagram ${className}`
    : "mermaid-diagram";

  return (
    <div className={classes}>
      {state.status === "ready" ? (
        <div
          className="mermaid-diagram__svg"
          dangerouslySetInnerHTML={{ __html: state.svg }}
        />
      ) : state.status === "error" ? (
        <div className="mermaid-diagram__error" role="alert">
          <p className="mermaid-diagram__error-message">
            Diagram error: <code>{state.message}</code>
          </p>
          <pre className="mermaid-diagram__source">
            <code>{source}</code>
          </pre>
        </div>
      ) : (
        <div className="mermaid-diagram__loading" aria-live="polite">
          Rendering diagram…
        </div>
      )}
    </div>
  );
}
