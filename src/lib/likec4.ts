import type { LikeC4Model } from "@likec4/core/model";

/**
 * A layouted LikeC4 model, ready to be handed to `LikeC4ModelProvider`.
 * The model is always derived from source and never persisted.
 */
export type C4Model = LikeC4Model.Layouted;

export interface C4ViewSummary {
  id: string;
  title: string;
}

export interface C4Diagnostic {
  message: string;
  line: number;
  column: number;
}

export interface C4ParseSuccess {
  ok: true;
  model: C4Model;
  views: C4ViewSummary[];
  diagnostics: C4Diagnostic[];
}

export interface C4ParseFailure {
  ok: false;
  diagnostics: C4Diagnostic[];
  error: string;
}

export type C4ParseResult = C4ParseSuccess | C4ParseFailure;

interface RawDiagnostic {
  message: string;
  line: number;
  range: {
    start: {
      line: number;
      character: number;
    };
  };
}

interface LikeC4Instance {
  getErrors(): RawDiagnostic[];
  layoutedModel(): Promise<C4Model>;
}

interface LanguageServices {
  fromSource(source: string): Promise<LikeC4Instance>;
}

/**
 * LikeC4's language services are several megabytes, so they are loaded on
 * demand the first time a LikeC4 diagram is rendered. The promise is shared by
 * every diagram instance in the app.
 */
let servicesPromise: Promise<LanguageServices> | null = null;

function loadLanguageServices(): Promise<LanguageServices> {
  servicesPromise ??= import("@likec4/language-services/browser");
  return servicesPromise;
}

const MAX_CACHE_ENTRIES = 8;

/**
 * Parsing and laying out a model is expensive. Results are cached by exact
 * source so tab switches and repeated Markdown fences stay instant. Failures
 * are not cached (the user is usually about to fix them).
 */
const cache = new Map<string, C4ParseSuccess>();

function remember(source: string, result: C4ParseSuccess): void {
  if (cache.has(source)) cache.delete(source);
  cache.set(source, result);

  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

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

function formatDiagnostics(diagnostics: RawDiagnostic[]): C4Diagnostic[] {
  return diagnostics.map((diagnostic) => ({
    message: diagnostic.message,
    line: diagnostic.range.start.line + 1,
    column: diagnostic.range.start.character + 1,
  }));
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }
}

/**
 * Parse and layout LikeC4 DSL entirely in memory. Never touches the filesystem
 * or starts a language server.
 */
export async function parseC4Source(
  source: string,
  signal?: AbortSignal,
): Promise<C4ParseResult> {
  throwIfAborted(signal);

  const cached = cache.get(source);
  if (cached !== undefined) {
    // Refresh insertion order so frequently used sources stay cached.
    cache.delete(source);
    cache.set(source, cached);
    return cached;
  }

  let diagnostics: C4Diagnostic[] = [];

  try {
    const { fromSource } = await loadLanguageServices();
    throwIfAborted(signal);

    const likec4 = await fromSource(source);
    diagnostics = formatDiagnostics(likec4.getErrors());
    throwIfAborted(signal);

    const model = await likec4.layoutedModel();
    throwIfAborted(signal);

    const views = Array.from(model.views(), (view) => ({
      id: view.id as string,
      title: view.title ?? (view.id as string),
    }));

    const result: C4ParseSuccess = {
      ok: true,
      model,
      views,
      diagnostics,
    };

    remember(source, result);
    return result;
  } catch (error) {
    // A cancelled parse must not surface as a diagram error.
    if (signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }

    return {
      ok: false,
      diagnostics,
      error: describeError(error),
    };
  }
}
