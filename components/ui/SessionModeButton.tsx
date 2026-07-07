"use client";

export function SessionModeButton() {
  return (
    <button
      type="button"
      onClick={async () => {
        const element = document.documentElement;
        if (!document.fullscreenElement) {
          await element.requestFullscreen?.();
        } else {
          await document.exitFullscreen?.();
        }
      }}
      className="rounded-3xl border border-white/15 bg-white/10 px-5 py-4 text-center text-sm font-semibold text-white transition hover:bg-white/15"
    >
      ⛶ Mode AG
    </button>
  );
}
