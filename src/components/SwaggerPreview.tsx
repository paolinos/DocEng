import * as React from "react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { load } from "js-yaml";
import asyncApiRendererUrl from "@asyncapi/react-component/browser/index.js?url";
import "swagger-ui-react/swagger-ui.css";
import "@asyncapi/react-component/styles/default.css";
import "../styles/swagger-preview.css";
import { apiSpecKind } from "../lib/apiSpec";

type AsyncApiRenderer = React.ComponentType<{ schema: Record<string, unknown> }>;

declare global {
  interface Window {
    AsyncApiComponent?: AsyncApiRenderer;
    React?: typeof React;
  }
}

let asyncApiRendererPromise: Promise<AsyncApiRenderer> | undefined;

function loadAsyncApiRenderer(): Promise<AsyncApiRenderer> {
  if (window.AsyncApiComponent) return Promise.resolve(window.AsyncApiComponent);
  if (asyncApiRendererPromise) return asyncApiRendererPromise;

  const previousReact = window.React;
  window.React = React;
  const script = document.createElement("script");
  script.src = asyncApiRendererUrl;
  script.async = true;

  const loading = new Promise<AsyncApiRenderer>((resolve, reject) => {
    script.onload = () => {
      window.React = previousReact;
      if (window.AsyncApiComponent) resolve(window.AsyncApiComponent);
      else reject(new Error("The AsyncAPI renderer loaded but did not register its component."));
    };
    script.onerror = () => {
      window.React = previousReact;
      script.remove();
      reject(new Error("Unable to load the AsyncAPI renderer bundle."));
    };
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    asyncApiRendererPromise = undefined;
    throw error;
  });
  asyncApiRendererPromise = loading;
  return loading;
}

class PreviewErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="api-preview__error" role="alert">
          <strong>Could not render this AsyncAPI document</strong>
          <pre>{this.state.error.message}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function AsyncApiPreview({ schema }: { schema: Record<string, unknown> }) {
  const [Renderer, setRenderer] = useState<AsyncApiRenderer | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    loadAsyncApiRenderer().then(
      (renderer) => {
        if (mounted) setRenderer(() => renderer);
      },
      (reason: unknown) => {
        if (mounted) setError(reason instanceof Error ? reason.message : "Unable to load the AsyncAPI renderer.");
      },
    );
    return () => {
      mounted = false;
    };
  }, []);

  if (error) {
    return (
      <div className="api-preview__error" role="alert">
        <strong>Could not load the AsyncAPI renderer</strong>
        <pre>{error}</pre>
      </div>
    );
  }
  if (!Renderer) return <div className="api-preview__message">Loading AsyncAPI preview…</div>;

  return (
    <PreviewErrorBoundary>
      <Renderer schema={schema} />
    </PreviewErrorBoundary>
  );
}

const SwaggerUI = lazy(() => import("swagger-ui-react"));

interface SwaggerPreviewProps {
  source: string;
  name: string;
}

export function SwaggerPreview({ source, name }: SwaggerPreviewProps) {
  const kind = apiSpecKind(name, source);
  const parsed = useMemo(() => {
    if (!kind) return { spec: null, error: null };
    try {
      const value: unknown = load(source);
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return { spec: null, error: "The API document must contain a YAML mapping." };
      }
      const spec = value as Record<string, unknown>;
      if (typeof spec[kind] !== "string") {
        return { spec: null, error: `The ${kind} version field is missing or invalid.` };
      }
      return { spec, error: null };
    } catch (error) {
      return {
        spec: null,
        error: error instanceof Error ? error.message : "Unable to parse the YAML document.",
      };
    }
  }, [kind, source]);

  if (!kind) {
    return <div className="api-preview__message">This YAML file is not recognized as an OpenAPI or AsyncAPI document.</div>;
  }

  if (parsed.error || !parsed.spec) {
    return (
      <div className="api-preview__error" role="alert">
        <strong>Could not preview this {kind === "openapi" ? "OpenAPI" : "AsyncAPI"} document</strong>
        <pre>{parsed.error ?? "The document is invalid."}</pre>
      </div>
    );
  }

  return (
    <div className="api-preview">
      {kind === "openapi" ? (
        <Suspense fallback={<div className="api-preview__message">Loading API preview…</div>}>
          <SwaggerUI
            key={`${name}:openapi`}
            spec={parsed.spec}
            deepLinking
            docExpansion="list"
            supportedSubmitMethods={[]}
            {...({ validatorUrl: null } as object)}
          />
        </Suspense>
      ) : (
        <AsyncApiPreview key={`${name}:asyncapi`} schema={parsed.spec} />
      )}
    </div>
  );
}
