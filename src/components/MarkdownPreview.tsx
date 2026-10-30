import type { ReactNode } from "react";
import { C4Diagram } from "./C4Diagram";
import { MermaidDiagram } from "./MermaidDiagram";

interface MarkdownPreviewProps {
  source: string;
}

const INLINE_PATTERN_SOURCE =
  "(`[^`\\n]+`|\\*\\*[^*\\n]+\\*\\*|__[^_\\n]+__|\\*[^*\\n]+\\*|_[^_\\n]+_|~~[^~\\n]+~~|\\[[^\\]\\n]+\\]\\([^)\\s]+\\))";

const SAFE_HREF = /^(https?:|mailto:|#|\/)/i;

function safeHref(href: string): string | null {
  const trimmed = href.trim();
  if (SAFE_HREF.test(trimmed)) return trimmed;
  return null;
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = new RegExp(INLINE_PATTERN_SOURCE, "g");
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    const key = `${keyPrefix}-${match.index}`;

    if (token.startsWith("`")) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**") || token.startsWith("__")) {
      nodes.push(
        <strong key={key}>{renderInline(token.slice(2, -2), key)}</strong>,
      );
    } else if (token.startsWith("~~")) {
      nodes.push(<del key={key}>{token.slice(2, -2)}</del>);
    } else if (token.startsWith("*") || token.startsWith("_")) {
      nodes.push(<em key={key}>{renderInline(token.slice(1, -1), key)}</em>);
    } else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (link) {
        const href = safeHref(link[2]);
        nodes.push(
          href ? (
            <a key={key} href={href} target="_blank" rel="noreferrer">
              {renderInline(link[1], key)}
            </a>
          ) : (
            <span key={key}>{link[1]}</span>
          ),
        );
      } else {
        nodes.push(token);
      }
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

interface ListGroup {
  ordered: boolean;
  items: string[];
}

function renderBlocks(source: string): ReactNode[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: ListGroup | null = null;
  let quote: string[] = [];
  let index = 0;

  function flushParagraph() {
    if (paragraph.length === 0) return;
    const text = paragraph.join(" ");
    blocks.push(
      <p key={`p-${blocks.length}`}>
        {renderInline(text, `p-${blocks.length}`)}
      </p>,
    );
    paragraph = [];
  }

  function flushList() {
    if (!list) return;
    const items = list.items.map((item, itemIndex) => (
      <li key={`li-${itemIndex}`}>
        {renderInline(item, `li-${blocks.length}-${itemIndex}`)}
      </li>
    ));

    blocks.push(
      list.ordered ? (
        <ol key={`list-${blocks.length}`}>{items}</ol>
      ) : (
        <ul key={`list-${blocks.length}`}>{items}</ul>
      ),
    );
    list = null;
  }

  function flushQuote() {
    if (quote.length === 0) return;
    blocks.push(
      <blockquote key={`quote-${blocks.length}`}>
        {renderInline(quote.join(" "), `quote-${blocks.length}`)}
      </blockquote>,
    );
    quote = [];
  }

  function flushAll() {
    flushParagraph();
    flushList();
    flushQuote();
  }

  while (index < lines.length) {
    const line = lines[index];

    const fence = /^\s*```(\w*)\s*$/.exec(line);
    if (fence) {
      flushAll();
      const language = fence[1].toLowerCase();
      const code: string[] = [];
      index += 1;

      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }

      if (language === "mermaid") {
        blocks.push(
          <MermaidDiagram
            key={`mermaid-${blocks.length}`}
            source={code.join("\n")}
          />,
        );
      } else if (language === "likec4" || language === "c4") {
        blocks.push(
          <C4Diagram
            key={`c4-${blocks.length}`}
            source={code.join("\n")}
            compact
          />,
        );
      } else {
        blocks.push(
          <pre key={`code-${blocks.length}`} className="markdown-preview__code">
            <code className={language ? `language-${language}` : undefined}>
              {code.join("\n")}
            </code>
          </pre>,
        );
      }
      index += 1;
      continue;
    }

    if (/^\s*$/.test(line)) {
      flushAll();
      index += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushAll();
      const level = heading[1].length;
      const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      blocks.push(
        <Tag key={`h-${blocks.length}`}>
          {renderInline(heading[2].trim(), `h-${blocks.length}`)}
        </Tag>,
      );
      index += 1;
      continue;
    }

    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushAll();
      blocks.push(<hr key={`hr-${blocks.length}`} />);
      index += 1;
      continue;
    }

    const quoteLine = /^\s*>\s?(.*)$/.exec(line);
    if (quoteLine) {
      flushParagraph();
      flushList();
      quote.push(quoteLine[1]);
      index += 1;
      continue;
    }

    const unordered = /^\s*[-*+]\s+(.*)$/.exec(line);
    const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (unordered || ordered) {
      flushParagraph();
      flushQuote();
      const isOrdered = ordered !== null;
      const item = (ordered ?? unordered)?.[1] ?? "";

      if (list && list.ordered !== isOrdered) {
        flushList();
      }

      list ??= { ordered: isOrdered, items: [] };
      list.items.push(item);
      index += 1;
      continue;
    }

    flushList();
    flushQuote();
    paragraph.push(line.trim());
    index += 1;
  }

  flushAll();
  return blocks;
}

export function MarkdownPreview({ source }: MarkdownPreviewProps) {
  return (
    <article className="markdown-preview">{renderBlocks(source)}</article>
  );
}
