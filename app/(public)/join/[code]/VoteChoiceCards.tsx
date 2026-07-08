"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type VoteChoice = {
  id: string;
  label: string;
};

type VoteChoiceCardsProps = {
  accessCode: string;
  resolutionId: string;
  memberId: string;
  choices: VoteChoice[];
  currentChoiceId?: string | null;
  submitVote: (formData: FormData) => Promise<void> | void;
};

function pauseAutoRefresh() {
  if (typeof window === "undefined") return;

  (window as Window & { __agConnectPauseRefreshUntil?: number }).__agConnectPauseRefreshUntil = Date.now() + 2500;
}

export function VoteChoiceCards({
  accessCode,
  resolutionId,
  memberId,
  choices,
  currentChoiceId,
  submitVote,
}: VoteChoiceCardsProps) {
  const router = useRouter();
  const [optimisticChoiceId, setOptimisticChoiceId] = useState<string | null>(currentChoiceId ?? null);
  const [savingChoiceId, setSavingChoiceId] = useState<string | null>(null);
  const [savedChoiceId, setSavedChoiceId] = useState<string | null>(currentChoiceId ?? null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedChoice = useMemo(
    () => choices.find((choice) => choice.id === optimisticChoiceId),
    [choices, optimisticChoiceId],
  );

  function handleSubmit(choiceId: string, formData: FormData) {
    pauseAutoRefresh();
    setError(null);
    setOptimisticChoiceId(choiceId);
    setSavingChoiceId(choiceId);

    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(25);
    }

    startTransition(() => {
      void Promise.resolve(submitVote(formData))
        .then(() => {
          pauseAutoRefresh();
          setSavedChoiceId(choiceId);
          setSavingChoiceId(null);
          window.setTimeout(() => router.refresh(), 400);
        })
        .catch(() => {
          setOptimisticChoiceId(savedChoiceId);
          setSavingChoiceId(null);
          setError("Le vote n’a pas pu être enregistré. Vérifiez la connexion puis réessayez.");
        });
    });
  }

  return (
    <div className="mt-4 grid gap-3">
      {selectedChoice ? (
        <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-100">
          ✅ Choix sélectionné : <strong>{selectedChoice.label}</strong>
          <p className="mt-1 text-xs text-emerald-700/70">
            {savingChoiceId
              ? "Enregistrement en cours…"
              : "Votre choix est enregistré et reste modifiable jusqu’à la clôture du vote."}
          </p>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-100">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3">
        {choices.map((choice) => {
          const isSelected = optimisticChoiceId === choice.id;
          const isSavingThisChoice = savingChoiceId === choice.id;

          return (
            <form key={choice.id} action={(formData) => handleSubmit(choice.id, formData)}>
              <input type="hidden" name="accessCode" value={accessCode} />
              <input type="hidden" name="resolutionId" value={resolutionId} />
              <input type="hidden" name="memberId" value={memberId} />
              <input type="hidden" name="choiceId" value={choice.id} />
              <button
                type="submit"
                onPointerDown={() => {
                  pauseAutoRefresh();
                  setOptimisticChoiceId(choice.id);
                }}
                className={`min-h-16 w-full touch-manipulation rounded-3xl border px-5 py-5 text-left text-base font-semibold shadow-sm transition active:scale-[0.99] sm:text-lg ${
                  isSelected
                    ? "border-emerald-300 bg-emerald-100 text-emerald-950 ring-2 ring-emerald-200"
                    : "border-slate-200 bg-[#fbfaf7] text-slate-800 hover:border-amber-400 hover:bg-amber-50"
                }`}
                aria-pressed={isSelected}
              >
                <span className="flex items-center justify-between gap-4">
                  <span>{choice.label}</span>
                  {isSelected ? (
                    <span className="rounded-full bg-white/75 px-3 py-1 text-sm font-bold text-emerald-700 ring-1 ring-emerald-200">
                      {isSavingThisChoice || isPending ? "Enregistrement…" : "✓ Choix actuel"}
                    </span>
                  ) : (
                    <span className="rounded-full bg-white px-3 py-1 text-sm text-slate-400 ring-1 ring-slate-200">
                      Toucher
                    </span>
                  )}
                </span>
              </button>
            </form>
          );
        })}
      </div>
    </div>
  );
}
