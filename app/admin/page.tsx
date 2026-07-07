import Link from "next/link";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { AutoRefresh } from "@/components/ui/AutoRefresh";
import { ConfirmSubmitButton } from "@/components/ui/ConfirmSubmitButton";
import { SessionModeButton } from "@/components/ui/SessionModeButton";

export const dynamic = "force-dynamic";

const statusLabels = {
  DRAFT: "En préparation",
  OPEN: "En cours",
  CLOSED: "Terminée",
} as const;

const resolutionStatusLabels = {
  DRAFT: "En attente",
  OPEN: "Vote ouvert",
  CLOSED: "Vote clôturé",
} as const;

const resolutionBadgeClass = {
  DRAFT: "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
  OPEN: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  CLOSED: "bg-slate-950 text-white",
} as const;

const V1_RULES = {
  totalLots: 24,
  majority: "Majorité simple",
  voteWeight: "1 lot = 1 voix",
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function memberLabel(member: any) {
  return `${member.firstName || ""} ${member.lastName || ""}`.replace(/\s+/g, " ").trim() || member.lastName || `Lot ${member.lotNumber}`;
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

function getVoteStats(resolution: any, eligibleMembers: any[]) {
  const totalWeight = resolution.votes.reduce((sum: number, vote: any) => sum + vote.weight, 0);
  const eligibleWeight = eligibleMembers.reduce((sum: number, member: any) => sum + (member.voteWeight || 1), 0);
  const votedIds = new Set(resolution.votes.map((vote: any) => vote.memberId));
  const votedMembers = eligibleMembers.filter((member: any) => votedIds.has(member.id));
  const waitingMembers = eligibleMembers.filter((member: any) => !votedIds.has(member.id));
  const participationPercent = eligibleMembers.length > 0 ? Math.round((votedMembers.length / eligibleMembers.length) * 100) : 0;

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

  return { totalWeight, eligibleWeight, votedMembers, waitingMembers, participationPercent, choiceTotals };
}

function getAssistantState({ assembly, memberCount, representedLots, activeResolution, nextResolution, closedVotes }: any) {
  const hasMembers = memberCount > 0;
  const hasRepresentedLots = representedLots > 0;
  const quorumReached = memberCount > 0 && representedLots / memberCount >= 0.5;

  if (!hasMembers) {
    return {
      tone: "amber",
      eyebrow: "Préparation",
      title: "Commence par enregistrer les propriétaires.",
      description: "Aucun lot n’est encore enregistré. Ajoute les propriétaires avant de préparer les votes.",
      href: "/admin/participants",
      cta: "Ajouter les propriétaires",
    };
  }

  if (!hasRepresentedLots) {
    return {
      tone: "amber",
      eyebrow: "Accueil des participants",
      title: "Scanne les QR Codes ou pointe les présences.",
      description: "Les lots sont bien enregistrés, mais aucun propriétaire n’est encore présent ou représenté.",
      href: "/admin/participants",
      cta: "Pointer les présences",
    };
  }

  if (assembly.status === "DRAFT") {
    return {
      tone: quorumReached ? "emerald" : "amber",
      eyebrow: quorumReached ? "Prêt pour l’ouverture" : "À vérifier",
      title: quorumReached ? "Le quorum est atteint. Tu peux ouvrir l’assemblée." : "Participation encore faible avant ouverture.",
      description: quorumReached
        ? "Les présences et procurations sont suffisantes pour lancer la séance dans de bonnes conditions."
        : "Tu peux ouvrir l’AG si les statuts le permettent, mais il vaut mieux vérifier les derniers absents.",
      href: "/admin/participants",
      cta: "Voir les présences",
    };
  }

  if (activeResolution) {
    return {
      tone: "emerald",
      eyebrow: "Vote en cours",
      title: `Le vote n°${activeResolution.order} est ouvert.`,
      description: "Laisse les propriétaires voter, puis clôture la résolution quand la participation est suffisante.",
      href: "/admin/votes",
      cta: "Voir le détail du vote",
    };
  }

  if (nextResolution) {
    return {
      tone: "blue",
      eyebrow: "Prochaine étape",
      title: `Ouvrir le vote n°${nextResolution.order}.`,
      description: nextResolution.title,
      href: "/admin/votes",
      cta: "Préparer le vote",
    };
  }

  if (assembly.status === "OPEN" && closedVotes === assembly.resolutions.length) {
    return {
      tone: "slate",
      eyebrow: "Fin de séance",
      title: "Toutes les résolutions sont clôturées.",
      description: "Tu peux clôturer l’assemblée et générer le procès-verbal automatique.",
      href: "/admin/report",
      cta: "Générer le PV",
    };
  }

  return {
    tone: "slate",
    eyebrow: "Assemblée terminée",
    title: "La séance est clôturée.",
    description: "Les votes et le journal sont conservés pour le procès-verbal.",
    href: "/admin/votes",
    cta: "Voir les résultats",
  };
}

async function addEvent(assemblyId: string, label: string, detail?: string, type = "INFO") {
  await prisma.assemblyEvent.create({
    data: { assemblyId, label, detail, type },
  });
}

function revalidateAdmin() {
  revalidatePath("/admin");
  revalidatePath("/admin/votes");
  revalidatePath("/admin/participants");
}

async function openAssembly(formData: FormData) {
  "use server";

  const assemblyId = String(formData.get("assemblyId") || "");
  if (!assemblyId) return;

  await prisma.assembly.update({ where: { id: assemblyId }, data: { status: "OPEN" } });
  await addEvent(assemblyId, "Assemblée ouverte", "Le bureau a ouvert la séance.", "ASSEMBLY_OPEN");
  revalidateAdmin();
}

async function closeAssembly(formData: FormData) {
  "use server";

  const assemblyId = String(formData.get("assemblyId") || "");
  if (!assemblyId) return;

  await prisma.resolution.updateMany({
    where: { assemblyId, status: "OPEN" },
    data: { status: "CLOSED", closedAt: new Date() },
  });
  await prisma.assembly.update({ where: { id: assemblyId }, data: { status: "CLOSED" } });
  await addEvent(assemblyId, "Assemblée clôturée", "La séance a été clôturée par le bureau.", "ASSEMBLY_CLOSED");
  revalidateAdmin();
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

  await prisma.assembly.update({ where: { id: assemblyId }, data: { status: "OPEN" } });
  await addEvent(assemblyId, `Vote n°${resolution.order} ouvert`, resolution.title, "RESOLUTION_OPEN");
  revalidateAdmin();
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
  revalidateAdmin();
}

async function resetVotes(formData: FormData) {
  "use server";

  const assemblyId = String(formData.get("assemblyId") || "");
  if (!assemblyId) return;

  const resolutions = await prisma.resolution.findMany({ where: { assemblyId }, select: { id: true } });
  await prisma.vote.deleteMany({ where: { resolutionId: { in: resolutions.map((resolution: any) => resolution.id) } } });
  await prisma.resolution.updateMany({
    where: { assemblyId },
    data: { status: "DRAFT", openedAt: null, closedAt: null },
  });
  await prisma.assembly.update({ where: { id: assemblyId }, data: { status: "DRAFT" } });
  await addEvent(assemblyId, "Votes réinitialisés", "Tous les votes ont été effacés. Les propriétaires et procurations sont conservés.", "RESET");
  revalidateAdmin();
}

async function resetAttendances(formData: FormData) {
  "use server";

  const assemblyId = String(formData.get("assemblyId") || "");
  if (!assemblyId) return;

  await prisma.attendance.updateMany({ where: { assemblyId }, data: { checkedIn: false, checkedAt: null } });
  await addEvent(assemblyId, "Présences réinitialisées", "Tous les propriétaires ont été repassés en absent.", "RESET");
  revalidateAdmin();
}

async function resetFullAssembly(formData: FormData) {
  "use server";

  const assemblyId = String(formData.get("assemblyId") || "");
  if (!assemblyId) return;

  const resolutions = await prisma.resolution.findMany({ where: { assemblyId }, select: { id: true } });
  await prisma.vote.deleteMany({ where: { resolutionId: { in: resolutions.map((resolution: any) => resolution.id) } } });
  await prisma.proxy.deleteMany({ where: { assemblyId } });
  await prisma.attendance.updateMany({ where: { assemblyId }, data: { checkedIn: false, checkedAt: null } });
  await prisma.resolution.updateMany({ where: { assemblyId }, data: { status: "DRAFT", openedAt: null, closedAt: null } });
  await prisma.assembly.update({ where: { id: assemblyId }, data: { status: "DRAFT" } });
  await prisma.assemblyEvent.deleteMany({ where: { assemblyId } });
  await addEvent(assemblyId, "Assemblée réinitialisée", "Votes, présences, procurations et journal ont été remis à zéro.", "RESET_FULL");
  revalidateAdmin();
}

export default async function AdminDashboardPage() {
  const assembly = await prisma.assembly.findFirst({
    orderBy: { date: "desc" },
    include: {
      organization: true,
      resolutions: {
        where: { isActive: true },
        orderBy: { order: "asc" },
        include: {
          choices: { orderBy: { order: "asc" } },
          votes: { include: { member: true, choice: true } },
        },
      },
      attendances: { include: { member: true } },
      proxies: { include: { giver: true, holder: true } },
      events: { orderBy: { createdAt: "desc" }, take: 14 },
    },
  });

  const memberCount = assembly ? await prisma.member.count({ where: { organizationId: assembly.organizationId } }) : 0;

  if (!assembly) {
    return (
      <main className="min-h-screen bg-[#f7f4ef] px-6 py-10 text-slate-950">
        <div className="mx-auto max-w-5xl rounded-[2rem] border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-700">AG Connect</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">Aucune assemblée trouvée</h1>
          <p className="mt-3 text-slate-600">Lance le seed pour créer l’Assemblée Générale Extraordinaire des Tilleuls.</p>
        </div>
      </main>
    );
  }

  const eligibleMembers = getEligibleMembers(assembly);
  const checkedInCount = assembly.attendances.filter((attendance: any) => attendance.checkedIn).length;
  const representedLots = eligibleMembers.length;
  const representedPercent = memberCount ? Math.round((representedLots / memberCount) * 100) : 0;
  const quorumReached = memberCount > 0 && representedLots / memberCount >= 0.5;
  const closedVotes = assembly.resolutions.filter((resolution: any) => resolution.status === "CLOSED").length;
  const activeResolution = assembly.resolutions.find((resolution: any) => resolution.status === "OPEN");
  const nextResolution = assembly.resolutions.find((resolution: any) => resolution.status === "DRAFT") || null;
  const activeStats = activeResolution ? getVoteStats(activeResolution, eligibleMembers) : null;
  const progressPercent = assembly.resolutions.length ? Math.round((closedVotes / assembly.resolutions.length) * 100) : 0;
  const assistant = getAssistantState({ assembly, memberCount, representedLots, activeResolution, nextResolution, closedVotes });
  const assistantToneClass = {
    amber: "border-amber-200 bg-amber-50 text-amber-950",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-950",
    blue: "border-blue-200 bg-blue-50 text-blue-950",
    slate: "border-slate-200 bg-slate-50 text-slate-950",
  }[assistant.tone];

  const stats = [
    { label: "Propriétaires", value: memberCount, detail: "lots enregistrés", icon: "👥" },
    { label: "Présents", value: checkedInCount, detail: `${representedLots} lots représentés`, icon: "✅" },
    { label: "Procurations", value: assembly.proxies.length, detail: "mandats déclarés", icon: "📄" },
    { label: "Votes clôturés", value: closedVotes, detail: `${assembly.resolutions.length} résolution(s)`, icon: "🗳️" },
  ];

  const checklist = [
    { label: "Propriétaires importés", done: memberCount > 0, detail: `${memberCount} lot(s)` },
    { label: "Présences pointées", done: checkedInCount > 0, detail: `${checkedInCount} présent(s)` },
    { label: "Lots représentés", done: representedLots > 0, detail: `${representedLots} votant(s)` },
    { label: "Quorum indicatif", done: quorumReached, detail: `${representedPercent}%` },
  ];

  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f4ef] text-slate-950">
      <AutoRefresh interval={2000} />
      <section className="relative px-5 py-6 sm:px-8 lg:px-10">
        <div className="absolute inset-x-0 top-0 -z-10 h-[34rem] bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.26),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.15),_transparent_28%),linear-gradient(135deg,#0f172a,#292524)]" />

        <div className="mx-auto max-w-7xl">
          <header className="overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950 text-white shadow-2xl shadow-slate-950/25">
            <div className="grid gap-0 xl:grid-cols-[1fr_440px]">
              <div className="p-6 sm:p-8">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white/80">
                    <span className={`h-2 w-2 rounded-full ${assembly.status === "OPEN" ? "bg-emerald-400" : assembly.status === "CLOSED" ? "bg-slate-400" : "bg-amber-300"}`} />
                    Centre de pilotage · {statusLabels[assembly.status as keyof typeof statusLabels]}
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/55">Live refresh · 2s</span>
                </div>
                <p className="mt-7 text-sm uppercase tracking-[0.35em] text-amber-200/80">{assembly.organization.name}</p>
                <h1 className="mt-3 max-w-4xl text-3xl font-semibold tracking-tight sm:text-5xl">{assembly.title}</h1>
                <p className="mt-4 text-sm text-white/70">{formatDate(assembly.date)} · {formatTime(assembly.date)} · {assembly.location}</p>

                <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:max-w-4xl">
                  <form action={assembly.status === "OPEN" ? closeAssembly : openAssembly}>
                    <input type="hidden" name="assemblyId" value={assembly.id} />
                    {assembly.status === "OPEN" ? (
                      <ConfirmSubmitButton message="Clôturer l’assemblée ? Les votes ouverts seront clôturés." className="w-full rounded-3xl bg-white px-5 py-4 text-sm font-semibold text-slate-950 transition hover:bg-white/90">
                        🔒 Clôturer l’AG
                      </ConfirmSubmitButton>
                    ) : assembly.status === "CLOSED" ? (
                      <button className="w-full rounded-3xl bg-white/10 px-5 py-4 text-sm font-semibold text-white ring-1 ring-white/15 transition hover:bg-white/15">▶ Réouvrir l’AG</button>
                    ) : (
                      <button className="w-full rounded-3xl bg-amber-300 px-5 py-4 text-sm font-semibold text-slate-950 transition hover:bg-amber-200">▶ Ouvrir l’AG</button>
                    )}
                  </form>
                  <Link href="/admin/votes" className="rounded-3xl border border-white/15 bg-white/10 px-5 py-4 text-center text-sm font-semibold text-white transition hover:bg-white/15">
                    🗳️ Moteur de vote
                  </Link>
                  <Link href="/admin/resolutions" className="rounded-3xl border border-white/15 bg-white/10 px-5 py-4 text-center text-sm font-semibold text-white transition hover:bg-white/15">
                    📋 Résolutions
                  </Link>
                  <SessionModeButton />
                </div>
              </div>

              <div className="border-t border-white/10 bg-white/[0.04] p-6 sm:p-8 xl:border-l xl:border-t-0">
                <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-200/80">Assistant de séance</p>
                <div className={`mt-4 rounded-[1.5rem] border p-5 ${assistantToneClass}`}>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] opacity-70">{assistant.eyebrow}</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight">{assistant.title}</h2>
                  <p className="mt-2 text-sm opacity-75">{assistant.description}</p>
                  <Link href={assistant.href} className="mt-5 inline-flex rounded-full bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800">
                    {assistant.cta}
                  </Link>
                </div>

                <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-white/10 p-5">
                  <div className="flex items-center justify-between text-sm text-white/65"><span>Progression AG</span><span>{progressPercent}%</span></div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-amber-300" style={{ width: `${progressPercent}%` }} />
                  </div>
                  <p className="mt-3 text-sm text-white/55">{closedVotes} résolution(s) clôturée(s) sur {assembly.resolutions.length}.</p>
                </div>
              </div>
            </div>
          </header>

          <section className="mt-6 rounded-[2rem] border border-emerald-200 bg-emerald-50 p-5 shadow-sm shadow-emerald-900/5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-700">Release Candidate · Règles validées</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-emerald-950">AG prête pour une simulation complète</h2>
                <p className="mt-2 text-sm text-emerald-900/70">Les règles de cette AG sont figées : 24 lots, majorité simple, chaque lot compte pour une voix.</p>
              </div>
              <div className="grid gap-2 text-sm sm:grid-cols-3 lg:min-w-[520px]">
                <div className="rounded-2xl bg-white px-4 py-3 font-semibold text-emerald-950 ring-1 ring-emerald-100">🏡 {V1_RULES.totalLots} lots</div>
                <div className="rounded-2xl bg-white px-4 py-3 font-semibold text-emerald-950 ring-1 ring-emerald-100">⚖️ {V1_RULES.majority}</div>
                <div className="rounded-2xl bg-white px-4 py-3 font-semibold text-emerald-950 ring-1 ring-emerald-100">🗳️ {V1_RULES.voteWeight}</div>
              </div>
            </div>
          </section>

          <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat) => (
              <article key={stat.label} className="rounded-[1.6rem] border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-900/5 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-900/10">
                <div className="flex items-center justify-between">
                  <span className="rounded-2xl bg-amber-50 px-3 py-2 text-xl">{stat.icon}</span>
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Live</span>
                </div>
                <p className="mt-5 text-sm font-medium text-slate-500">{stat.label}</p>
                <p className="mt-1 text-4xl font-semibold tracking-tight text-slate-950">{stat.value}</p>
                <p className="mt-2 text-sm text-slate-500">{stat.detail}</p>
              </article>
            ))}
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-700">Déroulement guidé</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight">Pilotage de séance</h2>
                  <p className="mt-2 text-sm text-slate-500">Une seule résolution peut être ouverte à la fois. AG Connect verrouille automatiquement le reste.</p>
                </div>
                <div className="min-w-[210px] rounded-3xl bg-slate-950 p-4 text-white">
                  <div className="flex items-center justify-between text-sm text-white/65"><span>Lots représentés</span><span>{representedPercent}%</span></div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-amber-300" style={{ width: `${Math.min(representedPercent, 100)}%` }} /></div>
                  <p className="mt-3 text-xs text-white/55">{representedLots} / {memberCount || "—"} lots</p>
                </div>
              </div>

              {activeResolution && activeStats ? (
                <div className="mt-6 rounded-[1.6rem] border border-emerald-200 bg-emerald-50 p-5">
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-emerald-700">Vote ouvert actuellement</p>
                  <h3 className="mt-2 text-xl font-semibold text-emerald-950">{activeResolution.title}</h3>
                  <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div>
                      <div className="flex items-center justify-between text-sm font-semibold text-emerald-900"><span>Votes reçus</span><span>{activeStats.votedMembers.length} / {representedLots}</span></div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-emerald-100"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${activeStats.participationPercent}%` }} /></div>
                    </div>
                    <form action={closeResolution}>
                      <input type="hidden" name="resolutionId" value={activeResolution.id} />
                      <button className="w-full rounded-full bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-500">Clôturer ce vote</button>
                    </form>
                  </div>
                </div>
              ) : nextResolution ? (
                <div className="mt-6 rounded-[1.6rem] border border-blue-200 bg-blue-50 p-5">
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-blue-700">Prochaine action</p>
                  <h3 className="mt-2 text-xl font-semibold text-blue-950">Ouvrir : {nextResolution.title}</h3>
                  <p className="mt-2 text-sm text-blue-800/70">Les propriétaires connectés verront automatiquement le vote apparaître sur leur téléphone.</p>
                  <form action={openResolution} className="mt-4">
                    <input type="hidden" name="assemblyId" value={assembly.id} />
                    <input type="hidden" name="resolutionId" value={nextResolution.id} />
                    <ConfirmSubmitButton message={`Ouvrir le vote : ${nextResolution.title} ? Les téléphones afficheront immédiatement cette résolution.`} className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">▶ Ouvrir le vote suivant</ConfirmSubmitButton>
                  </form>
                </div>
              ) : (
                <div className="mt-6 rounded-[1.6rem] border border-slate-200 bg-slate-50 p-5">
                  <p className="font-semibold text-slate-950">Toutes les résolutions sont clôturées.</p>
                  <p className="mt-2 text-sm text-slate-500">Tu peux clôturer l’assemblée ou générer le procès-verbal.</p>
                  <Link href="/admin/report" className="mt-4 inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">📄 Générer le procès-verbal</Link>
                </div>
              )}

              <div className="mt-6 grid gap-3">
                {assembly.resolutions.map((resolution: any) => {
                  const stats = getVoteStats(resolution, eligibleMembers);
                  return (
                    <article key={resolution.id} className="rounded-3xl border border-slate-200 bg-[#fbfaf7] p-5 transition hover:border-slate-300 hover:bg-white">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-950 text-sm font-semibold text-white">{resolution.order}</span>
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${resolutionBadgeClass[resolution.status as keyof typeof resolutionBadgeClass]}`}>{resolutionStatusLabels[resolution.status as keyof typeof resolutionStatusLabels]}</span>
                            {resolution.votes.length > 0 ? <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-100">{resolution.votes.length} vote(s)</span> : null}
                          </div>
                          <h3 className="mt-3 text-lg font-semibold text-slate-950">{resolution.title}</h3>
                          <p className="mt-1 text-sm text-slate-500">Participation : {stats.votedMembers.length} / {representedLots} lots · {stats.totalWeight} voix exprimées</p>

                          {resolution.status === "CLOSED" && stats.totalWeight > 0 ? (
                            <div className="mt-4 grid gap-2">
                              {stats.choiceTotals.map((choice: any) => (
                                <div key={choice.id} className="rounded-2xl bg-white p-3 ring-1 ring-slate-100">
                                  <div className="flex items-center justify-between gap-3 text-sm">
                                    <span className="font-semibold text-slate-700">{choice.label}</span>
                                    <span className="text-slate-500">{choice.weight} voix · {choice.percent}%</span>
                                  </div>
                                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                                    <div className="h-full rounded-full bg-slate-950" style={{ width: `${choice.percent}%` }} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2 lg:justify-end">
                          {resolution.status === "OPEN" ? (
                            <form action={closeResolution}>
                              <input type="hidden" name="resolutionId" value={resolution.id} />
                              <ConfirmSubmitButton message={`Clôturer le vote n°${resolution.order} ? Les participants ne pourront plus voter pour cette résolution.`} className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500">Clôturer</ConfirmSubmitButton>
                            </form>
                          ) : (
                            <form action={openResolution}>
                              <input type="hidden" name="assemblyId" value={assembly.id} />
                              <input type="hidden" name="resolutionId" value={resolution.id} />
                              <ConfirmSubmitButton message={`${resolution.status === "CLOSED" ? "Réouvrir" : "Ouvrir"} le vote n°${resolution.order} : ${resolution.title} ?`} className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">{resolution.status === "CLOSED" ? "Réouvrir" : "Ouvrir"}</ConfirmSubmitButton>
                            </form>
                          )}
                          <Link href="/admin/votes" className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50">Détails</Link>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <aside className="grid gap-6">
              <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/5">
                <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-700">Vérification avant ouverture</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">Check-list AG</h2>
                <div className="mt-5 grid gap-3">
                  {checklist.map((item) => (
                    <div key={item.label} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-[#fbfaf7] px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className={`grid h-7 w-7 place-items-center rounded-full text-sm font-semibold ${item.done ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{item.done ? "✓" : "!"}</span>
                        <span className="text-sm font-semibold text-slate-800">{item.label}</span>
                      </div>
                      <span className="text-sm text-slate-500">{item.detail}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-6 rounded-3xl bg-slate-950 p-5 text-white">
                  <p className="text-sm text-white/60">Lots présents ou représentés</p>
                  <div className="mt-3 flex items-end gap-2"><span className="text-5xl font-semibold tracking-tight">{representedLots}</span><span className="pb-2 text-white/50">/ {memberCount || "—"}</span></div>
                  <div className="mt-5 h-2 rounded-full bg-white/10"><div className="h-2 rounded-full bg-amber-300" style={{ width: `${Math.min(representedPercent, 100)}%` }} /></div>
                  <p className="mt-3 text-sm text-white/65">{representedPercent}% des lots sont présents ou représentés.</p>
                </div>
                <div className="mt-5 grid gap-3">
                  <Link href="/admin/participants" className="rounded-full bg-amber-500 px-4 py-3 text-center text-sm font-semibold text-slate-950 transition hover:bg-amber-400">Présences & procurations</Link>
                  <Link href="/admin/votes" className="rounded-full bg-slate-950 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-slate-800">Résultats détaillés</Link>
                  <Link href="/admin/report" className="rounded-full bg-white px-4 py-3 text-center text-sm font-semibold text-slate-950 ring-1 ring-slate-200 transition hover:bg-slate-50">Générer le PV</Link>
                </div>
              </section>

              <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/5">
                <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-700">Journal de séance</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">Historique</h2>
                <div className="mt-5 grid max-h-[360px] gap-3 overflow-auto pr-1">
                  {assembly.events.length === 0 ? (
                    <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">Aucun événement pour l’instant.</p>
                  ) : (
                    assembly.events.map((event: any) => (
                      <div key={event.id} className="rounded-2xl border border-slate-200 bg-[#fbfaf7] px-4 py-3">
                        <div className="flex items-center justify-between gap-3"><p className="font-semibold text-slate-950">{event.label}</p><p className="text-xs text-slate-400">{formatTime(event.createdAt)}</p></div>
                        {event.detail ? <p className="mt-1 text-sm text-slate-500">{event.detail}</p> : null}
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="rounded-[2rem] border border-red-200 bg-red-50 p-6 shadow-sm shadow-red-900/5">
                <p className="text-sm font-semibold uppercase tracking-[0.25em] text-red-700">Zone de test</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-red-950">Réinitialiser</h2>
                <p className="mt-2 text-sm text-red-800/75">À utiliser pendant les essais avant l’AG. Les propriétaires restent toujours conservés.</p>
                <div className="mt-5 grid gap-3">
                  <form action={resetVotes}>
                    <input type="hidden" name="assemblyId" value={assembly.id} />
                    <ConfirmSubmitButton message="Réinitialiser tous les votes ? Les présences et propriétaires seront conservés." className="w-full rounded-full bg-white px-4 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-200 transition hover:bg-red-100">Réinitialiser les votes</ConfirmSubmitButton>
                  </form>
                  <form action={resetAttendances}>
                    <input type="hidden" name="assemblyId" value={assembly.id} />
                    <ConfirmSubmitButton message="Réinitialiser les présences ? Tous les lots repasseront absents." className="w-full rounded-full bg-white px-4 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-200 transition hover:bg-red-100">Réinitialiser les présences</ConfirmSubmitButton>
                  </form>
                  <form action={resetFullAssembly}>
                    <input type="hidden" name="assemblyId" value={assembly.id} />
                    <ConfirmSubmitButton message="DANGER : réinitialisation complète de l’AG. Votes, présences, procurations et journal seront supprimés. À utiliser uniquement pendant les tests. Confirmer ?" className="w-full rounded-full bg-red-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-600">Réinitialisation complète</ConfirmSubmitButton>
                  </form>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
}
