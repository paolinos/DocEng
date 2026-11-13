import {
  findMatches,
  groupSearchHits,
  jsOffsetForLineColumn,
  projectRelativePath,
  utf8ColumnToJsOffset,
} from "../lib/search";
import { useSearchStore } from "../stores/searchStore";
import type { SearchHit } from "../lib/fs";

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

function hit(
  path: string,
  name: string,
  line: number,
  column = 1,
  match = "needle",
): SearchHit {
  return {
    path,
    name,
    line,
    column,
    text: `xx${match}yy`,
    before: "xx",
    match,
    after: "yy",
  };
}

describe("project search helpers", () => {
  it("groups hits by file while preserving first-seen order", () => {
    const groups = groupSearchHits([
      hit("/project/b.md", "b.md", 1),
      hit("/project/a.md", "a.md", 2),
      hit("/project/b.md", "b.md", 5),
    ]);

    expect(groups.map((group) => group.path)).toEqual([
      "/project/b.md",
      "/project/a.md",
    ]);
    expect(groups[0].hits).toHaveLength(2);
    expect(groups[0].hits.map((item) => item.line)).toEqual([1, 5]);
  });

  it("derives relative paths from the longest matching folder root", () => {
    const roots = [
      { path: "/project", type: "folder" as const },
      { path: "/project/notes", type: "folder" as const },
      { path: "/project/readme.md", type: "file" as const },
    ];

    expect(projectRelativePath("/project/notes/today.md", roots)).toBe(
      "today.md",
    );
    expect(projectRelativePath("/project/src/main.rs", roots)).toBe(
      "src/main.rs",
    );
    expect(projectRelativePath("/project/readme.md", roots)).toBe("readme.md");
    expect(projectRelativePath("/elsewhere/file.txt", roots)).toBe(
      "/elsewhere/file.txt",
    );
  });

  it("converts UTF-8 byte columns to JavaScript offsets", () => {
    const line = "aé😀b";

    expect(utf8ColumnToJsOffset(line, 1)).toBe(0);
    expect(utf8ColumnToJsOffset(line, 2)).toBe(1);
    expect(utf8ColumnToJsOffset(line, 4)).toBe(2);
    expect(utf8ColumnToJsOffset(line, 8)).toBe(4);
    // A column inside a multi-byte character rounds up.
    expect(utf8ColumnToJsOffset(line, 3)).toBe(2);
  });

  it("computes an offset from a 1-based line and column", () => {
    const content = "first\nsecond\nneedle";

    expect(jsOffsetForLineColumn(content, 3, 1)).toBe(13);
    expect(jsOffsetForLineColumn(content, 2, 4)).toBe(9);
    expect(jsOffsetForLineColumn(content, 99, 1)).toBe(13);
  });
});

describe("project search store", () => {
  beforeEach(() => {
    useSearchStore.setState({
      projectSearchOpen: false,
      projectSearchActive: false,
      projectQuery: "",
      projectResults: [],
      projectLoading: false,
      projectTruncated: false,
      projectError: null,
      projectFilesSearched: 0,
      projectHasSearched: false,
      projectRootsKey: null,
      projectRequestId: 0,
      projectFocusRequest: 0,
      projectReveal: null,
    });
  });

  it("opens, focuses, and re-activates the Search view", () => {
    const store = useSearchStore.getState();
    store.openProjectSearch();

    expect(useSearchStore.getState()).toMatchObject({
      projectSearchOpen: true,
      projectSearchActive: true,
      projectFocusRequest: 1,
    });

    useSearchStore.getState().deactivateProjectSearch();
    useSearchStore.getState().activateProjectSearch();
    expect(useSearchStore.getState().projectFocusRequest).toBe(2);
  });

  it("ignores stale responses by request id", () => {
    const store = useSearchStore.getState();
    const first = store.startProjectSearch("root-a");
    const second = store.startProjectSearch("root-a");

    useSearchStore.getState().finishProjectSearch(first, {
      totalMatches: 1,
      results: [hit("/project/a.md", "a.md", 1)],
      truncated: false,
      filesSearched: 1,
    });
    expect(useSearchStore.getState().projectResults).toEqual([]);
    expect(useSearchStore.getState().projectLoading).toBe(true);

    useSearchStore.getState().finishProjectSearch(second, {
      totalMatches: 0,
      results: [],
      truncated: true,
      filesSearched: 4,
    });
    expect(useSearchStore.getState()).toMatchObject({
      projectLoading: false,
      projectTruncated: true,
      projectFilesSearched: 4,
      projectHasSearched: true,
    });
  });

  it("clears results when the project roots change", () => {
    const store = useSearchStore.getState();
    const request = store.startProjectSearch("root-a");
    useSearchStore.getState().finishProjectSearch(request, {
      totalMatches: 1,
      results: [hit("/project/a.md", "a.md", 1)],
      truncated: false,
      filesSearched: 1,
    });

    useSearchStore.getState().syncProjectRoots("root-b");

    expect(useSearchStore.getState().projectResults).toEqual([]);
    expect(useSearchStore.getState().projectLoading).toBe(false);
    expect(useSearchStore.getState().projectTruncated).toBe(false);
    expect(useSearchStore.getState().projectRootsKey).toBe("root-b");
  });

  it("clears the Search view on close but leaves other state alone", () => {
    const store = useSearchStore.getState();
    store.openProjectSearch();
    store.setProjectQuery("needle");
    store.setProjectReveal({
      path: "/project/a.md",
      line: 1,
      column: 1,
      match: "needle",
    });

    useSearchStore.getState().closeProjectSearch();

    expect(useSearchStore.getState()).toMatchObject({
      projectSearchOpen: false,
      projectSearchActive: false,
      projectQuery: "",
      projectResults: [],
      projectReveal: null,
    });
    expect(useSearchStore.getState().query).toBe("");
  });
});
