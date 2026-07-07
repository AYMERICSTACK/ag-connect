export default function PublicHomePage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f4ef] px-6 text-center text-slate-950">
      <div className="max-w-xl rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-700">
          AG Connect
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">
          Espace participant bientôt disponible
        </h1>
        <p className="mt-3 text-slate-600">
          Cette page servira à rejoindre l’assemblée via QR Code lors des prochaines versions.
        </p>
      </div>
    </main>
  );
}
