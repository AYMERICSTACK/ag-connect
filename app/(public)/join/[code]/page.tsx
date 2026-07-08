import Link from "next/link";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { AutoRefresh } from "@/components/ui/AutoRefresh";
import { VoteChoiceCards } from "./VoteChoiceCards";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ code: string }>;
};

async function checkIn(formData: FormData) {
  "use server";

  const attendanceId = String(formData.get("attendanceId") || "");
  const accessCode = String(formData.get("accessCode") || "");
  if (!attendanceId) return;

  await prisma.attendance.update({
    where: { id: attendanceId },
    data: {
      checkedIn: true,
      checkedAt: new Date(),
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/participants");
  revalidatePath("/admin/votes");
  revalidatePath(`/join/${accessCode}`);
}

async function submitVote(formData: FormData) {
  "use server";

  const accessCode = String(formData.get("accessCode") || "").toUpperCase();
  const resolutionId = String(formData.get("resolutionId") || "");
  const memberId = String(formData.get("memberId") || "");
  const choiceId = String(formData.get("choiceId") || "");

  if (!accessCode || !resolutionId || !memberId || !choiceId) return;

  const resolution = await prisma.resolution.findUnique({
    where: { id: resolutionId },
    include: {
      choices: true,
      assembly: {
        include: {
          attendances: true,
          proxies: true,
        },
      },
    },
  });

  if (!resolution || resolution.status !== "OPEN") return;
  if (!resolution.choices.some((choice: any) => choice.id === choiceId)) return;

  const currentMember = await prisma.member.findUnique({
    where: { accessCode },
    include: {
      attendances: true,
      proxiesReceived: true,
      proxiesGiven: true,
    },
  });

  if (!currentMember) return;

  const attendance = currentMember.attendances.find((item: any) => item.assemblyId === resolution.assemblyId);
  const isCheckedIn = Boolean(attendance?.checkedIn);
  const proxyGiven = currentMember.proxiesGiven.find((proxy: any) => proxy.assemblyId === resolution.assemblyId);

  if (!isCheckedIn || proxyGiven) return;

  const representedMemberIds = new Set<string>([
    currentMember.id,
    ...currentMember.proxiesReceived
      .filter((proxy: any) => proxy.assemblyId === resolution.assemblyId)
      .map((proxy: any) => proxy.giverMemberId),
  ]);

  if (!representedMemberIds.has(memberId)) return;

  const representedMember = await prisma.member.findUnique({ where: { id: memberId } });
  if (!representedMember) return;

  await prisma.vote.upsert({
    where: {
      resolutionId_memberId: {
        resolutionId,
        memberId,
      },
    },
    update: {
      choiceId,
      weight: representedMember.voteWeight > 0 ? representedMember.voteWeight : 1,
    },
    create: {
      resolutionId,
      memberId,
      choiceId,
      weight: representedMember.voteWeight > 0 ? representedMember.voteWeight : 1,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/votes");
  revalidatePath(`/join/${accessCode}`);
}

function memberLabel(member: any) {
  return `${member.firstName || ""} ${member.lastName || ""}`.replace(/\s+/g, " ").trim();
}


function getResolutionResult(resolution: any) {
  const totalWeight = resolution.votes.reduce((sum: number, vote: any) => sum + (vote.weight || 1), 0);
  const choices = resolution.choices.map((choice: any) => {
    const weight = choice.votes.reduce((sum: number, vote: any) => sum + (vote.weight || 1), 0);
    const percent = totalWeight > 0 ? Math.round((weight / totalWeight) * 100) : 0;

    return {
      id: choice.id,
      label: choice.label,
      weight,
      percent,
    };
  });

  const normalized = (value: string) => value.trim().toLowerCase();
  const pour = choices.find((choice: any) => normalized(choice.label) === "pour");
  const contre = choices.find((choice: any) => normalized(choice.label) === "contre");
  const winner = [...choices].sort((a: any, b: any) => b.weight - a.weight)[0];

  const decision = pour && contre
    ? pour.weight > contre.weight
      ? "Résolution adoptée"
      : "Résolution rejetée"
    : winner && winner.weight > 0
      ? `Choix majoritaire : ${winner.label}`
      : "Aucun vote exprimé";

  return { totalWeight, choices, decision };
}

function ResultCard({ resolution }: { resolution: any }) {
  const result = getResolutionResult(resolution);

  return (
    <section className="mt-8 rounded-[2rem] border border-blue-200 bg-blue-50 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-700">Résultat publié</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-blue-950">{resolution.title}</h2>
          {resolution.description ? <p className="mt-2 text-sm text-blue-900/70">{resolution.description}</p> : null}
        </div>
        <div className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-blue-800 ring-1 ring-blue-100">
          {result.totalWeight} voix exprimée(s)
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        {result.choices.map((choice: any) => (
          <div key={choice.id} className="rounded-2xl bg-white p-4 ring-1 ring-blue-100">
            <div className="flex items-center justify-between gap-4">
              <p className="font-semibold text-slate-950">{choice.label}</p>
              <p className="text-sm font-semibold text-slate-600">{choice.weight} voix · {choice.percent}%</p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-blue-700" style={{ width: `${choice.percent}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-2xl bg-slate-950 px-5 py-4 text-center text-white">
        <p className="text-sm uppercase tracking-[0.25em] text-white/45">Décision</p>
        <p className="mt-1 text-xl font-semibold">{result.decision}</p>
        <p className="mt-2 text-xs text-white/45">Le résultat s’affiche uniquement après clôture du vote par le bureau.</p>
      </div>
    </section>
  );
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function JoinCodePage({ params }: PageProps) {
  const { code } = await params;

  const member = await prisma.member.findUnique({
    where: { accessCode: code.toUpperCase() },
    include: {
      organization: true,
      attendances: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { assembly: true },
      },
      proxiesReceived: {
        include: { giver: true, assembly: true },
      },
      proxiesGiven: {
        include: { holder: true, assembly: true },
      },
    },
  });

  if (!member) {
    return (
      <main className="min-h-screen bg-[#f7f4ef] px-5 py-8 text-slate-950">
        <section className="mx-auto max-w-xl rounded-[2rem] bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-700">AG Connect</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">Accès introuvable</h1>
          <p className="mt-3 text-slate-500">Le QR Code scanné ne correspond à aucun propriétaire enregistré.</p>
          <Link href="/" className="mt-6 inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white">Retour</Link>
        </section>
      </main>
    );
  }

  const attendance = member.attendances[0];
  const assembly = attendance?.assembly;
  const isCheckedIn = Boolean(attendance?.checkedIn);
  const proxyGiven = member.proxiesGiven.find((proxy: any) => proxy.assemblyId === assembly?.id);
  const proxiesReceived = member.proxiesReceived.filter((proxy: any) => proxy.assemblyId === assembly?.id);

  const activeResolution = assembly
    ? await prisma.resolution.findFirst({
        where: { assemblyId: assembly.id, status: "OPEN", isActive: true },
        orderBy: { order: "asc" },
        include: {
          choices: { orderBy: { order: "asc" } },
          votes: true,
        },
      })
    : null;

  const representedMembers = [
    ...(!proxyGiven ? [member] : []),
    ...proxiesReceived.map((proxy: any) => proxy.giver),
  ];

  const closedResolutions = assembly
    ? await prisma.resolution.findMany({
        where: { assemblyId: assembly.id, status: "CLOSED", isActive: true },
        orderBy: { order: "asc" },
        include: {
          choices: { orderBy: { order: "asc" }, include: { votes: true } },
          votes: true,
        },
      })
    : [];

  const latestClosedResolution = closedResolutions.at(-1);

  const representedVotesCount = activeResolution
    ? representedMembers.filter((representedMember: any) => activeResolution.votes.some((vote: any) => vote.memberId === representedMember.id)).length
    : 0;

  return (
    <main className="min-h-screen bg-[#f7f4ef] px-5 py-6 text-slate-950">
      <AutoRefresh interval={2000} />
      <section className="mx-auto max-w-3xl">
        <div className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-2xl shadow-slate-950/20 sm:p-8">
          <p className="text-sm uppercase tracking-[0.35em] text-amber-200/80">{member.organization.name}</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">Bienvenue</h1>
          <p className="mt-3 text-xl text-white/85">{memberLabel(member)}</p>
          <p className="mt-1 text-white/60">Lot {member.lotNumber} · Code {member.accessCode}</p>
        </div>

        <div className="mt-6 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/5 sm:p-8">
          {assembly ? (
            <div className="rounded-3xl bg-[#fbfaf7] p-5 ring-1 ring-slate-200">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-700">Assemblée</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">{assembly.title}</h2>
              <p className="mt-2 text-sm text-slate-500">{formatDate(assembly.date)} · {assembly.location}</p>
            </div>
          ) : null}

          <div className="mt-6 grid gap-3">
            {proxyGiven ? (
              <div className="rounded-2xl bg-amber-50 px-4 py-4 text-sm text-amber-900 ring-1 ring-amber-100">
                Vous êtes indiqué comme absent et représenté par <strong>{memberLabel(proxyGiven.holder)}</strong>. Vous ne votez donc pas depuis ce téléphone.
              </div>
            ) : null}
            {proxiesReceived.length > 0 ? (
              <div className="rounded-2xl bg-emerald-50 px-4 py-4 text-sm text-emerald-900 ring-1 ring-emerald-100">
                Vous représentez aussi {proxiesReceived.length} propriétaire(s) : {proxiesReceived.map((proxy: any) => `lot ${proxy.giver.lotNumber}`).join(", ")}. Un vote séparé sera demandé pour chaque lot représenté.
              </div>
            ) : null}
          </div>

          {attendance && !isCheckedIn && !proxyGiven ? (
            <form action={checkIn} className="mt-8">
              <input type="hidden" name="attendanceId" value={attendance.id} />
              <input type="hidden" name="accessCode" value={member.accessCode} />
              <button className="w-full rounded-2xl bg-slate-950 px-5 py-4 text-base font-semibold text-white transition hover:bg-slate-800">
                Confirmer ma présence
              </button>
            </form>
          ) : null}

          {isCheckedIn && !activeResolution ? (
            <>
              {latestClosedResolution ? <ResultCard resolution={latestClosedResolution} /> : null}

              <div className="mt-8 rounded-3xl bg-slate-950 p-6 text-center text-white">
                <p className="text-3xl">✅</p>
                <p className="mt-3 text-lg font-semibold">Vous êtes prêt pour la suite de l’assemblée.</p>
                <p className="mt-2 text-sm text-white/60">Les prochains votes apparaîtront ici lorsque le bureau les ouvrira.</p>
                <p className="mt-3 text-xs text-white/40">La page se met à jour automatiquement.</p>
              </div>

              {closedResolutions.length > 1 ? (
                <section className="mt-6 rounded-[2rem] border border-slate-200 bg-[#fbfaf7] p-5">
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-400">Résultats précédents</p>
                  <div className="mt-4 grid gap-3">
                    {closedResolutions.slice(0, -1).map((resolution: any) => {
                      const result = getResolutionResult(resolution);

                      return (
                        <div key={resolution.id} className="rounded-2xl bg-white px-4 py-3 ring-1 ring-slate-200">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <p className="font-semibold text-slate-950">{resolution.title}</p>
                            <p className="text-sm font-semibold text-slate-500">{result.decision}</p>
                          </div>
                          <p className="mt-1 text-xs text-slate-400">{result.totalWeight} voix exprimée(s)</p>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : null}
            </>
          ) : null}

          {activeResolution && isCheckedIn ? (
            <section className="mt-8 rounded-[2rem] border border-emerald-200 bg-emerald-50 p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-700">Vote ouvert</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-emerald-950">{activeResolution.title}</h2>
                  {activeResolution.description ? <p className="mt-2 text-sm text-emerald-900/70">{activeResolution.description}</p> : null}
                </div>
                <div className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-100">
                  {representedVotesCount} / {representedMembers.length} vote(s) enregistré(s)
                </div>
              </div>

              <div className="mt-6 grid gap-4">
                {representedMembers.map((representedMember: any) => {
                  const existingVote = activeResolution.votes.find((vote: any) => vote.memberId === representedMember.id);
                  const existingChoice = existingVote
                    ? activeResolution.choices.find((choice: any) => choice.id === existingVote.choiceId)
                    : null;

                  return (
                    <article key={representedMember.id} className="rounded-3xl bg-white p-5 ring-1 ring-emerald-100">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-500">Vote pour le lot {representedMember.lotNumber}</p>
                          <p className="text-lg font-semibold text-slate-950">{memberLabel(representedMember)}</p>
                        </div>
                        {existingChoice ? (
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">Vote enregistré</span>
                        ) : (
                          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-100">En attente</span>
                        )}
                      </div>

                      {!existingChoice ? (
                        <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-100">
                          Aucun vote enregistré pour le moment.
                          <p className="mt-1 text-xs text-amber-700/70">Touchez un choix ci-dessous : il sera enregistré immédiatement.</p>
                        </div>
                      ) : null}

                      <VoteChoiceCards
                        accessCode={member.accessCode}
                        resolutionId={activeResolution.id}
                        memberId={representedMember.id}
                        choices={activeResolution.choices.map((choice: any) => ({ id: choice.id, label: choice.label }))}
                        currentChoiceId={existingChoice?.id ?? null}
                        submitVote={submitVote}
                      />
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          {!isCheckedIn && !proxyGiven ? (
            <p className="mt-6 rounded-2xl bg-amber-50 px-4 py-4 text-center text-sm text-amber-900 ring-1 ring-amber-100">
              Confirmez votre présence pour pouvoir participer aux votes.
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
