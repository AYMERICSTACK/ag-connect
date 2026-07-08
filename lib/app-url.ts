const PRODUCTION_APP_URL = "https://ag-connect-smoky.vercel.app";

export function getAppBaseUrl() {
  const explicitUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (explicitUrl) {
    return explicitUrl.replace(/\/$/, "");
  }

  if (process.env.NODE_ENV === "production") {
    return PRODUCTION_APP_URL;
  }

  return "http://localhost:3000";
}

export function buildJoinUrl(accessCode: string) {
  return `${getAppBaseUrl()}/join/${accessCode}`;
}

export function qrCodeUrl(value: string, size = 180) {
  const encoded = encodeURIComponent(value);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}`;
}
