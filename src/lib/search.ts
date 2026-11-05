export interface SearchMatch {
  /** UTF-16 offset into the searched string, suitable for textarea selection. */
  start: number;
  /** Exclusive UTF-16 end offset into the searched string. */
  end: number;
}

export interface SearchSegment {
  text: string;
  /** Index into the match list, or null for unmatched text. */
  matchIndex: number | null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Finds literal, non-overlapping matches in `text`.
 *
 * A regex is used instead of lowercase-copy/indexOf because Unicode case
 * folding can change string length and shift the offsets returned to the
 * textarea.
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
 * Splits `text` into alternating plain and matched segments so the editor can
 * render an aligned highlight layer behind the textarea.
 */
export function buildSearchSegments(
  text: string,
  matches: SearchMatch[],
): SearchSegment[] {
  if (text.length === 0) return [];
  if (matches.length === 0) return [{ text, matchIndex: null }];

  const segments: SearchSegment[] = [];
  let cursor = 0;

  matches.forEach((match, matchIndex) => {
    const start = Math.max(cursor, Math.min(match.start, text.length));
    const end = Math.max(start, Math.min(match.end, text.length));

    if (start > cursor) {
      segments.push({ text: text.slice(cursor, start), matchIndex: null });
    }

    segments.push({ text: text.slice(start, end), matchIndex });

    cursor = end;
  });

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), matchIndex: null });
  }

  return segments;
}
