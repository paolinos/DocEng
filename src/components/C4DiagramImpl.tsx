import { LikeC4ModelProvider, LikeC4View } from "likec4/react";
import type { C4Model } from "../lib/likec4";

interface C4DiagramImplProps {
  model: C4Model;
  viewId: string;
  compact?: boolean;
}

/**
 * This module statically imports `likec4/react` and is loaded with
 * `React.lazy` from `C4Diagram`, keeping LikeC4 out of the main bundle.
 */
export default function C4DiagramImpl({
  model,
  viewId,
  compact,
}: C4DiagramImplProps) {
  return (
    <LikeC4ModelProvider likec4model={model}>
      <LikeC4View
        viewId={viewId}
        className={
          compact
            ? "c4-diagram__view c4-diagram__view--compact"
            : "c4-diagram__view"
        }
        pannable
        zoomable
        background="dots"
        colorScheme="dark"
        controls={!compact}
        enableElementDetails
        enableRelationshipDetails
        enableNotes
        enableFocusMode
        style={{ width: "100%", height: "100%" }}
      />
    </LikeC4ModelProvider>
  );
}
