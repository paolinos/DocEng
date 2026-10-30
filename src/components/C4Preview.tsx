import { C4Diagram } from "./C4Diagram";

interface C4PreviewProps {
  source: string;
  path?: string | null;
  name?: string;
  className?: string;
}

const EXAMPLE_SOURCE = `specification {
  element system
  element person
}

model {
  user = person 'User'
  app = system 'My System'

  user -> app 'Uses'
}

views {
  view index {
    include *
  }
}`;

/**
 * Stateless document-level preview for `.c4` / `.likec4` files. It owns only
 * presentation; document state, saving and dirty tracking stay in the store.
 */
export function C4Preview({
  source,
  path,
  name,
  className,
}: C4PreviewProps) {
  const classes = className ? `c4-preview ${className}` : "c4-preview";
  const isEmpty = source.trim().length === 0;

  return (
    <section
      className={classes}
      aria-label={name ? `Preview of ${name}` : "LikeC4 preview"}
    >
      <header className="c4-preview__header">
        <span className="c4-preview__filename">{name ?? "LikeC4"}</span>
        {path ? (
          <span className="c4-preview__path" title={path}>
            {path}
          </span>
        ) : null}
      </header>

      {isEmpty ? (
        <div className="c4-preview__empty">
          <p>No views yet.</p>
          <p>
            Add a <code>views</code> block to see your architecture here.
          </p>
          <pre className="c4-preview__example">
            <code>{EXAMPLE_SOURCE}</code>
          </pre>
        </div>
      ) : (
        <C4Diagram source={source} className="c4-preview__diagram" />
      )}
    </section>
  );
}
