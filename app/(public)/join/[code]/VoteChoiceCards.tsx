"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
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

function pauseAutoRefresh(duration = 3000) {
  if (typeof window === "undefined") return;

  (window as Window & { __agConnectPauseRefreshUntil?: number }).__agConnectPauseRefreshUntil = Date.now() + duration;
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

  useEffect(() => {
    if (savingChoiceId) return;
    setOptimisticChoiceId(currentChoiceId ?? null);
    setSavedChoiceId(currentChoiceId ?? null);
  }, [currentChoiceId, savingChoiceId]);

  const selectedChoice = useMemo(
    () => choices.find((choice) => choice.id === optimisticChoiceId),
    [choices, optimisticChoiceId],
  );

  function submitChoice(choiceId: string) {
    pauseAutoRefresh();
    setError(null);
    setOptimisticChoiceId(choiceId);
    setSavingChoiceId(choiceId);

    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(25);
    }

    const formData = new FormData();
    formData.set("accessCode", accessCode);
    formData.set("resolutionId", resolutionId);
    formData.set("memberId", memberId);
    formData.set("choiceId", choiceId);

    startTransition(() => {
      void Promise.resolve(submitVote(formData))
        .then(() => {
          pauseAutoRefresh(3500);
          setSavedChoiceId(choiceId);
          setSavingChoiceId(null);
          window.setTimeout(() => router.refresh(), 350);
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
          {savingChoiceId ? (
            <>
              ⏳ Enregistrement de votre vote : <strong>{selectedChoice.label}</strong>
              <p className="mt-1 text-xs text-emerald-700/70">Un seul appui suffit. Merci de patienter quelques secondes.</p>
            </>
          ) : (
            <>
              ✅ Vote enregistré : <strong>{selectedChoice.label}</strong>
              <p className="mt-1 text-xs text-emerald-700/70">
                Vous pouvez toucher un autre choix pour modifier votre vote tant que la résolution est ouverte.
              </p>
            </>
          )}
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
            <button
              key={choice.id}
              type="button"
              disabled={Boolean(savingChoiceId && !isSavingThisChoice)}
              onPointerDown={() => pauseAutoRefresh()}
              onClick={() => submitChoice(choice.id)}
              className={`min-h-16 w-full touch-manipulation rounded-3xl border px-5 py-5 text-left text-base font-semibold shadow-sm transition active:scale-[0.99] disabled:cursor-wait disabled:opacity-70 sm:text-lg ${
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
                    {isSavingThisChoice || isPending ? "Enregistrement…" : "✓ Vote enregistré"}
                  </span>
                ) : (
                  <span className="rounded-full bg-white px-3 py-1 text-sm text-slate-400 ring-1 ring-slate-200">
                    Toucher pour voter
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
