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
  contextTitle?: string;
  contextSubtitle?: string;
  drawerEnabled?: boolean;
  submitVote: (formData: FormData) => Promise<void> | void;
};

function pauseAutoRefresh(duration = 3000) {
  if (typeof window === "undefined") return;

  (
    window as Window & { __agConnectPauseRefreshUntil?: number }
  ).__agConnectPauseRefreshUntil = Date.now() + duration;
}

export function VoteChoiceCards({
  accessCode,
  resolutionId,
  memberId,
  choices,
  currentChoiceId,
  contextTitle = "Vote ouvert",
  contextSubtitle,
  drawerEnabled = true,
  submitVote,
}: VoteChoiceCardsProps) {
  const router = useRouter();
  const [optimisticChoiceId, setOptimisticChoiceId] = useState<string | null>(
    currentChoiceId ?? null,
  );
  const [savingChoiceId, setSavingChoiceId] = useState<string | null>(null);
  const [savedChoiceId, setSavedChoiceId] = useState<string | null>(
    currentChoiceId ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(drawerEnabled);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (savingChoiceId) return;
    setOptimisticChoiceId(currentChoiceId ?? null);
    setSavedChoiceId(currentChoiceId ?? null);
  }, [currentChoiceId, savingChoiceId]);

  useEffect(() => {
    if (!drawerEnabled) return;
    setIsDrawerOpen(true);
    pauseAutoRefresh(1500);
  }, [drawerEnabled, resolutionId, memberId]);

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
          setError(
            "Le vote n’a pas pu être enregistré. Vérifiez la connexion puis réessayez.",
          );
        });
    });
  }

  const statusBlock = selectedChoice ? (
    <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-100">
      {savingChoiceId ? (
        <>
          ⏳ Enregistrement de votre vote :{" "}
          <strong>{selectedChoice.label}</strong>
          <p className="mt-1 text-xs text-emerald-700/70">
            Un seul appui suffit. Merci de patienter quelques secondes.
          </p>
        </>
      ) : (
        <>
          ✅ Vote enregistré : <strong>{selectedChoice.label}</strong>
          <p className="mt-1 text-xs text-emerald-700/70">
            Vous pouvez toucher un autre choix pour modifier votre vote tant que
            la résolution est ouverte.
          </p>
        </>
      )}
    </div>
  ) : null;

  const errorBlock = error ? (
    <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-100">
      {error}
    </div>
  ) : null;

  const choiceButtons = (
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
                  {isSavingThisChoice || isPending
                    ? "Enregistrement…"
                    : "✓ Vote enregistré"}
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
  );

  return (
    <>
      <div className="mt-4 grid gap-3">
        {statusBlock}
        {errorBlock}
        {choiceButtons}
      </div>

      {drawerEnabled ? (
        <div className="sm:hidden">
          {isDrawerOpen ? (
            <div className="fixed inset-0 z-50 flex items-end bg-slate-950/45 px-3 pb-3 backdrop-blur-[2px]">
              <div
                className="w-full rounded-t-[2rem] rounded-b-[1.25rem] bg-white p-4 shadow-2xl ring-1 ring-slate-200 animate-in slide-in-from-bottom-4 duration-200"
                style={{
                  paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
                }}
              >
                <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200" />
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-700">
                      🗳️ Vote ouvert
                    </p>
                    <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
                      {contextTitle}
                    </h3>
                    {contextSubtitle ? (
                      <p className="mt-1 text-sm text-slate-500">
                        {contextSubtitle}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsDrawerOpen(false)}
                    className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-500"
                  >
                    Réduire
                  </button>
                </div>

                <div className="mt-4 grid gap-3">
                  {statusBlock}
                  {errorBlock}
                  {choiceButtons}
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsDrawerOpen(true)}
              className="fixed inset-x-4 bottom-4 z-40 rounded-full bg-slate-950 px-5 py-4 text-sm font-semibold text-white shadow-2xl shadow-slate-950/30 ring-1 ring-white/10"
              style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
            >
              🗳️ Vote en attente — toucher pour ouvrir
            </button>
          )}
        </div>
      ) : null}
    </>
  );
}
