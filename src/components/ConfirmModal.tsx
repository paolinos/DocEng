import { useConfirmStore } from "../stores/confirmStore";

export function ConfirmModal() {
  const {
    open,
    title,
    message,
    detail,
    confirmLabel,
    cancelLabel,
    respond,
  } = useConfirmStore();

  if (!open) return null;

  return (
    <div className="confirm-backdrop">
      <section
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-description"
      >
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-description">{message}</p>
        {detail ? <p>{detail}</p> : null}
        <div className="confirm-dialog__actions">
          <button type="button" onClick={() => respond(false)}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className="confirm-dialog__remove"
            onClick={() => respond(true)}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
