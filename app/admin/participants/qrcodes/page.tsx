import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { buildJoinUrl, qrCodeUrl } from "@/lib/app-url";

export const dynamic = "force-dynamic";

function memberLabel(member: any) {
  return `${member.firstName || ""} ${member.lastName || ""}`.replace(/\s+/g, " ").trim();
}

async function getCurrentAssembly() {
  return prisma.assembly.findFirst({
    orderBy: { date: "desc" },
    include: { organization: true },
  });
}

export default async function ParticipantsQrCodesPage() {
  const assembly = await getCurrentAssembly();

  if (!assembly) {
    return (
      <main className="min-h-screen bg-[#f7f4ef] px-6 py-10 text-slate-950">
        <div className="mx-auto max-w-5xl rounded-[2rem] border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-700">AG Connect</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">Aucune assemblée trouvée</h1>
        </div>
      </main>
    );
  }

  const members = (await prisma.member.findMany({
    where: { organizationId: assembly.organizationId },
  })).sort((a: any, b: any) => {
    const lotA = Number(String(a.lotNumber).match(/\d+/)?.[0] || 0);
    const lotB = Number(String(b.lotNumber).match(/\d+/)?.[0] || 0);
    if (lotA !== lotB) return lotA - lotB;
    return String(a.lotNumber).localeCompare(String(b.lotNumber), "fr", { numeric: true });
  });

  return (
    <main className="min-h-screen bg-[#f7f4ef] px-5 py-6 text-slate-950 print:bg-white print:px-0 print:py-0">
      <div className="mx-auto max-w-7xl print:max-w-none">
        <header className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-2xl shadow-slate-950/20 print:hidden">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex flex-wrap gap-2">
                <Link href="/admin/participants" className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white/75 transition hover:bg-white/15 hover:text-white">← Participants</Link>
                <Link href="/admin" className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white/75 transition hover:bg-white/15 hover:text-white">Centre de pilotage</Link>
              </div>
              <p className="mt-6 text-sm uppercase tracking-[0.35em] text-amber-200/80">{assembly.organization.name}</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">Planche QR Codes</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">Imprime cette liste pour l’accueil. Chaque propriétaire scanne son QR Code personnel sur place pour rejoindre l’assemblée.</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/10 p-4 text-center">
              <p className="text-3xl font-semibold">{members.length}</p>
              <p className="mt-1 text-xs text-white/60">QR Codes</p>
            </div>
          </div>
        </header>

        <div className="mt-6 flex justify-end print:hidden">
          <p className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">
            Utilise Ctrl + P pour imprimer
          </p>
        </div>

        <section className="mt-6 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/5 print:mt-0 print:rounded-none print:border-0 print:p-0 print:shadow-none">
          <div className="mb-6 hidden print:block">
            <h1 className="text-center text-2xl font-bold">ASL « LES TILLEULS » — QR Codes participants</h1>
            <p className="mt-2 text-center text-sm">Assemblée Générale Extraordinaire du 24 juillet 2026</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-2 print:gap-3">
            {members.map((member: any) => {
              const joinUrl = buildJoinUrl(member.accessCode);
              return (
                <article key={member.id} className="break-inside-avoid rounded-3xl border border-slate-200 bg-[#fbfaf7] p-4 print:rounded-xl print:bg-white print:p-3">
                  <div className="flex items-center gap-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrCodeUrl(joinUrl, 220)} alt={`QR Code lot ${member.lotNumber}`} className="h-28 w-28 rounded-2xl bg-white p-2 ring-1 ring-slate-200 print:h-24 print:w-24" />
                    <div className="min-w-0">
                      <p className="inline-flex rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">Lot {member.lotNumber}</p>
                      <h2 className="mt-3 truncate text-lg font-semibold tracking-tight">{memberLabel(member)}</h2>
                      <p className="mt-1 text-xs text-slate-500">Code : {member.accessCode}</p>
                      <p className="mt-2 break-all text-[10px] leading-4 text-slate-400 print:hidden">{joinUrl}</p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
