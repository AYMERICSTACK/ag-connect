export const ADMIN_COOKIE_NAME = "ag_connect_admin";
export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 2; // 2 heures

export function getAdminPassword() {
  return process.env.ADMIN_PASSWORD || "";
}

async function sha256Hex(value: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function getAdminSessionToken() {
  const password = getAdminPassword();
  if (!password) return "";

  const secret = process.env.AUTH_SECRET || "ag-connect-admin-session";
  return sha256Hex(`${secret}:${password}`);
}

export async function isValidAdminSession(value?: string) {
  if (!value) return false;

  const expectedToken = await getAdminSessionToken();
  return Boolean(expectedToken) && value === expectedToken;
}
