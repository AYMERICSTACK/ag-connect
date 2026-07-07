"use client";

import { useRef, useState } from "react";

type ConfirmSubmitButtonProps = {
  children: React.ReactNode;
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  className?: string;
};

export function ConfirmSubmitButton({
  children,
  message,
  title = "Confirmer l’action",
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  tone = "default",
  className,
}: ConfirmSubmitButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const effectiveTone = tone === "danger" || /danger|supprimer|réinitialiser|clôturer/i.test(message) ? "danger" : "default";

  function submitParentForm() {
    const form = buttonRef.current?.closest("form");
    if (!form) return;
    setIsOpen(false);
    form.requestSubmit();
  }

  return (
    <>
      <button ref={buttonRef} type="button" className={className} onClick={() => setIsOpen(true)}>
        {children}
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl shadow-slate-950/25 ring-1 ring-slate-200">
            <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-2xl text-xl ${effectiveTone === "danger" ? "bg-red-50 text-red-700 ring-1 ring-red-100" : "bg-amber-50 text-amber-700 ring-1 ring-amber-100"}`}>
              {effectiveTone === "danger" ? "⚠️" : "✓"}
            </div>
            <h2 className="mt-5 text-center text-2xl font-semibold tracking-tight text-slate-950">{title}</h2>
            <p className="mt-3 whitespace-pre-line text-center text-sm leading-6 text-slate-500">{message}</p>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={submitParentForm}
                className={`rounded-2xl px-4 py-3 text-sm font-semibold text-white transition ${effectiveTone === "danger" ? "bg-red-600 hover:bg-red-500" : "bg-slate-950 hover:bg-slate-800"}`}
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
