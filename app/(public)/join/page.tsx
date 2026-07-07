import Link from "next/link";

export default function JoinPage() {
  return (
    <main className="min-h-screen bg-[#f7f4ef] px-5 py-10 text-slate-950">
      <section className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl items-center">
        <div className="w-full rounded-[2rem] border border-slate-200 bg-white p-8 text-center shadow-sm shadow-slate-900/5 sm:p-12">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-700">AG Connect</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">Scannez votre QR Code personnel</h1>
          <p className="mx-auto mt-4 max-w-xl text-slate-500">
            Chaque propriétaire dispose d’un lien unique. Il permet de confirmer sa présence et d’accéder aux votes ouverts pendant l’assemblée.
          </p>
          <Link href="/" className="mt-8 inline-flex rounded-2xl bg-slate-950 px-5 py-3 font-semibold text-white transition hover:bg-slate-800">
            Retour à l’accueil
          </Link>
        </div>
      </section>
    </main>
  );
}
