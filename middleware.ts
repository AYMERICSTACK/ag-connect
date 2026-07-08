import { NextRequest, NextResponse } from "next/server";
import { getAppBaseUrl } from "@/lib/app-url";
import { ADMIN_COOKIE_NAME, getAdminSessionToken } from "@/lib/auth";

function isProtectedPath(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/api/admin/");
}

function isAdminSurface(pathname: string) {
  return isProtectedPath(pathname) || pathname === "/login" || pathname === "/logout";
}

function getCanonicalRedirect(request: NextRequest) {
  if (process.env.NODE_ENV !== "production") return null;

  const { pathname, search } = request.nextUrl;
  if (!isAdminSurface(pathname)) return null;

  const currentHost = request.headers.get("host");
  const canonicalBaseUrl = getAppBaseUrl();

  try {
    const canonicalUrl = new URL(canonicalBaseUrl);

    if (!currentHost || currentHost === canonicalUrl.host) return null;

    return new URL(`${pathname}${search}`, canonicalUrl.origin);
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const canonicalRedirect = getCanonicalRedirect(request);
  if (canonicalRedirect) {
    return NextResponse.redirect(canonicalRedirect);
  }

  if (!isAdminSurface(pathname)) {
    return NextResponse.next();
  }

  const expectedToken = await getAdminSessionToken();
  const currentToken = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const hasValidSession = Boolean(expectedToken) && currentToken === expectedToken;

  if (pathname === "/login") {
    if (hasValidSession) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }

    return NextResponse.next();
  }

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  if (hasValidSession) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/admin/")) {
    return NextResponse.json({ error: "Accès administrateur requis." }, { status: 401 });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/login", "/logout"],
};
