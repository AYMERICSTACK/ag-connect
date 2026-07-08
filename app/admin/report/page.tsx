import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PrintButton } from "@/components/ui/PrintButton";
import { formatMemberDisplay } from "@/lib/member-display";

export const dynamic = "force-dynamic";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatTime(date?: Date | null) {
  if (!date) return "—";

  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}


function sortByLot(a: any, b: any) {
  const aLot = Number(a.lotNumber);
  const bLot = Number(b.lotNumber);
  if (Number.isFinite(aLot) && Number.isFinite(bLot)) return aLot - bLot;
  return String(a.lotNumber).localeCompare(String(b.lotNumber), "fr", { numeric: true });
}

function getEligibleMembers(assembly: any) {
  const presentMembers = assembly.attendances
    .filter((attendance: any) => attendance.checkedIn)
    .map((attendance: any) => attendance.member);

  const proxyGiverIds = new Set(assembly.proxies.map((proxy: any) => proxy.giverMemberId));
  const presentIds = new Set(presentMembers.map((member: any) => member.id));

  const selfVoters = presentMembers.filter((member: any) => !proxyGiverIds.has(member.id));
  const proxyVoters = assembly.proxies
    .filter((proxy: any) => presentIds.has(proxy.holderMemberId))
    .map((proxy: any) => proxy.giver);

  return [...selfVoters, ...proxyVoters].sort(sortByLot);
}

function getResolutionStats(resolution: any, eligibleMembers: any[]) {
  const totalWeight = resolution.votes.reduce((sum: number, vote: any) => sum + vote.weight, 0);
  const eligibleWeight = eligibleMembers.reduce((sum: number, member: any) => sum + (member.voteWeight || 1), 0);
  const votedIds = new Set(resolution.votes.map((vote: any) => vote.memberId));
  const participation = eligibleMembers.length > 0 ? Math.round((votedIds.size / eligibleMembers.length) * 100) : 0;

  const choiceTotals = resolution.choices.map((choice: any) => {
    const votes = resolution.votes.filter((vote: any) => vote.choiceId === choice.id);
    const weight = votes.reduce((sum: number, vote: any) => sum + vote.weight, 0);
    const percent = totalWeight > 0 ? Math.round((weight / totalWeight) * 100) : 0;

    return {
      id: choice.id,
      label: choice.label,
      order: choice.order,
      count: votes.length,
      weight,
      percent,
    };
  });

  const winner = [...choiceTotals]
    .filter((choice: any) => choice.label.toLowerCase() !== "abstention")
    .sort((a: any, b: any) => b.weight - a.weight)[0];

  const pour = choiceTotals.find((choice: any) => choice.label.toLowerCase() === "pour");
  const contre = choiceTotals.find((choice: any) => choice.label.toLowerCase() === "contre");

  const decision = pour && contre
    ? pour.weight > contre.weight
      ? "Adoptée"
      : "Rejetée"
    : winner && winner.weight > 0
      ? `Option retenue : ${winner.label}`
      : "Non déterminée";

  return { totalWeight, eligibleWeight, participation, choiceTotals, decision };
}

async function getCurrentAssembly() {
  return prisma.assembly.findFirst({
    orderBy: { date: "desc" },
    include: {
      organization: { include: { members: true } },
      attendances: { include: { member: true }, orderBy: { member: { lotNumber: "asc" } } },
      proxies: { include: { giver: true, holder: true }, orderBy: { createdAt: "asc" } },
      events: { orderBy: { createdAt: "asc" } },
      resolutions: {
        where: { isActive: true },
        orderBy: { order: "asc" },
        include: {
          choices: { orderBy: { order: "asc" } },
          votes: { include: { member: true, choice: true }, orderBy: { createdAt: "asc" } },
        },
      },
    },
  });
}

export default async function AdminReportPage() {
  const assembly = await getCurrentAssembly();

  if (!assembly) {
    return (
      <main className="min-h-screen bg-[#f7f4ef] px-6 py-10 text-slate-950">
        <div className="mx-auto max-w-5xl rounded-[2rem] border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-700">AG Connect</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">Aucune assemblée trouvée</h1>
          <Link href="/admin" className="mt-6 inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white">Retour admin</Link>
        </div>
      </main>
    );
  }

  const members = [...assembly.organization.members].sort(sortByLot);
  const presentAttendances = assembly.attendances.filter((attendance: any) => attendance.checkedIn).sort((a: any, b: any) => sortByLot(a.member, b.member));
  const eligibleMembers = getEligibleMembers(assembly);
  const representedLots = eligibleMembers.length;
  const representedPercent = members.length > 0 ? Math.round((representedLots / members.length) * 100) : 0;
  const quorumReached = members.length > 0 && representedLots / members.length >= 0.5;
  const generatedAt = new Date();

  return (
    <main className="min-h-screen bg-[#f7f4ef] px-5 py-6 text-slate-950 print:bg-white print:px-0 print:py-0">
      <div className="mx-auto max-w-6xl print:max-w-none">
        <header className="mb-6 rounded-[2rem] bg-slate-950 p-6 text-white shadow-2xl shadow-slate-950/20 print:hidden sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <Link href="/admin" className="inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white/75 transition hover:bg-white/15 hover:text-white">
                ← Retour au centre de pilotage
              </Link>
              <p className="mt-6 text-sm uppercase tracking-[0.35em] text-amber-200/80">Procès-verbal automatique</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">Document de séance</h1>
              <p className="mt-4 max-w-3xl text-white/65">PV HTML prêt à imprimer ou enregistrer en PDF depuis le navigateur. Les données proviennent directement des présences, procurations, votes et du journal.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <PrintButton className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200">
                Imprimer / PDF
              </PrintButton>
              <Link href="/admin/participants" className="rounded-full border border-white/15 bg-white/10 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-white/15">
                Feuille de présence
              </Link>
            </div>
          </div>
        </header>

        <article className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/5 print:rounded-none print:border-0 print:p-0 print:shadow-none sm:p-10">
          <section className="border-b border-slate-200 pb-8 print:pb-5">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-700 print:text-slate-500">{assembly.organization.name}</p>
                <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 print:text-2xl">Procès-verbal d’Assemblée Générale Extraordinaire</h1>
                <p className="mt-3 text-slate-600">{assembly.title}</p>
              </div>
              <div className="rounded-3xl bg-slate-950 p-5 text-white print:border print:border-slate-300 print:bg-white print:text-slate-950">
                <p className="text-sm opacity-70">Document généré le</p>
                <p className="mt-1 text-xl font-semibold">{formatShortDate(generatedAt)}</p>
                <p className="mt-1 text-sm opacity-70">à {formatTime(generatedAt)}</p>
              </div>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-3 print:grid-cols-3">
              <div className="rounded-3xl border border-slate-200 bg-[#fbfaf7] p-5 print:bg-white">
                <p className="text-sm text-slate-500">Date et heure</p>
                <p className="mt-2 font-semibold text-slate-950">{formatDate(assembly.date)}</p>
                <p className="text-sm text-slate-500">{formatTime(assembly.date)}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-[#fbfaf7] p-5 print:bg-white">
                <p className="text-sm text-slate-500">Lieu</p>
                <p className="mt-2 font-semibold text-slate-950">{assembly.location}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-[#fbfaf7] p-5 print:bg-white">
                <p className="text-sm text-slate-500">Statut</p>
                <p className="mt-2 font-semibold text-slate-950">{assembly.status === "CLOSED" ? "Assemblée clôturée" : assembly.status === "OPEN" ? "Assemblée en cours" : "Assemblée en préparation"}</p>
              </div>
            </div>
          </section>

          <section className="border-b border-slate-200 py-8 print:py-5">
            <h2 className="text-2xl font-semibold tracking-tight print:text-xl">Synthèse de présence</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-4 print:grid-cols-4">
              <div className="rounded-3xl bg-slate-950 p-5 text-white print:border print:border-slate-300 print:bg-white print:text-slate-950">
                <p className="text-sm opacity-70">Lots enregistrés</p>
                <p className="mt-2 text-4xl font-semibold print:text-2xl">{members.length}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-[#fbfaf7] p-5 print:bg-white">
                <p className="text-sm text-slate-500">Présents</p>
                <p className="mt-2 text-4xl font-semibold print:text-2xl">{presentAttendances.length}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-[#fbfaf7] p-5 print:bg-white">
                <p className="text-sm text-slate-500">Procurations</p>
                <p className="mt-2 text-4xl font-semibold print:text-2xl">{assembly.proxies.length}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-[#fbfaf7] p-5 print:bg-white">
                <p className="text-sm text-slate-500">Représentation</p>
                <p className="mt-2 text-4xl font-semibold print:text-2xl">{representedPercent}%</p>
                <p className={`mt-1 text-sm font-semibold ${quorumReached ? "text-emerald-700" : "text-amber-700"}`}>{quorumReached ? "Quorum atteint" : "Quorum à vérifier"}</p>
              </div>
            </div>
            <p className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-600">
              Sur {members.length} lot(s) enregistré(s), {representedLots} lot(s) sont présents ou représentés, soit {representedPercent}% des lots. Les procurations ont été prises en compte dans le calcul des lots représentés.
            </p>
          </section>

          <section className="border-b border-slate-200 py-8 print:break-before-page print:py-5">
            <h2 className="text-2xl font-semibold tracking-tight print:text-xl">Présents et représentés</h2>
            <div className="mt-5 overflow-hidden rounded-3xl border border-slate-200 print:rounded-none">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-slate-950 text-white print:bg-slate-100 print:text-slate-950">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Lot</th>
                    <th className="px-4 py-3 font-semibold">Propriétaire</th>
                    <th className="px-4 py-3 font-semibold">Statut</th>
                    <th className="px-4 py-3 font-semibold">Mandataire</th>
                  </tr>
                </thead>
                <tbody>
                  {eligibleMembers.map((member: any) => {
                    const directPresence = presentAttendances.some((attendance: any) => attendance.memberId === member.id);
                    const proxy = assembly.proxies.find((item: any) => item.giverMemberId === member.id);

                    return (
                      <tr key={member.id} className="border-t border-slate-200">
                        <td className="px-4 py-3 font-semibold">{member.lotNumber}</td>
                        <td className="px-4 py-3">{formatMemberDisplay(member)}</td>
                        <td className="px-4 py-3">{directPresence ? "Présent" : "Représenté"}</td>
                        <td className="px-4 py-3">{proxy ? `${formatMemberDisplay(proxy.holder)} — Lot ${proxy.holder.lotNumber}` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="border-b border-slate-200 py-8 print:py-5">
            <h2 className="text-2xl font-semibold tracking-tight print:text-xl">Résolutions et résultats</h2>
            <div className="mt-5 grid gap-5">
              {assembly.resolutions.map((resolution: any) => {
                const stats = getResolutionStats(resolution, eligibleMembers);

                return (
                  <article key={resolution.id} className="rounded-3xl border border-slate-200 bg-[#fbfaf7] p-5 print:break-inside-avoid print:bg-white">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">Résolution n°{resolution.order}</p>
                        <h3 className="mt-2 text-xl font-semibold text-slate-950">{resolution.title}</h3>
                        {resolution.description ? <p className="mt-2 text-sm leading-6 text-slate-600">{resolution.description}</p> : null}
                      </div>
                      <div className="rounded-2xl bg-white px-4 py-3 text-sm ring-1 ring-slate-200 print:bg-white">
                        <p><strong>Ouverture :</strong> {formatTime(resolution.openedAt)}</p>
                        <p><strong>Clôture :</strong> {formatTime(resolution.closedAt)}</p>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-3 print:grid-cols-3">
                      <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                        <p className="text-sm text-slate-500">Participation</p>
                        <p className="mt-1 text-2xl font-semibold">{stats.participation}%</p>
                      </div>
                      <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                        <p className="text-sm text-slate-500">Voix exprimées</p>
                        <p className="mt-1 text-2xl font-semibold">{stats.totalWeight}</p>
                      </div>
                      <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                        <p className="text-sm text-slate-500">Décision</p>
                        <p className="mt-1 text-lg font-semibold">{stats.decision}</p>
                      </div>
                    </div>

                    <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 print:rounded-none">
                      <table className="w-full border-collapse text-left text-sm">
                        <thead className="bg-white text-slate-500 print:bg-slate-100 print:text-slate-950">
                          <tr>
                            <th className="px-4 py-3 font-semibold">Choix</th>
                            <th className="px-4 py-3 font-semibold">Votes</th>
                            <th className="px-4 py-3 font-semibold">Voix</th>
                            <th className="px-4 py-3 font-semibold">Pourcentage</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.choiceTotals.map((choice: any) => (
                            <tr key={choice.id} className="border-t border-slate-200">
                              <td className="px-4 py-3 font-semibold">{choice.label}</td>
                              <td className="px-4 py-3">{choice.count}</td>
                              <td className="px-4 py-3">{choice.weight}</td>
                              <td className="px-4 py-3">{choice.percent}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="grid gap-8 border-b border-slate-200 py-8 print:break-before-page print:py-5 lg:grid-cols-2">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight print:text-xl">Journal de séance</h2>
              <div className="mt-5 grid gap-3">
                {assembly.events.length === 0 ? (
                  <p className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-500">Aucun événement enregistré.</p>
                ) : (
                  assembly.events.map((event: any) => (
                    <div key={event.id} className="rounded-2xl border border-slate-200 bg-[#fbfaf7] p-4 print:bg-white">
                      <div className="flex items-center justify-between gap-4">
                        <p className="font-semibold text-slate-950">{event.label}</p>
                        <p className="text-sm text-slate-500">{formatTime(event.createdAt)}</p>
                      </div>
                      {event.detail ? <p className="mt-1 text-sm text-slate-600">{event.detail}</p> : null}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-semibold tracking-tight print:text-xl">Observations et échanges de séance</h2>
              <div className="mt-5 min-h-[320px] rounded-3xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-400 print:min-h-[420px]">
                Notes à compléter après l’assemblée : échanges, remarques éventuelles, demandes particulières, réserves ou observations.
              </div>
            </div>
          </section>

          <section className="py-8 print:py-5">
            <h2 className="text-2xl font-semibold tracking-tight print:text-xl">Signatures</h2>
            <div className="mt-6 grid gap-5 sm:grid-cols-2 print:grid-cols-2">
              <div className="min-h-[160px] rounded-3xl border border-slate-200 p-5">
                <p className="font-semibold">Le Président / représentant du bureau</p>
                <p className="mt-2 text-sm text-slate-500">Nom, date et signature</p>
              </div>
              <div className="min-h-[160px] rounded-3xl border border-slate-200 p-5">
                <p className="font-semibold">Le/la Secrétaire de séance</p>
                <p className="mt-2 text-sm text-slate-500">Nom, date et signature</p>
              </div>
            </div>
          </section>
        </article>
      </div>
    </main>
  );
}
