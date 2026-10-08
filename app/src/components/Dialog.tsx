import { useEffect, useRef, type ReactNode } from 'react';

/** A modal that slides up from the bottom on phones. Closes on Escape or a tap outside. */
export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog"
      onClose={onClose}
      onClick={(event) => event.target === ref.current && onClose()}
      aria-label={title}
    >
      <div className="dialog-body">
        <div className="dialog-head">
          <h2>{title}</h2>
          <button type="button" className="btn" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
