export function formatDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatTime(date?: Date | null) {
  if (!date) return "—";

  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function sortByLot(a: any, b: any) {
  const aLot = Number(a.lotNumber);
  const bLot = Number(b.lotNumber);
  if (Number.isFinite(aLot) && Number.isFinite(bLot)) return aLot - bLot;
  return String(a.lotNumber).localeCompare(String(b.lotNumber), "fr", { numeric: true });
}

export function extractEmails(value?: string | null) {
  if (!value) return [];
  const matches = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return Array.from(new Set(matches.map((email) => email.trim().toLowerCase())));
}

export function getEligibleMembers(assembly: any) {
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

export function getResolutionStats(resolution: any, eligibleMembers: any[]) {
  const totalWeight = resolution.votes.reduce((sum: number, vote: any) => sum + vote.weight, 0);
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

  return { totalWeight, participation, choiceTotals, decision };
}
