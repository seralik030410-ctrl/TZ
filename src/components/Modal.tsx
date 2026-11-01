import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector("[data-ritm-popup]")) return;
      if (event.key === "Escape") closeRef.current();
      if (event.key === "Tab" && sheetRef.current) {
        const focusable = Array.from(
          sheetRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not([type="hidden"]):not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]'),
        ).filter(element => element.getClientRects().length > 0 && element.getAttribute("aria-hidden") !== "true" && element.tabIndex >= 0);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => {
      (sheetRef.current?.querySelector<HTMLElement>('input:not([type="checkbox"]):not([type="hidden"]):not(:disabled):not([aria-hidden="true"]), textarea:not(:disabled), select:not(:disabled):not([aria-hidden="true"])') ?? sheetRef.current?.querySelector<HTMLElement>("button"))?.focus();
    }, 50);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previous?.focus();
    };
  }, []);

  return createPortal(
    <div
      className="overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} ref={sheetRef}>
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-header">
          <h2>{title}</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Закрыть">
            <X size={21} />
          </button>
        </div>
        {children}
      </div>
    </div>, document.body
  );
}
