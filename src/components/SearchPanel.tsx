import { useEffect, useMemo, useRef } from "react";
import {
  AlertCircle,
  FileText,
  Loader2,
  Search,
  X,
} from "lucide-react";
import type { AppActions } from "../hooks/useAppActions";
import { groupSearchHits, projectRelativePath } from "../lib/search";
import { useProjectStore } from "../stores/projectStore";
import { useSearchStore } from "../stores/searchStore";

interface SearchPanelProps {
  actions: AppActions;
}

export function SearchPanel({ actions }: SearchPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const query = useSearchStore((state) => state.projectQuery);
  const results = useSearchStore((state) => state.projectResults);
  const loading = useSearchStore((state) => state.projectLoading);
  const truncated = useSearchStore((state) => state.projectTruncated);
  const error = useSearchStore((state) => state.projectError);
  const filesSearched = useSearchStore((state) => state.projectFilesSearched);
  const hasSearched = useSearchStore((state) => state.projectHasSearched);
  const focusRequest = useSearchStore((state) => state.projectFocusRequest);
  const setQuery = useSearchStore((state) => state.setProjectQuery);
  const roots = useProjectStore((state) => state.project.roots);

  const groups = useMemo(() => groupSearchHits(results), [results]);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusRequest]);

  function runSearch() {
    if (loading || query.length === 0) return;
    void actions.runProjectSearch();
  }

  return (
    <section className="search-panel" aria-label="Search in project">
      <header className="search-panel__header">
        <Search size={15} className="search-panel__icon" aria-hidden="true" />

        <input
          ref={inputRef}
          type="text"
          className="search-panel__input"
          placeholder="Find in project"
          aria-label="Find in project"
          value={query}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            runSearch();
          }}
        />

        <button
          type="button"
          className="btn btn--primary search-panel__submit"
          disabled={loading || query.length === 0}
          onClick={runSearch}
        >
          {loading ? (
            <Loader2 size={14} className="search-panel__spinner" />
          ) : (
            <Search size={14} />
          )}
          Search
        </button>

        <button
          type="button"
          className="icon-button"
          title="Close Search"
          aria-label="Close Search"
          onClick={actions.closeProjectSearch}
        >
          <X size={16} />
        </button>
      </header>

      <div className="search-panel__body">
        {error ? (
          <div className="search-panel__error" role="alert">
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        ) : null}

        {loading ? (
          <div className="search-panel__status" role="status">
            Searching the project…
          </div>
        ) : null}

        {!loading && hasSearched && !error ? (
          <div className="search-panel__summary">
            {results.length === 0
              ? "No matches"
              : `${results.length} ${results.length === 1 ? "match" : "matches"} in ${groups.length} ${groups.length === 1 ? "file" : "files"}`}
            {" · "}
            {filesSearched} {filesSearched === 1 ? "file" : "files"} searched
          </div>
        ) : null}

        {!loading && truncated ? (
          <div className="search-panel__notice">
            Results are limited to 500 matches or 500 files. Narrow the query to
            search further.
          </div>
        ) : null}

        {!loading && hasSearched && !error && results.length === 0 ? (
          <div className="search-panel__empty">
            <FileText size={22} strokeWidth={1.5} aria-hidden="true" />
            <p>No matches for “{query}” in saved project files.</p>
            <span>Search reads files from disk; unsaved edits are not included.</span>
          </div>
        ) : null}

        {!loading && results.length > 0 ? (
          <div className="search-panel__results">
            {groups.map((group) => (
              <section className="search-group" key={group.path}>
                <header className="search-group__header">
                  <FileText size={13} aria-hidden="true" />
                  <span
                    className="search-group__path"
                    title={group.path}
                  >
                    {projectRelativePath(group.path, roots)}
                  </span>
                  <span className="search-group__count">
                    {group.hits.length}
                  </span>
                </header>

                <ul className="search-group__hits">
                  {group.hits.map((hit, index) => (
                    <li key={`${hit.line}:${hit.column}:${index}`}>
                      <button
                        type="button"
                        className="search-hit"
                        title={`Open ${hit.name} at line ${hit.line}`}
                        onClick={() => void actions.openSearchResult(hit)}
                      >
                        <span className="search-hit__line">{hit.line}</span>
                        <span className="search-hit__text">
                          <span>{hit.before}</span>
                          <mark>{hit.match}</mark>
                          <span>{hit.after}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
