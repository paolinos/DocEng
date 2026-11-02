export type ApiSpecKind = "openapi" | "asyncapi";

export function apiSpecKind(name: string, source: string): ApiSpecKind | null {
  if (!/\.(?:ya?ml)$/i.test(name)) return null;
  const normalized = source.replace(/^\uFEFF/, "").trimStart();
  const match = /^(openapi|asyncapi)\s*:/i.exec(normalized);
  return match ? (match[1].toLowerCase() as ApiSpecKind) : null;
}

export function isApiSpecFile(name: string, source: string): boolean {
  return apiSpecKind(name, source) !== null;
}
