export type MemberDisplayInput = {
  firstName?: string | null;
  lastName?: string | null;
  lotNumber?: string | number | null;
};

const CIVILITY_PATTERNS: RegExp[] = [
  /\b(?:mr|m\.?|monsieur)\s*(?:et|&)\s*(?:mme|madame)\b\.?/gi,
  /\b(?:mme|madame)\s*(?:et|&)\s*(?:mr|m\.?|monsieur)\b\.?/gi,
  /\bmonsieur\b\.?/gi,
  /\bmadame\b\.?/gi,
  /\bmlle\b\.?/gi,
  /\bmme\b\.?/gi,
  /\bmr\b\.?/gi,
  /\bm\b\.?/gi,
];

export function cleanMemberDisplayName(value: string) {
  let cleaned = value || "";

  for (const pattern of CIVILITY_PATTERNS) {
    cleaned = cleaned.replace(pattern, " ");
  }

  return cleaned
    .replace(/[;,]+/g, " ")
    .replace(/\s+\/\s+/g, " / ")
    .replace(/\s+-\s+/g, " - ")
    .replace(/\s+/g, " ")
    .replace(/^\s*(?:et|&)\s+/i, "")
    .replace(/\s+(?:et|&)\s*$/i, "")
    .trim();
}

export function formatMemberDisplay(member: MemberDisplayInput) {
  const rawName = `${member.firstName || ""} ${member.lastName || ""}`.replace(/\s+/g, " ").trim();
  const cleanedName = cleanMemberDisplayName(rawName);

  if (cleanedName) return cleanedName;
  if (member.lastName) return cleanMemberDisplayName(String(member.lastName)) || String(member.lastName);
  if (member.lotNumber) return `Lot ${member.lotNumber}`;
  return "Propriétaire";
}
