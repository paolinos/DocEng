import { useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import {
  ChevronDown,
  ChevronUp,
  CaseSensitive,
  Search,
  X,
} from "lucide-react";
import { useSearchStore } from "../stores/searchStore";

interface FindBarProps {
  matchCount: number;
  activeIndex: number;
  onNext: () => void;
  onPrevious: () => void;
  onClose: () => void;
}

export function FindBar({
  matchCount,
  activeIndex,
  onNext,
  onPrevious,
  onClose,
}: FindBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const query = useSearchStore((state) => state.query);
  const caseSensitive = useSearchStore((state) => state.caseSensitive);
  const focusRequest = useSearchStore((state) => state.focusRequest);
  const setQuery = useSearchStore((state) => state.setQuery);
  const setCaseSensitive = useSearchStore((state) => state.setCaseSensitive);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusRequest]);

  const hasQuery = query.length > 0;
  const current =
    matchCount === 0 ? 0 : Math.min(activeIndex, matchCount - 1) + 1;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <div
      className="findbar"
      role="search"
      aria-label="Find in current file"
      onKeyDown={onKeyDown}
    >
      <Search size={14} className="findbar__icon" aria-hidden="true" />

      <input
        ref={inputRef}
        type="text"
        className="findbar__input"
        placeholder="Find in file"
        aria-label="Find in current file"
        value={query}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          if (event.shiftKey) {
            onPrevious();
          } else {
            onNext();
          }
        }}
      />

      <span className="findbar__count" aria-live="polite">
        {hasQuery
          ? matchCount === 0
            ? "No matches"
            : `${current} of ${matchCount}`
          : ""}
      </span>

      <button
        type="button"
        className="findbar__button findbar__button--text"
        aria-pressed={caseSensitive}
        title="Match case"
        aria-label="Match case"
        onClick={() => setCaseSensitive(!caseSensitive)}
      >
        <CaseSensitive size={15} />
      </button>

      <button
        type="button"
        className="findbar__button"
        title="Previous match (Shift+Enter)"
        aria-label="Previous match"
        disabled={matchCount === 0}
        onClick={onPrevious}
      >
        <ChevronUp size={15} />
      </button>

      <button
        type="button"
        className="findbar__button"
        title="Next match (Enter)"
        aria-label="Next match"
        disabled={matchCount === 0}
        onClick={onNext}
      >
        <ChevronDown size={15} />
      </button>

      <button
        type="button"
        className="findbar__button"
        title="Close find (Esc)"
        aria-label="Close find"
        onClick={onClose}
      >
        <X size={14} />
      </button>
    </div>
  );
}
