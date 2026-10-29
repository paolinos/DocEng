import { useEffect, useState } from "react";
import { ImageOff, Maximize, ZoomIn, ZoomOut } from "lucide-react";
import { formatBytes } from "../lib/utils";
import type { OpenDocument } from "../types";

type Zoom = "fit" | number;

interface ImagePreviewProps {
  doc: OpenDocument;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;

export function ImagePreview({ doc }: ImagePreviewProps) {
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [failed, setFailed] = useState(false);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(
    null,
  );

  const dataUrl = doc.image?.dataUrl ?? null;

  useEffect(() => {
    setZoom("fit");
    setFailed(false);
    setNatural(null);
  }, [doc.id, dataUrl]);

  const zoomIn = () =>
    setZoom((current) =>
      Math.min(MAX_ZOOM, (current === "fit" ? 1 : current) + 0.25),
    );

  const zoomOut = () =>
    setZoom((current) =>
      Math.max(MIN_ZOOM, (current === "fit" ? 1 : current) - 0.25),
    );

  const mimeType = doc.image?.mimeType ?? "image";
  const scaledStyle =
    zoom !== "fit" && natural
      ? {
          width: `${natural.width * zoom}px`,
          height: `${natural.height * zoom}px`,
        }
      : undefined;

  return (
    <div className="image-preview">
      <div className="image-preview__toolbar">
        <span className="image-preview__name" title={doc.path ?? doc.name}>
          {doc.name}
        </span>
        <span className="image-preview__meta">
          {mimeType.replace(/^image\//, "").toUpperCase()} ·{" "}
          {formatBytes(doc.size)}
        </span>

        <div className="image-preview__spacer" />

        <div className="image-preview__controls" role="group" aria-label="Image zoom">
          <button
            type="button"
            className="icon-button image-preview__button"
            title="Fit to window"
            aria-label="Fit to window"
            aria-pressed={zoom === "fit"}
            onClick={() => setZoom("fit")}
          >
            <Maximize size={14} />
          </button>
          <button
            type="button"
            className="image-preview__button image-preview__button--text"
            title="Actual size"
            aria-label="Actual size"
            aria-pressed={zoom === 1}
            onClick={() => setZoom(1)}
          >
            100%
          </button>
          <button
            type="button"
            className="icon-button image-preview__button"
            title="Zoom out"
            aria-label="Zoom out"
            onClick={zoomOut}
          >
            <ZoomOut size={14} />
          </button>
          <span className="image-preview__zoom">
            {zoom === "fit" ? "Fit" : `${Math.round(zoom * 100)}%`}
          </span>
          <button
            type="button"
            className="icon-button image-preview__button"
            title="Zoom in"
            aria-label="Zoom in"
            onClick={zoomIn}
          >
            <ZoomIn size={14} />
          </button>
        </div>
      </div>

      <div className="image-preview__canvas">
        {failed || dataUrl === null ? (
          <div className="image-preview__error" role="alert">
            <ImageOff size={28} strokeWidth={1.5} />
            <p>This image could not be displayed.</p>
            <span>{doc.path ?? doc.name}</span>
          </div>
        ) : (
          <img
            key={doc.id}
            className={
              zoom === "fit"
                ? "image-preview__image image-preview__image--fit"
                : "image-preview__image"
            }
            src={dataUrl}
            alt={doc.name}
            draggable={false}
            style={scaledStyle}
            onLoad={(event) => {
              const { naturalWidth, naturalHeight } = event.currentTarget;
              if (naturalWidth > 0 && naturalHeight > 0) {
                setNatural({
                  width: naturalWidth,
                  height: naturalHeight,
                });
              }
            }}
            onError={() => setFailed(true)}
          />
        )}
      </div>
    </div>
  );
}
