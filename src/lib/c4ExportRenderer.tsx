import type { LayoutedView } from "@likec4/core/types";
import { createRoot } from "react-dom/client";
import { useCallback, useRef } from "react";
import {
  LikeC4Diagram,
  LikeC4MantineProvider,
  LikeC4ModelProvider,
  pickViewBounds,
} from "likec4/react";
import { toJpeg, toPng } from "html-to-image";
import type { C4Model } from "./likec4";

const IMAGE_PLACEHOLDER =
  "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

// Extra slack around the computed bounds, matching LikeC4's own export page.
const EXPORT_EXTRA_PADDING = 16;

interface ExportDiagramProps {
  model: C4Model;
  view: LayoutedView;
  format: "png" | "jpeg";
  padding: number;
  onCapture: (dataUrl: string) => void;
  onError: (error: unknown) => void;
}

function ExportDiagram({
  model,
  view,
  format,
  padding,
  onCapture,
  onError,
}: ExportDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const capturedRef = useRef(false);

  const handleInitialized = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const bounds = pickViewBounds(view);
    const x = Math.round(-bounds.x + padding);
    const y = Math.round(-bounds.y + padding);

    container
      .querySelectorAll(".react-flow__viewport")
      .forEach((element) => {
        (element as HTMLElement).style.transform = `translate(${x}px, ${y}px)`;
      });

    window.setTimeout(() => {
      void (async () => {
        try {
          const dataUrl =
            format === "jpeg"
              ? await toJpeg(container, {
                  backgroundColor: "#ffffff",
                  cacheBust: true,
                  imagePlaceholder: IMAGE_PLACEHOLDER,
                })
              : await toPng(container, {
                  backgroundColor: "transparent",
                  cacheBust: true,
                  imagePlaceholder: IMAGE_PLACEHOLDER,
                });

          if (!capturedRef.current) {
            capturedRef.current = true;
            onCapture(dataUrl);
          }
        } catch (error) {
          if (!capturedRef.current) {
            capturedRef.current = true;
            onError(error);
          }
        }
      })();
    }, 500);
  }, [view, format, padding, onCapture, onError]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <LikeC4ModelProvider likec4model={model as never}>
        <LikeC4MantineProvider defaultColorScheme="dark">
          <LikeC4Diagram
            view={view}
            className="likec4-static-view"
            fitView={false}
            fitViewPadding={0}
            background={format === "jpeg" ? "solid" : "transparent"}
            reduceGraphics={false}
            pannable={false}
            zoomable={false}
            controls={false}
            enableNotations={false}
            enableElementDetails={false}
            enableRelationshipDetails={false}
            enableRelationshipBrowser={false}
            enableDynamicViewWalkthrough={false}
            enableFocusMode={false}
            enableSearch={false}
            nodesSelectable={false}
            enableElementTags={false}
            onInitialized={handleInitialized}
          />
        </LikeC4MantineProvider>
      </LikeC4ModelProvider>
    </div>
  );
}

function dataUrlToBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) {
    throw new Error("Invalid image data URL");
  }
  return dataUrl.slice(comma + 1);
}

export async function renderC4ViewToBase64(
  model: C4Model,
  view: LayoutedView,
  format: "png" | "jpeg",
  padding = 20,
): Promise<string> {
  const bounds = pickViewBounds(view);
  const width = Math.ceil(bounds.width + padding * 2 + EXPORT_EXTRA_PADDING);
  const height = Math.ceil(bounds.height + padding * 2 + EXPORT_EXTRA_PADDING);

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-100vw";
  container.style.top = "0";
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  container.style.visibility = "visible";
  container.style.overflow = "hidden";
  container.style.pointerEvents = "none";
  container.style.zIndex = "-1";
  document.body.appendChild(container);

  const root = createRoot(container);

  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      root.render(
        <ExportDiagram
          model={model}
          view={view}
          format={format}
          padding={padding}
          onCapture={resolve}
          onError={reject}
        />,
      );
    });
    return dataUrlToBase64(dataUrl);
  } finally {
    root.unmount();
    container.remove();
  }
}
