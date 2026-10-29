import type { Mermaid } from "mermaid";

/**
 * Mermaid is several hundred kilobytes, so it is loaded on demand the first
 * time a Markdown document contains a Mermaid fence. The promise is shared by
 * every diagram instance in the app.
 */
let mermaidPromise: Promise<Mermaid> | null = null;

export function loadMermaid(): Promise<Mermaid> {
  if (mermaidPromise === null) {
    mermaidPromise = import("mermaid").then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "dark",
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        themeVariables: {
          background: "#11141b",
          primaryColor: "#1d2230",
          primaryTextColor: "#e8ebf2",
          primaryBorderColor: "#3a4459",
          secondaryColor: "#171b24",
          tertiaryColor: "#11141b",
          lineColor: "#737c91",
          textColor: "#c7cede",
          mainBkg: "#171b24",
          nodeBorder: "#3a4459",
          clusterBkg: "#11141b",
          clusterBorder: "#2e3647",
          edgeLabelBackground: "#11141b",
        },
      });

      return mermaid;
    });
  }

  return mermaidPromise;
}
