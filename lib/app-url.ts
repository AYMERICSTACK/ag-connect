export function getAppBaseUrl() {
  const explicitUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (explicitUrl && !explicitUrl.includes("localhost")) {
    return explicitUrl.replace(/\/$/, "");
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`.replace(/\/$/, "");
  }

  return (explicitUrl || "http://localhost:3000").replace(/\/$/, "");
}

export function buildJoinUrl(accessCode: string) {
  return `${getAppBaseUrl()}/join/${accessCode}`;
}

export function qrCodeUrl(value: string, size = 180) {
  const encoded = encodeURIComponent(value);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}`;
}
