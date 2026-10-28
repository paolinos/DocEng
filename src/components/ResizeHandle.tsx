import { useRef } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { clamp } from "../lib/utils";
import {
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  useUiStore,
} from "../stores/uiStore";

interface ResizeHandleProps {
  width: number;
}

interface DragState {
  startX: number;
  startWidth: number;
  containerWidth: number;
}

export function ResizeHandle({ width }: ResizeHandleProps) {
  const setSidebarWidth = useUiStore((state) => state.setSidebarWidth);
  const dragRef = useRef<DragState | null>(null);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    const container = event.currentTarget.parentElement;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    dragRef.current = {
      startX: event.clientX,
      startWidth: (rect.width * width) / 100,
      containerWidth: rect.width,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.classList.add("is-resizing");
    event.preventDefault();
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;

    const nextWidth =
      ((drag.startWidth + (event.clientX - drag.startX)) / drag.containerWidth) *
      100;
    setSidebarWidth(nextWidth);
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    dragRef.current = null;
    document.body.classList.remove("is-resizing");

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Home") {
      event.preventDefault();
      setSidebarWidth(SIDEBAR_MIN);
    } else if (event.key === "End") {
      event.preventDefault();
      setSidebarWidth(SIDEBAR_MAX);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const delta = event.key === "ArrowLeft" ? -1 : 1;
      setSidebarWidth(clamp(width + delta, SIDEBAR_MIN, SIDEBAR_MAX));
    }
  }

  return (
    <div
      className="resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuemin={SIDEBAR_MIN}
      aria-valuemax={SIDEBAR_MAX}
      aria-valuenow={Math.round(width)}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => setSidebarWidth(30)}
      onKeyDown={onKeyDown}
    >
      <span className="resize-handle__grip" aria-hidden="true" />
    </div>
  );
}
