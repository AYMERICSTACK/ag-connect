import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { formatMemberDisplay } from "@/lib/member-display";
import { extractEmails, formatDate, formatShortDate, formatTime, getEligibleMembers, getResolutionStats, sortByLot } from "@/lib/report-utils";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ sent?: string; failed?: string; error?: string }>;

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

function getRecipients(members: any[]) {
  return members.flatMap((member) =>
    extractEmails(member.email).map((email) => ({
      email,
      member,
      label: `Lot ${member.lotNumber} — ${formatMemberDisplay(member)}`,
    })),
  );
}

function buildReportHtml({ assembly, comments, decisions }: { assembly: any; comments: string; decisions: string }) {
  const members = [...assembly.organization.members].sort(sortByLot);
  const eligibleMembers = getEligibleMembers(assembly);
  const presentAttendances = assembly.attendances.filter((attendance: any) => attendance.checkedIn);
  const representedPercent = members.length > 0 ? Math.round((eligibleMembers.length / members.length) * 100) : 0;

  const resolutionsHtml = assembly.resolutions
    .map((resolution: any) => {
      const stats = getResolutionStats(resolution, eligibleMembers);
      const rows = stats.choiceTotals
        .map((choice: any) => `<tr><td>${choice.label}</td><td>${choice.weight}</td><td>${choice.percent}%</td></tr>`)
        .join("");

      return `
        <section style="margin-top:24px;padding:20px;border:1px solid #e2e8f0;border-radius:18px;background:#fbfaf7;">
          <p style="margin:0 0 6px;color:#b45309;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Résolution n°${resolution.order}</p>
          <h3 style="margin:0 0 8px;font-size:20px;color:#0f172a;">${resolution.title}</h3>
          ${resolution.description ? `<p style="margin:0 0 12px;color:#475569;line-height:1.6;">${resolution.description}</p>` : ""}
          <p style="margin:0 0 12px;color:#0f172a;"><strong>Décision :</strong> ${stats.decision}</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <thead><tr style="background:#0f172a;color:white;"><th align="left" style="padding:10px;">Choix</th><th align="left" style="padding:10px;">Voix</th><th align="left" style="padding:10px;">%</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </section>
      `;
    })
    .join("");

  return `
    <main style="font-family:Arial,sans-serif;color:#0f172a;background:#f7f4ef;padding:28px;">
      <section style="max-width:860px;margin:0 auto;background:white;border-radius:24px;padding:32px;border:1px solid #e2e8f0;">
        <p style="margin:0;color:#b45309;font-size:12px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;">${assembly.organization.name}</p>
        <h1 style="margin:12px 0 6px;font-size:30px;">Procès-verbal d’Assemblée Générale Extraordinaire</h1>
        <p style="margin:0;color:#64748b;">${assembly.title}</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
        <p><strong>Date :</strong> ${formatDate(assembly.date)} à ${formatTime(assembly.date)}</p>
        <p><strong>Lieu :</strong> ${assembly.location}</p>
        <p><strong>Lots enregistrés :</strong> ${members.length}</p>
        <p><strong>Lots présents ou représentés :</strong> ${eligibleMembers.length} (${representedPercent}%)</p>
        <p><strong>Présents :</strong> ${presentAttendances.length}</p>
        <p><strong>Procurations :</strong> ${assembly.proxies.length}</p>
        ${resolutionsHtml}
        <section style="margin-top:24px;padding:20px;border:1px solid #e2e8f0;border-radius:18px;">
          <h2 style="margin-top:0;">Commentaires et observations</h2>
          <p style="white-space:pre-wrap;line-height:1.7;color:#334155;">${comments || "Aucun commentaire complémentaire."}</p>
        </section>
        <section style="margin-top:24px;padding:20px;border:1px solid #e2e8f0;border-radius:18px;">
          <h2 style="margin-top:0;">Décisions complémentaires</h2>
          <p style="white-space:pre-wrap;line-height:1.7;color:#334155;">${decisions || "Aucune décision complémentaire."}</p>
        </section>
        <p style="margin-top:28px;color:#64748b;font-size:13px;">Document généré automatiquement par AG Connect le ${formatShortDate(new Date())} à ${formatTime(new Date())}.</p>
      </section>
    </main>
  `;
}

async function sendReport(formData: FormData) {
  "use server";

  const assemblyId = String(formData.get("assemblyId") || "");
  const comments = String(formData.get("comments") || "").trim();
  const decisions = String(formData.get("decisions") || "").trim();

  const resendApiKey = process.env.RESEND_API_KEY;
  const resendFrom = process.env.RESEND_FROM;

  if (!resendApiKey || !resendFrom) {
    redirect("/admin/finalize?error=missing-resend");
  }

  const assembly = await prisma.assembly.findUnique({
    where: { id: assemblyId },
    include: {
      organization: { include: { members: true } },
      attendances: { include: { member: true } },
      proxies: { include: { giver: true, holder: true } },
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

  if (!assembly) redirect("/admin/finalize?error=no-assembly");

  const recipients = getRecipients(assembly.organization.members);
  if (recipients.length === 0) redirect("/admin/finalize?error=no-recipient");

  const html = buildReportHtml({ assembly, comments, decisions });
  const subject = `Procès-verbal - ${assembly.title}`;

  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: resendFrom,
        to: recipient.email,
        subject,
        html,
      }),
    });

    if (response.ok) sent += 1;
    else failed += 1;
  }

  await prisma.assemblyEvent.create({
    data: {
      assemblyId: assembly.id,
      label: "Procès-verbal envoyé",
      detail: `${sent} email(s) envoyé(s), ${failed} échec(s).`,
      type: "REPORT_SENT",
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/report");
  revalidatePath("/admin/finalize");
  redirect(`/admin/finalize?sent=${sent}&failed=${failed}`);
}

export default async function FinalizePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const assembly = await getCurrentAssembly();

  if (!assembly) {
    return (
      <main className="min-h-screen bg-[#f7f4ef] px-6 py-10 text-slate-950">
        <div className="mx-auto max-w-4xl rounded-[2rem] border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-700">AG Connect</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">Aucune assemblée trouvée</h1>
          <Link href="/admin" className="mt-6 inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white">Retour admin</Link>
        </div>
      </main>
    );
  }

  const members = [...assembly.organization.members].sort(sortByLot);
  const recipients = getRecipients(members);
  const membersWithoutEmail = members.filter((member: any) => extractEmails(member.email).length === 0);
  const eligibleMembers = getEligibleMembers(assembly);
  const representedPercent = members.length > 0 ? Math.round((eligibleMembers.length / members.length) * 100) : 0;

  return (
    <main className="min-h-screen bg-[#f7f4ef] px-5 py-8 text-slate-950">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-2xl shadow-slate-950/20 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <Link href="/admin" className="inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white/75 transition hover:bg-white/15 hover:text-white">
                ← Retour au centre de pilotage
              </Link>
              <p className="mt-6 text-sm uppercase tracking-[0.35em] text-amber-200/80">Finalisation V1.1</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">Finaliser et envoyer le PV</h1>
              <p className="mt-4 max-w-3xl text-white/65">Ajoute les observations de séance, vérifie les destinataires, puis envoie le procès-verbal à tous les propriétaires disposant d’une adresse email.</p>
            </div>
            <Link href="/admin/report" className="rounded-full bg-white px-5 py-3 text-center text-sm font-semibold text-slate-950 transition hover:bg-amber-100">
              Prévisualiser le PV
            </Link>
          </div>
        </header>

        {params.sent ? (
          <div className="mt-6 rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
            <p className="font-semibold">✅ Procès-verbal envoyé</p>
            <p className="mt-1 text-sm">{params.sent} email(s) envoyé(s){params.failed ? `, ${params.failed} échec(s)` : ""}. Le journal de séance a été mis à jour.</p>
          </div>
        ) : null}

        {params.error ? (
          <div className="mt-6 rounded-[1.5rem] border border-amber-200 bg-amber-50 p-5 text-amber-900">
            <p className="font-semibold">⚠️ Envoi impossible</p>
            <p className="mt-1 text-sm">
              {params.error === "missing-resend"
                ? "Ajoute RESEND_API_KEY et RESEND_FROM dans les variables d’environnement Vercel avant d’envoyer."
                : params.error === "no-recipient"
                  ? "Aucune adresse email valide n’a été trouvée dans les fiches propriétaires."
                  : "Une erreur est survenue pendant la préparation de l’envoi."}
            </p>
          </div>
        ) : null}

        <section className="mt-8 grid gap-5 lg:grid-cols-4">
          <div className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200/80">
            <p className="text-sm text-slate-500">Lots</p>
            <p className="mt-2 text-4xl font-semibold">{members.length}</p>
          </div>
          <div className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200/80">
            <p className="text-sm text-slate-500">Emails détectés</p>
            <p className="mt-2 text-4xl font-semibold">{recipients.length}</p>
          </div>
          <div className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200/80">
            <p className="text-sm text-slate-500">Lots sans email</p>
            <p className="mt-2 text-4xl font-semibold">{membersWithoutEmail.length}</p>
          </div>
          <div className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200/80">
            <p className="text-sm text-slate-500">Représentation</p>
            <p className="mt-2 text-4xl font-semibold">{representedPercent}%</p>
          </div>
        </section>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <form action={sendReport} className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200/80 sm:p-8">
            <input type="hidden" name="assemblyId" value={assembly.id} />
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-700">Commentaires</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Observations à intégrer au procès-verbal</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">Ces textes seront inclus dans le mail envoyé aux propriétaires. Tu pourras compléter calmement avant l’envoi final.</p>
            </div>

            <label className="mt-6 block">
              <span className="text-sm font-semibold text-slate-700">Commentaires du bureau</span>
              <textarea name="comments" rows={8} className="mt-2 w-full rounded-3xl border border-slate-200 bg-[#fbfaf7] p-4 text-sm outline-none transition focus:border-slate-400 focus:bg-white" placeholder="Ex : Les échanges se sont déroulés dans un climat serein. Plusieurs propriétaires ont demandé un suivi des travaux..." />
            </label>

            <label className="mt-5 block">
              <span className="text-sm font-semibold text-slate-700">Décisions complémentaires / points de vigilance</span>
              <textarea name="decisions" rows={6} className="mt-2 w-full rounded-3xl border border-slate-200 bg-[#fbfaf7] p-4 text-sm outline-none transition focus:border-slate-400 focus:bg-white" placeholder="Ex : Le bureau reviendra vers les propriétaires après réception de la date d’intervention..." />
            </label>

            <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
              <p className="font-semibold">Avant l’envoi</p>
              <p className="mt-1">Vérifie la prévisualisation du PV et les emails ci-contre. L’envoi partira à toutes les adresses détectées dans les fiches propriétaires.</p>
            </div>

            <button type="submit" className="mt-6 w-full rounded-full bg-slate-950 px-6 py-4 text-sm font-semibold text-white shadow-lg shadow-slate-950/15 transition hover:bg-slate-800">
              Envoyer le procès-verbal à tous les propriétaires
            </button>
          </form>

          <aside className="grid gap-5">
            <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200/80">
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-700">Destinataires</p>
              <h2 className="mt-2 text-xl font-semibold">Emails prêts à l’envoi</h2>
              <div className="mt-5 max-h-[420px] overflow-auto rounded-3xl border border-slate-200">
                {recipients.length === 0 ? (
                  <p className="p-4 text-sm text-slate-500">Aucun email détecté.</p>
                ) : (
                  recipients.map((recipient) => (
                    <div key={`${recipient.member.id}-${recipient.email}`} className="border-b border-slate-100 p-4 last:border-b-0">
                      <p className="text-sm font-semibold text-slate-950">{recipient.label}</p>
                      <p className="mt-1 text-sm text-slate-500">{recipient.email}</p>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200/80">
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-700">À compléter</p>
              <h2 className="mt-2 text-xl font-semibold">Lots sans email</h2>
              <div className="mt-5 grid gap-2 text-sm text-slate-600">
                {membersWithoutEmail.length === 0 ? (
                  <p className="rounded-2xl bg-emerald-50 p-4 text-emerald-800">Tous les lots ont au moins un email.</p>
                ) : (
                  membersWithoutEmail.map((member: any) => (
                    <Link key={member.id} href="/admin/participants" className="rounded-2xl border border-slate-200 p-3 transition hover:bg-slate-50">
                      Lot {member.lotNumber} — {formatMemberDisplay(member)}
                    </Link>
                  ))
                )}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
