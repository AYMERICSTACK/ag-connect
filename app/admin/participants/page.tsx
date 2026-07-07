import Link from "next/link";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function makeAccessCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

async function getCurrentAssembly() {
  return prisma.assembly.findFirst({
    orderBy: { date: "desc" },
    include: {
      organization: true,
      attendances: { include: { member: true } },
      proxies: {
        include: {
          giver: true,
          holder: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

function memberLabel(member: any) {
  return `${member.firstName || ""} ${member.lastName || ""}`.replace(/\s+/g, " ").trim();
}

async function createMember(formData: FormData) {
  "use server";

  const assembly = await getCurrentAssembly();
  if (!assembly) return;

  const firstName = String(formData.get("firstName") || "").trim();
  const lastName = String(formData.get("lastName") || "").trim();
  const lotNumber = String(formData.get("lotNumber") || "").trim();
  const address = String(formData.get("address") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const voteWeightValue = Number(formData.get("voteWeight") || 1);
  const checkedIn = formData.get("checkedIn") === "on";

  if (!lastName || !lotNumber) return;

  let accessCode = makeAccessCode();
  let existing = await prisma.member.findUnique({ where: { accessCode } });

  while (existing) {
    accessCode = makeAccessCode();
    existing = await prisma.member.findUnique({ where: { accessCode } });
  }

  const member = await prisma.member.create({
    data: {
      organizationId: assembly.organizationId,
      firstName,
      lastName,
      lotNumber,
      address,
      phone,
      email,
      accessCode,
      voteWeight: Number.isFinite(voteWeightValue) && voteWeightValue > 0 ? voteWeightValue : 1,
    },
  });

  await prisma.attendance.create({
    data: {
      assemblyId: assembly.id,
      memberId: member.id,
      checkedIn,
      checkedAt: checkedIn ? new Date() : null,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/participants");
}

async function updateMember(formData: FormData) {
  "use server";

  const memberId = String(formData.get("memberId") || "");
  const firstName = String(formData.get("firstName") || "").trim();
  const lastName = String(formData.get("lastName") || "").trim();
  const lotNumber = String(formData.get("lotNumber") || "").trim();
  const address = String(formData.get("address") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const voteWeightValue = Number(formData.get("voteWeight") || 1);

  if (!memberId || !lastName || !lotNumber) return;

  await prisma.member.update({
    where: { id: memberId },
    data: {
      firstName,
      lastName,
      lotNumber,
      address,
      phone,
      email,
      voteWeight: Number.isFinite(voteWeightValue) && voteWeightValue > 0 ? voteWeightValue : 1,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/participants");
}

async function toggleAttendance(formData: FormData) {
  "use server";

  const attendanceId = String(formData.get("attendanceId") || "");
  const checkedIn = String(formData.get("checkedIn") || "false") === "true";

  if (!attendanceId) return;

  await prisma.attendance.update({
    where: { id: attendanceId },
    data: {
      checkedIn,
      checkedAt: checkedIn ? new Date() : null,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/participants");
  revalidatePath("/admin/votes");
}

async function deleteMember(formData: FormData) {
  "use server";

  const memberId = String(formData.get("memberId") || "");
  if (!memberId) return;

  await prisma.member.delete({ where: { id: memberId } });

  revalidatePath("/admin");
  revalidatePath("/admin/participants");
}

async function createProxy(formData: FormData) {
  "use server";

  const assembly = await getCurrentAssembly();
  if (!assembly) return;

  const giverMemberId = String(formData.get("giverMemberId") || "");
  const holderMemberId = String(formData.get("holderMemberId") || "");

  if (!giverMemberId || !holderMemberId || giverMemberId === holderMemberId) return;

  await prisma.proxy.upsert({
    where: {
      assemblyId_giverMemberId: {
        assemblyId: assembly.id,
        giverMemberId,
      },
    },
    update: { holderMemberId },
    create: {
      assemblyId: assembly.id,
      giverMemberId,
      holderMemberId,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/participants");
  revalidatePath("/admin/votes");
}

async function deleteProxy(formData: FormData) {
  "use server";

  const proxyId = String(formData.get("proxyId") || "");
  if (!proxyId) return;

  await prisma.proxy.delete({ where: { id: proxyId } });

  revalidatePath("/admin");
  revalidatePath("/admin/participants");
  revalidatePath("/admin/votes");
}

function buildJoinUrl(accessCode: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${baseUrl}/join/${accessCode}`;
}

function qrSvgDataUrl(value: string) {
  const encoded = encodeURIComponent(value);
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encoded}`;
}

export default async function AdminParticipantsPage() {
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

  const members = await prisma.member.findMany({
    where: { organizationId: assembly.organizationId },
    orderBy: [{ lotNumber: "asc" }, { lastName: "asc" }],
    include: {
      attendances: { where: { assemblyId: assembly.id } },
      proxiesReceived: {
        where: { assemblyId: assembly.id },
        include: { giver: true },
      },
      proxiesGiven: {
        where: { assemblyId: assembly.id },
        include: { holder: true },
      },
    },
  });

  const checkedInCount = members.filter((member: any) => member.attendances[0]?.checkedIn).length;
  const representedLots = checkedInCount + assembly.proxies.length;
  const attendanceMap = new Map(assembly.attendances.map((attendance: any) => [attendance.memberId, attendance]));

  return (
    <main className="min-h-screen bg-[#f7f4ef] px-5 py-6 text-slate-950 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-2xl shadow-slate-950/20 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex flex-wrap gap-2">
                <Link href="/admin" className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white/75 transition hover:bg-white/15 hover:text-white">← Centre de pilotage</Link>
                <Link href="/admin/votes" className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white/75 transition hover:bg-white/15 hover:text-white">🗳️ Votes</Link>
              </div>
              <p className="mt-6 text-sm uppercase tracking-[0.35em] text-amber-200/80">{assembly.organization.name}</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">Propriétaires, présences & procurations</h1>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-3xl border border-white/10 bg-white/10 p-4"><p className="text-3xl font-semibold">{members.length}</p><p className="mt-1 text-xs text-white/60">propriétaires</p></div>
              <div className="rounded-3xl border border-white/10 bg-white/10 p-4"><p className="text-3xl font-semibold">{checkedInCount}</p><p className="mt-1 text-xs text-white/60">présents</p></div>
              <div className="rounded-3xl border border-white/10 bg-white/10 p-4"><p className="text-3xl font-semibold">{representedLots}</p><p className="mt-1 text-xs text-white/60">représentés</p></div>
            </div>
          </div>
        </header>

        <div className="mt-6 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/5">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-700">Ajout rapide</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Enregistrer un propriétaire</h2>
            <form action={createMember} className="mt-6 grid gap-4">
              <div className="grid gap-4 xl:grid-cols-[0.55fr_1fr]">
                <label className="grid gap-2 text-sm font-medium text-slate-700">
                  Lot
                  <input
                    name="lotNumber"
                    required
                    placeholder="Ex : 12"
                    className="w-full rounded-2xl border border-slate-200 bg-[#fbfaf7] px-4 py-3 outline-none transition focus:border-amber-500"
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium text-slate-700">
                  Nom / foyer
                  <input
                    name="lastName"
                    required
                    placeholder="Ex : Famille Martin"
                    className="w-full rounded-2xl border border-slate-200 bg-[#fbfaf7] px-4 py-3 outline-none transition focus:border-amber-500"
                  />
                </label>
              </div>

              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Prénom
                <input
                  name="firstName"
                  placeholder="Optionnel"
                  className="w-full rounded-2xl border border-slate-200 bg-[#fbfaf7] px-4 py-3 outline-none transition focus:border-amber-500"
                />
              </label>

              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Adresse
                <input
                  name="address"
                  className="w-full rounded-2xl border border-slate-200 bg-[#fbfaf7] px-4 py-3 outline-none transition focus:border-amber-500"
                />
              </label>

              <div className="grid gap-4 xl:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium text-slate-700">
                  Téléphone
                  <input
                    name="phone"
                    className="w-full rounded-2xl border border-slate-200 bg-[#fbfaf7] px-4 py-3 outline-none transition focus:border-amber-500"
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium text-slate-700">
                  Email
                  <input
                    name="email"
                    type="email"
                    className="w-full rounded-2xl border border-slate-200 bg-[#fbfaf7] px-4 py-3 outline-none transition focus:border-amber-500"
                  />
                </label>
              </div>

              <label className="grid max-w-40 gap-2 text-sm font-medium text-slate-700">
                Poids du vote
                <input
                  name="voteWeight"
                  type="number"
                  min="1"
                  defaultValue="1"
                  className="w-full rounded-2xl border border-slate-200 bg-[#fbfaf7] px-4 py-3 outline-none transition focus:border-amber-500"
                />
              </label>

              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-[#fbfaf7] px-4 py-3 text-sm font-medium text-slate-700">
                <input name="checkedIn" type="checkbox" className="h-4 w-4 accent-slate-950" />
                <span>Marquer comme présent dès maintenant</span>
              </label>
              <button className="rounded-2xl bg-slate-950 px-5 py-3 font-semibold text-white transition hover:bg-slate-800">Ajouter le propriétaire</button>
            </form>
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/5">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-700">Procurations</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Déclarer un mandat</h2>
            <form action={createProxy} className="mt-6 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <label className="grid gap-2 text-sm font-medium text-slate-700">Propriétaire absent<select name="giverMemberId" required className="rounded-2xl border border-slate-200 bg-[#fbfaf7] px-4 py-3 outline-none transition focus:border-amber-500"><option value="">Sélectionner</option>{members.map((member: any) => (<option key={member.id} value={member.id}>Lot {member.lotNumber} · {memberLabel(member)}</option>))}</select></label>
              <label className="grid gap-2 text-sm font-medium text-slate-700">Représenté par<select name="holderMemberId" required className="rounded-2xl border border-slate-200 bg-[#fbfaf7] px-4 py-3 outline-none transition focus:border-amber-500"><option value="">Sélectionner</option>{members.map((member: any) => (<option key={member.id} value={member.id}>Lot {member.lotNumber} · {memberLabel(member)}</option>))}</select></label>
              <button className="rounded-2xl bg-amber-500 px-5 py-3 font-semibold text-slate-950 transition hover:bg-amber-400">Ajouter</button>
            </form>

            <div className="mt-6 space-y-3">
              {assembly.proxies.length === 0 ? <p className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-500">Aucune procuration enregistrée pour l’instant.</p> : assembly.proxies.map((proxy: any) => (
                <div key={proxy.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-[#fbfaf7] p-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-slate-600"><span className="font-semibold text-slate-950">Lot {proxy.giver.lotNumber} · {memberLabel(proxy.giver)}</span> est représenté par <span className="font-semibold text-slate-950">Lot {proxy.holder.lotNumber} · {memberLabel(proxy.holder)}</span></p>
                  <form action={deleteProxy}><input type="hidden" name="proxyId" value={proxy.id} /><button className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-red-600 ring-1 ring-red-100 transition hover:bg-red-50">Supprimer</button></form>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="mt-6 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-700">Liste officielle</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Lots enregistrés</h2></div><p className="text-sm text-slate-500">Les données importées depuis Excel restent modifiables manuellement.</p></div>

          <div className="mt-6 space-y-4">
            {members.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">Aucun propriétaire enregistré.</p> : members.map((member: any) => {
              const attendance = attendanceMap.get(member.id) || member.attendances[0];
              const isPresent = Boolean(attendance?.checkedIn);
              const joinUrl = buildJoinUrl(member.accessCode);

              return (
                <article key={member.id} className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/5">
                  <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-start">
                    <div>
                      <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">Lot {member.lotNumber}</span><span className={`rounded-full px-3 py-1 text-xs font-semibold ${isPresent ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" : "bg-slate-100 text-slate-500"}`}>{isPresent ? "Présent" : "Non pointé"}</span>{member.proxiesReceived.length > 0 ? <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-100">{member.proxiesReceived.length} procuration(s)</span> : null}</div>
                      <h3 className="mt-3 text-xl font-semibold tracking-tight">{memberLabel(member)}</h3>
                      <p className="mt-1 text-sm text-slate-500">{member.address || "Adresse non renseignée"} · {member.phone || "Téléphone non renseigné"} · {member.email || "Email non renseigné"}</p>
                      <p className="mt-1 text-xs text-slate-400">Code : {member.accessCode} · poids {member.voteWeight}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                      <a href={joinUrl} target="_blank" className="inline-flex items-center gap-3 rounded-2xl bg-[#fbfaf7] p-2 ring-1 ring-slate-200 transition hover:bg-amber-50" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={qrSvgDataUrl(joinUrl)} alt={`QR Code lot ${member.lotNumber}`} className="h-14 w-14 rounded-xl" /><span className="hidden text-xs font-medium text-slate-500 sm:inline">QR</span>
                      </a>
                      {attendance ? <form action={toggleAttendance}><input type="hidden" name="attendanceId" value={attendance.id} /><input type="hidden" name="checkedIn" value={isPresent ? "false" : "true"} /><button className="rounded-full bg-slate-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800">{isPresent ? "Retirer" : "Présent"}</button></form> : null}
                      <form action={deleteMember}><input type="hidden" name="memberId" value={member.id} /><button className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-red-600 ring-1 ring-red-100 transition hover:bg-red-50">Suppr.</button></form>
                    </div>
                  </div>

                  <details className="mt-4 rounded-2xl bg-[#fbfaf7] p-4 ring-1 ring-slate-200">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-700">Modifier les informations</summary>
                    <form action={updateMember} className="mt-4 grid gap-3">
                      <input type="hidden" name="memberId" value={member.id} />
                      <div className="grid gap-3 sm:grid-cols-4"><label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Lot<input name="lotNumber" defaultValue={member.lotNumber} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium normal-case tracking-normal text-slate-950 outline-none focus:border-amber-500" /></label><label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Prénom<input name="firstName" defaultValue={member.firstName || ""} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium normal-case tracking-normal text-slate-950 outline-none focus:border-amber-500" /></label><label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 sm:col-span-2">Nom / foyer<input name="lastName" defaultValue={member.lastName || ""} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium normal-case tracking-normal text-slate-950 outline-none focus:border-amber-500" /></label></div>
                      <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Adresse<input name="address" defaultValue={member.address || ""} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium normal-case tracking-normal text-slate-950 outline-none focus:border-amber-500" /></label>
                      <div className="grid gap-3 sm:grid-cols-3"><label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Téléphone<input name="phone" defaultValue={member.phone || ""} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium normal-case tracking-normal text-slate-950 outline-none focus:border-amber-500" /></label><label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Email<input name="email" defaultValue={member.email || ""} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium normal-case tracking-normal text-slate-950 outline-none focus:border-amber-500" /></label><label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Poids<input name="voteWeight" type="number" min="1" defaultValue={member.voteWeight} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium normal-case tracking-normal text-slate-950 outline-none focus:border-amber-500" /></label></div>
                      <button className="justify-self-start rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400">Enregistrer les modifications</button>
                    </form>
                  </details>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
