import { basename } from "./utils";

export interface SearchMatch {
  /** UTF-16 offset into the searched string, suitable for editor selection. */
  start: number;
  /** Exclusive UTF-16 end offset into the searched string. */
  end: number;
}

export interface ProjectSearchGroup<T extends { path: string; name: string }> {
  path: string;
  name: string;
  hits: T[];
}


function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Finds literal, non-overlapping matches in `text`.
 *
 * A regex is used instead of lowercase-copy/indexOf because Unicode case
 * folding can change string length and shift the offsets returned to the
 * editor.
 */
export function findMatches(
  text: string,
  query: string,
  caseSensitive = false,
): SearchMatch[] {
  if (query.length === 0) return [];

  const pattern = new RegExp(
    escapeRegExp(query),
    caseSensitive ? "g" : "gi",
  );
  const matches: SearchMatch[] = [];

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return matches;
}

/**
 * Groups project-search hits by file while preserving the order in which each
 * file first appears in the response.
 */
export function groupSearchHits<T extends { path: string; name: string }>(
  hits: T[],
): ProjectSearchGroup<T>[] {
  const groups = new Map<string, ProjectSearchGroup<T>>();

  for (const hit of hits) {
    let group = groups.get(hit.path);
    if (!group) {
      group = { path: hit.path, name: hit.name, hits: [] };
      groups.set(hit.path, group);
    }
    group.hits.push(hit);
  }

  return [...groups.values()];
}

/**
 * Converts an absolute path to a path relative to the longest matching folder
 * root. File roots and unmatched paths fall back to a readable name instead of
 * leaking a full path into the grouped results header.
 */
export function projectRelativePath(
  path: string,
  roots: Array<{ path: string; type: "file" | "folder" }>,
): string {
  let bestRoot: string | null = null;

  for (const root of roots) {
    if (root.type !== "folder") {
      if (path === root.path) return basename(root.path);
      continue;
    }

    const prefix = root.path.replace(/[\\/]+$/, "");
    if (
      path === prefix ||
      path.startsWith(`${prefix}/`) ||
      path.startsWith(`${prefix}\\`)
    ) {
      if (bestRoot === null || prefix.length > bestRoot.length) {
        bestRoot = prefix;
      }
    }
  }

  if (bestRoot === null) return path;

  const relative = path.slice(bestRoot.length).replace(/^[\\/]+/, "");
  return relative || basename(bestRoot);
}

/**
 * Converts a 1-based UTF-8 byte column from Rust into a JavaScript UTF-16
 * offset within `line`. If the column lands inside a multi-byte character, the
 * offset rounds up to the next character boundary.
 */
export function utf8ColumnToJsOffset(line: string, column: number): number {
  const target = Math.max(0, column - 1);
  let bytes = 0;
  let offset = 0;

  for (const character of line) {
    if (bytes >= target) break;
    bytes += utf8ByteLength(character.codePointAt(0) ?? 0);
    offset += character.length;
  }

  return offset;
}

/**
 * Computes the UTF-16 offset of a 1-based line/column inside a document.
 */
export function jsOffsetForLineColumn(
  content: string,
  line: number,
  column: number,
): number {
  const lines = content.split("\n");
  const lineIndex = Math.min(
    Math.max(line - 1, 0),
    Math.max(lines.length - 1, 0),
  );

  let offset = 0;
  for (let index = 0; index < lineIndex; index += 1) {
    offset += (lines[index]?.length ?? 0) + 1;
  }

  return offset + utf8ColumnToJsOffset(lines[lineIndex] ?? "", column);
}

function utf8ByteLength(codePoint: number): number {
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}
