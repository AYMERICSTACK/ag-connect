import Link from "next/link";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ConfirmSubmitButton } from "@/components/ui/ConfirmSubmitButton";

export const dynamic = "force-dynamic";

function cleanLines(value: FormDataEntryValue | null) {
  return String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function revalidateResolutions() {
  revalidatePath("/admin");
  revalidatePath("/admin/resolutions");
  revalidatePath("/admin/votes");
  revalidatePath("/admin/report");
}

async function getCurrentAssembly() {
  return prisma.assembly.findFirst({
    orderBy: { date: "desc" },
    include: {
      organization: true,
      resolutions: {
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        include: {
          choices: { orderBy: { order: "asc" }, include: { votes: true } },
          votes: true,
        },
      },
    },
  });
}

async function addEvent(assemblyId: string, label: string, detail?: string, type = "INFO") {
  await prisma.assemblyEvent.create({ data: { assemblyId, label, detail, type } });
}

async function createResolution(formData: FormData) {
  "use server";

  const assemblyId = String(formData.get("assemblyId") || "");
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const choices = cleanLines(formData.get("choices"));

  if (!assemblyId || !title || choices.length < 2) return;

  const lastResolution = await prisma.resolution.findFirst({
    where: { assemblyId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const resolution = await prisma.resolution.create({
    data: {
      assemblyId,
      title,
      description: description || null,
      order: (lastResolution?.order || 0) + 1,
      choices: {
        create: choices.map((label, index) => ({ label, order: index + 1 })),
      },
    },
  });

  await addEvent(assemblyId, "Résolution ajoutée", resolution.title, "RESOLUTION_CREATED");
  revalidateResolutions();
}

async function updateResolution(formData: FormData) {
  "use server";

  const resolutionId = String(formData.get("resolutionId") || "");
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const order = Number(formData.get("order") || 0);

  if (!resolutionId || !title) return;

  const resolution = await prisma.resolution.update({
    where: { id: resolutionId },
    data: {
      title,
      description: description || null,
      order: Number.isFinite(order) && order > 0 ? order : undefined,
    },
  });

  await addEvent(resolution.assemblyId, "Résolution modifiée", resolution.title, "RESOLUTION_UPDATED");
  revalidateResolutions();
}

async function toggleResolution(formData: FormData) {
  "use server";

  const resolutionId = String(formData.get("resolutionId") || "");
  const isActive = String(formData.get("isActive") || "false") === "true";
  if (!resolutionId) return;

  const resolution = await prisma.resolution.update({
    where: { id: resolutionId },
    data: {
      isActive,
      status: isActive ? "DRAFT" : "DRAFT",
      openedAt: null,
      closedAt: null,
    },
  });

  await addEvent(resolution.assemblyId, isActive ? "Résolution réactivée" : "Résolution désactivée", resolution.title, "RESOLUTION_TOGGLE");
  revalidateResolutions();
}

async function deleteResolution(formData: FormData) {
  "use server";

  const resolutionId = String(formData.get("resolutionId") || "");
  if (!resolutionId) return;

  const resolution = await prisma.resolution.findUnique({
    where: { id: resolutionId },
    include: { votes: true },
  });

  if (!resolution) return;

  if (resolution.votes.length > 0) {
    await prisma.resolution.update({
      where: { id: resolutionId },
      data: { isActive: false, status: "DRAFT", openedAt: null, closedAt: null },
    });
    await addEvent(resolution.assemblyId, "Résolution désactivée", `${resolution.title} contient déjà des votes et n’a pas été supprimée.`, "RESOLUTION_TOGGLE");
  } else {
    await prisma.resolution.delete({ where: { id: resolutionId } });
    await addEvent(resolution.assemblyId, "Résolution supprimée", resolution.title, "RESOLUTION_DELETED");
  }

  revalidateResolutions();
}

async function duplicateResolution(formData: FormData) {
  "use server";

  const resolutionId = String(formData.get("resolutionId") || "");
  if (!resolutionId) return;

  const source = await prisma.resolution.findUnique({
    where: { id: resolutionId },
    include: { choices: { orderBy: { order: "asc" } } },
  });

  if (!source) return;

  const lastResolution = await prisma.resolution.findFirst({
    where: { assemblyId: source.assemblyId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  await prisma.resolution.create({
    data: {
      assemblyId: source.assemblyId,
      title: `${source.title} (copie)`,
      description: source.description,
      order: (lastResolution?.order || 0) + 1,
      isActive: true,
      choices: {
        create: source.choices.map((choice: any) => ({ label: choice.label, order: choice.order })),
      },
    },
  });

  await addEvent(source.assemblyId, "Résolution dupliquée", source.title, "RESOLUTION_DUPLICATED");
  revalidateResolutions();
}

async function moveResolution(formData: FormData) {
  "use server";

  const resolutionId = String(formData.get("resolutionId") || "");
  const direction = String(formData.get("direction") || "");
  if (!resolutionId || !["up", "down"].includes(direction)) return;

  const current = await prisma.resolution.findUnique({ where: { id: resolutionId } });
  if (!current) return;

  const target = await prisma.resolution.findFirst({
    where: {
      assemblyId: current.assemblyId,
      order: direction === "up" ? { lt: current.order } : { gt: current.order },
    },
    orderBy: { order: direction === "up" ? "desc" : "asc" },
  });

  if (!target) return;

  await prisma.$transaction([
    prisma.resolution.update({ where: { id: current.id }, data: { order: target.order } }),
    prisma.resolution.update({ where: { id: target.id }, data: { order: current.order } }),
  ]);

  revalidateResolutions();
}

async function addChoice(formData: FormData) {
  "use server";

  const resolutionId = String(formData.get("resolutionId") || "");
  const label = String(formData.get("label") || "").trim();
  if (!resolutionId || !label) return;

  const resolution = await prisma.resolution.findUnique({
    where: { id: resolutionId },
    include: { votes: true, choices: true },
  });

  if (!resolution || resolution.votes.length > 0) return;

  await prisma.voteChoice.create({
    data: {
      resolutionId,
      label,
      order: resolution.choices.length + 1,
    },
  });

  revalidateResolutions();
}

async function updateChoice(formData: FormData) {
  "use server";

  const choiceId = String(formData.get("choiceId") || "");
  const label = String(formData.get("label") || "").trim();
  const order = Number(formData.get("order") || 0);
  if (!choiceId || !label) return;

  const choice = await prisma.voteChoice.findUnique({
    where: { id: choiceId },
    include: { votes: true },
  });

  if (!choice || choice.votes.length > 0) return;

  await prisma.voteChoice.update({
    where: { id: choiceId },
    data: {
      label,
      order: Number.isFinite(order) && order > 0 ? order : undefined,
    },
  });

  revalidateResolutions();
}

async function deleteChoice(formData: FormData) {
  "use server";

  const choiceId = String(formData.get("choiceId") || "");
  if (!choiceId) return;

  const choice = await prisma.voteChoice.findUnique({
    where: { id: choiceId },
    include: { votes: true, resolution: { include: { choices: true } } },
  });

  if (!choice || choice.votes.length > 0 || choice.resolution.choices.length <= 2) return;

  await prisma.voteChoice.delete({ where: { id: choiceId } });
  revalidateResolutions();
}

function statusBadge(resolution: any) {
  if (!resolution.isActive) return "bg-slate-100 text-slate-500 ring-slate-200";
  if (resolution.status === "OPEN") return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  if (resolution.status === "CLOSED") return "bg-slate-950 text-white ring-slate-950";
  return "bg-amber-50 text-amber-700 ring-amber-100";
}

function statusText(resolution: any) {
  if (!resolution.isActive) return "Désactivée";
  if (resolution.status === "OPEN") return "Vote ouvert";
  if (resolution.status === "CLOSED") return "Vote clôturé";
  return "Active · en attente";
}

export default async function AdminResolutionsPage() {
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

  const activeCount = assembly.resolutions.filter((resolution: any) => resolution.isActive).length;
  const lockedCount = assembly.resolutions.filter((resolution: any) => resolution.votes.length > 0).length;

  return (
    <main className="min-h-screen bg-[#f7f4ef] px-5 py-6 text-slate-950 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-2xl shadow-slate-950/20 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <Link href="/admin" className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white/75 transition hover:bg-white/15 hover:text-white">
                ← Retour au centre de pilotage
              </Link>
              <p className="mt-6 text-sm uppercase tracking-[0.35em] text-amber-200/80">{assembly.organization.name}</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">Éditeur de résolutions</h1>
              <p className="mt-4 max-w-3xl text-white/65">Ajoute, modifie, désactive ou réordonne les résolutions sans toucher au code.</p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
                <p className="text-3xl font-semibold">{assembly.resolutions.length}</p>
                <p className="mt-1 text-xs text-white/60">total</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
                <p className="text-3xl font-semibold">{activeCount}</p>
                <p className="mt-1 text-xs text-white/60">actives</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
                <p className="text-3xl font-semibold">{lockedCount}</p>
                <p className="mt-1 text-xs text-white/60">verrouillées</p>
              </div>
            </div>
          </div>
        </header>

        <section className="mt-6 rounded-[2rem] border border-blue-200 bg-blue-50 p-5 shadow-sm shadow-blue-900/5">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-700">Sécurité V1.0</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-blue-950">Si une résolution contient déjà des votes, ses choix sont verrouillés.</h2>
          <p className="mt-2 text-sm text-blue-900/70">Tu peux toujours la désactiver ou la dupliquer pour préparer une nouvelle version propre.</p>
        </section>

        <section className="mt-6 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-700">Nouvelle résolution</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Créer une question de vote</h2>
            </div>
            <p className="text-sm text-slate-500">Un choix par ligne · minimum 2 choix</p>
          </div>

          <form action={createResolution} className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
            <input type="hidden" name="assemblyId" value={assembly.id} />
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              Titre
              <input name="title" required placeholder="Ex : Élection du/de la secrétaire" className="rounded-2xl border border-slate-200 bg-[#fbfaf7] px-4 py-3 outline-none transition focus:border-slate-950" />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              Choix de vote
              <textarea name="choices" required defaultValue={"Pour\nContre\nAbstention"} rows={4} className="rounded-2xl border border-slate-200 bg-[#fbfaf7] px-4 py-3 outline-none transition focus:border-slate-950" />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-slate-700 lg:col-span-2">
              Description
              <textarea name="description" rows={3} placeholder="Texte affiché aux propriétaires pendant le vote" className="rounded-2xl border border-slate-200 bg-[#fbfaf7] px-4 py-3 outline-none transition focus:border-slate-950" />
            </label>
            <div className="lg:col-span-2">
              <button className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">+ Ajouter la résolution</button>
            </div>
          </form>
        </section>

        <div className="mt-6 grid gap-5">
          {assembly.resolutions.map((resolution: any) => {
            const hasVotes = resolution.votes.length > 0;
            return (
              <article key={resolution.id} className={`rounded-[2rem] border p-6 shadow-sm shadow-slate-900/5 ${resolution.isActive ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50 opacity-80"}`}>
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-950 text-sm font-semibold text-white">{resolution.order}</span>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusBadge(resolution)}`}>{statusText(resolution)}</span>
                      {hasVotes ? <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-100">{resolution.votes.length} vote(s) · choix verrouillés</span> : null}
                    </div>
                    <h2 className="mt-3 text-2xl font-semibold tracking-tight">{resolution.title}</h2>
                    {resolution.description ? <p className="mt-2 max-w-4xl text-sm text-slate-500">{resolution.description}</p> : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <form action={moveResolution}>
                      <input type="hidden" name="resolutionId" value={resolution.id} />
                      <input type="hidden" name="direction" value="up" />
                      <button className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200">↑</button>
                    </form>
                    <form action={moveResolution}>
                      <input type="hidden" name="resolutionId" value={resolution.id} />
                      <input type="hidden" name="direction" value="down" />
                      <button className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200">↓</button>
                    </form>
                    <form action={duplicateResolution}>
                      <input type="hidden" name="resolutionId" value={resolution.id} />
                      <button className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50">Dupliquer</button>
                    </form>
                    <form action={toggleResolution}>
                      <input type="hidden" name="resolutionId" value={resolution.id} />
                      <input type="hidden" name="isActive" value={String(!resolution.isActive)} />
                      <ConfirmSubmitButton message={`${resolution.isActive ? "Désactiver" : "Réactiver"} cette résolution ?`} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${resolution.isActive ? "bg-amber-50 text-amber-700 ring-1 ring-amber-100 hover:bg-amber-100" : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 hover:bg-emerald-100"}`}>
                        {resolution.isActive ? "Désactiver" : "Réactiver"}
                      </ConfirmSubmitButton>
                    </form>
                    <form action={deleteResolution}>
                      <input type="hidden" name="resolutionId" value={resolution.id} />
                      <ConfirmSubmitButton message={hasVotes ? "Cette résolution contient des votes. Elle sera désactivée au lieu d'être supprimée. Continuer ?" : "Supprimer définitivement cette résolution ?"} className="rounded-full bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-100 transition hover:bg-red-100">
                        Supprimer
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                </div>

                <form action={updateResolution} className="mt-6 grid gap-4 lg:grid-cols-[120px_1fr]">
                  <input type="hidden" name="resolutionId" value={resolution.id} />
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Ordre
                    <input name="order" type="number" min="1" defaultValue={resolution.order} className="rounded-2xl border border-slate-200 bg-[#fbfaf7] px-4 py-3 outline-none transition focus:border-slate-950" />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Titre
                    <input name="title" required defaultValue={resolution.title} className="rounded-2xl border border-slate-200 bg-[#fbfaf7] px-4 py-3 outline-none transition focus:border-slate-950" />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-700 lg:col-span-2">
                    Description
                    <textarea name="description" rows={3} defaultValue={resolution.description || ""} className="rounded-2xl border border-slate-200 bg-[#fbfaf7] px-4 py-3 outline-none transition focus:border-slate-950" />
                  </label>
                  <div className="lg:col-span-2">
                    <button className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">Enregistrer les modifications</button>
                  </div>
                </form>

                <section className="mt-6 rounded-3xl border border-slate-200 bg-[#fbfaf7] p-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">Choix proposés</p>
                      <p className="mt-1 text-sm text-slate-500">{hasVotes ? "Les choix sont verrouillés car des votes existent." : "Tu peux modifier les intitulés ou ajouter un choix."}</p>
                    </div>
                    {!hasVotes ? (
                      <form action={addChoice} className="flex gap-2">
                        <input type="hidden" name="resolutionId" value={resolution.id} />
                        <input name="label" placeholder="Nouveau choix" className="min-w-0 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-slate-950" />
                        <button className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Ajouter</button>
                      </form>
                    ) : null}
                  </div>

                  <div className="mt-4 grid gap-3">
                    {resolution.choices.map((choice: any) => {
                      const choiceHasVotes = choice.votes.length > 0;
                      return (
                        <form key={choice.id} action={updateChoice} className="grid gap-2 rounded-2xl bg-white p-3 ring-1 ring-slate-200 sm:grid-cols-[80px_1fr_auto] sm:items-center">
                          <input type="hidden" name="choiceId" value={choice.id} />
                          <input name="order" type="number" min="1" defaultValue={choice.order} disabled={hasVotes || choiceHasVotes} className="rounded-xl border border-slate-200 bg-[#fbfaf7] px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-400" />
                          <input name="label" defaultValue={choice.label} disabled={hasVotes || choiceHasVotes} className="rounded-xl border border-slate-200 bg-[#fbfaf7] px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-400" />
                          <div className="flex gap-2">
                            {!hasVotes && !choiceHasVotes ? <button className="rounded-full bg-slate-950 px-3 py-2 text-xs font-semibold text-white">OK</button> : null}
                            {!hasVotes && !choiceHasVotes && resolution.choices.length > 2 ? (
                              <button formAction={deleteChoice} className="rounded-full bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 ring-1 ring-red-100">Supprimer</button>
                            ) : null}
                          </div>
                        </form>
                      );
                    })}
                  </div>
                </section>
              </article>
            );
          })}
        </div>
      </div>
    </main>
  );
}
