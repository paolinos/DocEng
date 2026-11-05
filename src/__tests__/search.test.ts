import { buildSearchSegments, findMatches } from "../lib/search";
import { useSearchStore } from "../stores/searchStore";

describe("findMatches", () => {
  it("returns no matches for an empty query", () => {
    expect(findMatches("some text", "")).toEqual([]);
  });

  it("finds literal matches case-insensitively by default", () => {
    const text = "Hello hello HELLO";
    const matches = findMatches(text, "hello");

    expect(matches).toHaveLength(3);
    expect(matches.map((match) => text.slice(match.start, match.end))).toEqual(
      ["Hello", "hello", "HELLO"],
    );
  });

  it("respects case-sensitive matching", () => {
    const text = "Hello hello HELLO";
    const matches = findMatches(text, "hello", true);

    expect(matches).toHaveLength(1);
    expect(text.slice(matches[0].start, matches[0].end)).toBe("hello");
  });

  it("treats regular-expression characters as literal text", () => {
    const text = "a.b axb a.b";
    const matches = findMatches(text, "a.b");

    expect(matches).toHaveLength(2);
    expect(matches.map((match) => text.slice(match.start, match.end))).toEqual(
      ["a.b", "a.b"],
    );
  });

  it("returns offsets that work with JavaScript string slicing", () => {
    const text = "café and CAFÉ";
    const matches = findMatches(text, "café");

    expect(matches).toHaveLength(2);
    expect(matches.map((match) => text.slice(match.start, match.end))).toEqual(
      ["café", "CAFÉ"],
    );
  });

  it("finds matches across multiple lines", () => {
    const text = "first line\nsecond line\nthird first";
    const matches = findMatches(text, "first");

    expect(matches).toHaveLength(2);
    expect(matches[1]).toEqual({ start: 29, end: 34 });
    expect(text.slice(matches[1].start, matches[1].end)).toBe("first");
  });

  it("returns non-overlapping matches", () => {
    const matches = findMatches("aaaa", "aa");

    expect(matches).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(findMatches("some text", "missing")).toEqual([]);
  });
});

describe("buildSearchSegments", () => {
  it("returns no segments for empty text", () => {
    expect(buildSearchSegments("", [])).toEqual([]);
  });

  it("returns the whole text as unmatched when there are no matches", () => {
    expect(buildSearchSegments("some text", [])).toEqual([
      { text: "some text", matchIndex: null },
    ]);
  });

  it("alternates unmatched and matched segments in order", () => {
    const text = "one two one";
    const segments = buildSearchSegments(text, findMatches(text, "one"));

    expect(segments).toEqual([
      { text: "one", matchIndex: 0 },
      { text: " two ", matchIndex: null },
      { text: "one", matchIndex: 1 },
    ]);
  });

  it("keeps leading, trailing, and newline text intact", () => {
    const text = "\nbefore match after\n";
    const segments = buildSearchSegments(text, findMatches(text, "match"));

    expect(segments).toEqual([
      { text: "\nbefore ", matchIndex: null },
      { text: "match", matchIndex: 0 },
      { text: " after\n", matchIndex: null },
    ]);
    expect(segments.map((segment) => segment.text).join("")).toBe(text);
  });

  it("handles a match at the very beginning and end of the text", () => {
    const text = "match middle match";
    const segments = buildSearchSegments(text, findMatches(text, "match"));

    expect(segments).toEqual([
      { text: "match", matchIndex: 0 },
      { text: " middle ", matchIndex: null },
      { text: "match", matchIndex: 1 },
    ]);
  });

  it("clamps malformed offsets to the text length", () => {
    const segments = buildSearchSegments("abc", [{ start: 1, end: 99 }]);

    expect(segments).toEqual([
      { text: "a", matchIndex: null },
      { text: "bc", matchIndex: 0 },
    ]);
  });
});

describe("searchStore", () => {
  beforeEach(() => {
    useSearchStore.setState({
      findOpen: false,
      query: "",
      caseSensitive: false,
      activeIndex: 0,
      focusRequest: 0,
    });
  });

  it("opens with an initial query and focuses the input", () => {
    useSearchStore.getState().openFind("needle");
    const state = useSearchStore.getState();

    expect(state.findOpen).toBe(true);
    expect(state.query).toBe("needle");
    expect(state.activeIndex).toBe(0);
    expect(state.focusRequest).toBe(1);
  });

  it("preserves the query when Find is reopened without a new selection", () => {
    useSearchStore.getState().openFind("needle");
    useSearchStore.getState().openFind();

    expect(useSearchStore.getState().query).toBe("needle");
    expect(useSearchStore.getState().focusRequest).toBe(2);
  });

  it("resets the active match when the query changes", () => {
    useSearchStore.getState().openFind("needle");
    useSearchStore.getState().nextMatch(4);
    useSearchStore.getState().setQuery("other");

    expect(useSearchStore.getState().activeIndex).toBe(0);
  });

  it("cycles forward and backward through matches", () => {
    const store = useSearchStore.getState();
    store.openFind("needle");

    store.nextMatch(3);
    expect(useSearchStore.getState().activeIndex).toBe(1);
    store.nextMatch(3);
    expect(useSearchStore.getState().activeIndex).toBe(2);
    store.nextMatch(3);
    expect(useSearchStore.getState().activeIndex).toBe(0);
    store.previousMatch(3);
    expect(useSearchStore.getState().activeIndex).toBe(2);
  });

  it("clamps a stale active index after the match count shrinks", () => {
    const store = useSearchStore.getState();
    store.openFind("needle");
    store.setActiveIndex(4);
    store.nextMatch(3);

    expect(useSearchStore.getState().activeIndex).toBe(0);
    store.nextMatch(3);
    expect(useSearchStore.getState().activeIndex).toBe(1);
  });

  it("resets the query and match index for a different document", () => {
    const store = useSearchStore.getState();
    store.openFind("needle");
    store.nextMatch(3);
    store.resetForDocument();

    expect(useSearchStore.getState().query).toBe("");
    expect(useSearchStore.getState().activeIndex).toBe(0);
    expect(useSearchStore.getState().findOpen).toBe(true);
  });
});
