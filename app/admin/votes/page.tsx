import Link from "next/link";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { AutoRefresh } from "@/components/ui/AutoRefresh";
import { ConfirmSubmitButton } from "@/components/ui/ConfirmSubmitButton";

export const dynamic = "force-dynamic";

const statusLabel = {
  DRAFT: "En attente",
  OPEN: "Vote ouvert",
  CLOSED: "Vote clôturé",
} as const;

async function getCurrentAssembly() {
  return prisma.assembly.findFirst({
    orderBy: { date: "desc" },
    include: {
      organization: true,
      attendances: { include: { member: true } },
      proxies: { include: { giver: true, holder: true } },
      resolutions: {
        where: { isActive: true },
        orderBy: { order: "asc" },
        include: {
          choices: { orderBy: { order: "asc" }, include: { votes: true } },
          votes: { include: { member: true, choice: true } },
        },
      },
    },
  });
}

async function addEvent(assemblyId: string, label: string, detail?: string, type = "INFO") {
  await prisma.assemblyEvent.create({ data: { assemblyId, label, detail, type } });
}

async function openResolution(formData: FormData) {
  "use server";

  const resolutionId = String(formData.get("resolutionId") || "");
  const assemblyId = String(formData.get("assemblyId") || "");
  if (!resolutionId || !assemblyId) return;

  await prisma.resolution.updateMany({
    where: { assemblyId, status: "OPEN" },
    data: { status: "CLOSED", closedAt: new Date() },
  });

  const resolution = await prisma.resolution.update({
    where: { id: resolutionId },
    data: { status: "OPEN", openedAt: new Date(), closedAt: null },
  });

  await prisma.assembly.update({
    where: { id: assemblyId },
    data: { status: "OPEN" },
  });

  await addEvent(assemblyId, `Vote n°${resolution.order} ouvert`, resolution.title, "RESOLUTION_OPEN");

  revalidatePath("/admin");
  revalidatePath("/admin/votes");
}

async function closeResolution(formData: FormData) {
  "use server";

  const resolutionId = String(formData.get("resolutionId") || "");
  if (!resolutionId) return;

  const resolution = await prisma.resolution.update({
    where: { id: resolutionId },
    data: { status: "CLOSED", closedAt: new Date() },
  });

  await addEvent(resolution.assemblyId, `Vote n°${resolution.order} clôturé`, resolution.title, "RESOLUTION_CLOSED");

  revalidatePath("/admin");
  revalidatePath("/admin/votes");
}

function memberLabel(member: any) {
  return `${member.firstName || ""} ${member.lastName || ""}`.replace(/\s+/g, " ").trim();
}

function sortByLot(a: any, b: any) {
  return Number(a.lotNumber) - Number(b.lotNumber);
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

function getVoteStats(resolution: any, eligibleMembers: any[]) {
  const totalWeight = resolution.votes.reduce((sum: number, vote: any) => sum + vote.weight, 0);
  const eligibleWeight = eligibleMembers.reduce((sum: number, member: any) => sum + (member.voteWeight || 1), 0);
  const votedIds = new Set(resolution.votes.map((vote: any) => vote.memberId));
  const waitingMembers = eligibleMembers.filter((member: any) => !votedIds.has(member.id));
  const votedMembers = eligibleMembers.filter((member: any) => votedIds.has(member.id));
  const participationPercent = eligibleMembers.length > 0 ? Math.round((votedMembers.length / eligibleMembers.length) * 100) : 0;

  return {
    totalWeight,
    eligibleWeight,
    votedIds,
    waitingMembers,
    votedMembers,
    participationPercent,
  };
}

export default async function AdminVotesPage() {
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

  const eligibleMembers = getEligibleMembers(assembly);
  const activeResolution = assembly.resolutions.find((resolution: any) => resolution.status === "OPEN");
  const representedLots = eligibleMembers.length;
  const activeStats = activeResolution ? getVoteStats(activeResolution, eligibleMembers) : null;

  return (
    <main className="min-h-screen bg-[#f7f4ef] px-5 py-6 text-slate-950 sm:px-8 lg:px-10">
      <AutoRefresh interval={2000} />
      <div className="mx-auto max-w-7xl">
        <header className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-2xl shadow-slate-950/20 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <Link href="/admin" className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white/75 transition hover:bg-white/15 hover:text-white">
                ← Retour au centre de pilotage
              </Link>
              <p className="mt-6 text-sm uppercase tracking-[0.35em] text-amber-200/80">{assembly.organization.name}</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">Moteur de vote</h1>
              <p className="mt-4 max-w-3xl text-white/65">Les votes sont maintenant verrouillés : un lot représenté ne peut voter qu’une seule fois par résolution.</p>
              <p className="mt-3 inline-flex rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white/55">Actualisation automatique toutes les 2 secondes</p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
                <p className="text-3xl font-semibold">{representedLots}</p>
                <p className="mt-1 text-xs text-white/60">lots votants</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
                <p className="text-3xl font-semibold">{assembly.resolutions.filter((r: any) => r.status === "CLOSED").length}</p>
                <p className="mt-1 text-xs text-white/60">clôturés</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
                <p className="text-3xl font-semibold">{activeResolution ? "1" : "0"}</p>
                <p className="mt-1 text-xs text-white/60">actif</p>
              </div>
            </div>
          </div>
        </header>

        {activeResolution && activeStats ? (
          <section className="mt-6 rounded-[2rem] border border-emerald-200 bg-emerald-50 p-6 shadow-sm shadow-emerald-900/5">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-700">Vote actuellement ouvert</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-emerald-950">{activeResolution.title}</h2>
                <p className="mt-2 text-sm text-emerald-800/80">{activeStats.votedMembers.length} / {representedLots} lots ont voté.</p>
              </div>
              <div className="min-w-[220px] rounded-3xl bg-white p-4 ring-1 ring-emerald-100">
                <div className="flex items-center justify-between text-sm font-semibold text-emerald-900">
                  <span>Participation</span>
                  <span>{activeStats.participationPercent}%</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-emerald-100">
                  <div className="h-full rounded-full bg-emerald-600" style={{ width: `${activeStats.participationPercent}%` }} />
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section className="mt-6 rounded-[2rem] border border-blue-200 bg-blue-50 p-5 shadow-sm shadow-blue-900/5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-700">Cadre de vote V1.0</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-blue-950">Majorité simple · 24 lots · 1 lot = 1 voix</h2>
              <p className="mt-2 text-sm text-blue-900/70">Cet écran sert à piloter les votes le jour J. Une seule résolution doit être ouverte à la fois.</p>
            </div>
            <Link href="/admin/report" className="rounded-full bg-white px-5 py-3 text-center text-sm font-semibold text-blue-900 ring-1 ring-blue-200 transition hover:bg-blue-100">📄 Voir le PV</Link>
          </div>
        </section>

        <div className="mt-6 grid gap-6">
          {assembly.resolutions.map((resolution: any) => {
            const stats = getVoteStats(resolution, eligibleMembers);

            return (
              <section key={resolution.id} className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">Vote n°{resolution.order}</span>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${resolution.status === "OPEN" ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" : resolution.status === "CLOSED" ? "bg-slate-950 text-white" : "bg-amber-50 text-amber-700 ring-1 ring-amber-100"}`}>
                        {statusLabel[resolution.status as keyof typeof statusLabel]}
                      </span>
                      {resolution.votes.length > 0 ? (
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-100">Votes verrouillés</span>
                      ) : null}
                    </div>
                    <h2 className="mt-3 text-2xl font-semibold tracking-tight">{resolution.title}</h2>
                    {resolution.description ? <p className="mt-2 max-w-3xl text-sm text-slate-500">{resolution.description}</p> : null}
                  </div>

                  <div className="flex gap-2">
                    {resolution.status !== "OPEN" ? (
                      <form action={openResolution}>
                        <input type="hidden" name="resolutionId" value={resolution.id} />
                        <input type="hidden" name="assemblyId" value={assembly.id} />
                        <ConfirmSubmitButton message={`${resolution.status === "CLOSED" ? "Réouvrir" : "Ouvrir"} le vote n°${resolution.order} : ${resolution.title} ?`} className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
                          {resolution.status === "CLOSED" ? "Réouvrir" : "Ouvrir"}
                        </ConfirmSubmitButton>
                      </form>
                    ) : (
                      <form action={closeResolution}>
                        <input type="hidden" name="resolutionId" value={resolution.id} />
                        <ConfirmSubmitButton message={`Clôturer le vote n°${resolution.order} ? Les participants ne pourront plus voter pour cette résolution.`} className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500">Clôturer</ConfirmSubmitButton>
                      </form>
                    )}
                  </div>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_0.9fr]">
                  <div className="space-y-3">
                    {resolution.choices.map((choice: any) => {
                      const choiceWeight = choice.votes.reduce((sum: number, vote: any) => sum + vote.weight, 0);
                      const percent = stats.totalWeight > 0 ? Math.round((choiceWeight / stats.totalWeight) * 100) : 0;

                      return (
                        <div key={choice.id} className="rounded-2xl border border-slate-200 bg-[#fbfaf7] p-4">
                          <div className="flex items-center justify-between gap-4">
                            <p className="font-semibold text-slate-950">{choice.label}</p>
                            <p className="text-sm font-semibold text-slate-500">{choiceWeight} voix · {percent}%</p>
                          </div>
                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                            <div className="h-full rounded-full bg-slate-950" style={{ width: `${percent}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="grid gap-4">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Participation</p>
                        <p className="text-sm font-semibold text-slate-950">{stats.votedMembers.length} / {representedLots}</p>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-slate-950" style={{ width: `${stats.participationPercent}%` }} />
                      </div>
                      <p className="mt-3 text-xs text-slate-400">Poids exprimé : {stats.totalWeight} / {stats.eligibleWeight} voix possibles.</p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Ont voté</p>
                      <div className="mt-4 grid max-h-56 gap-2 overflow-auto pr-1">
                        {stats.votedMembers.length === 0 ? (
                          <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">Aucun vote enregistré pour l’instant.</p>
                        ) : (
                          stats.votedMembers.map((member: any) => {
                            const vote = resolution.votes.find((item: any) => item.memberId === member.id);
                            return (
                              <p key={member.id} className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-100">
                                ✓ Lot {member.lotNumber} · {memberLabel(member)}{vote?.choice?.label ? ` · ${vote.choice.label}` : ""}
                              </p>
                            );
                          })
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">En attente</p>
                      <div className="mt-4 grid max-h-56 gap-2 overflow-auto pr-1">
                        {stats.waitingMembers.length === 0 ? (
                          <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">Tous les lots représentés ont voté.</p>
                        ) : (
                          stats.waitingMembers.map((member: any) => (
                            <p key={member.id} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                              ○ Lot {member.lotNumber} · {memberLabel(member)}
                            </p>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}
