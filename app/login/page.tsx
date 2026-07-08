import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE_NAME, ADMIN_SESSION_MAX_AGE, getAdminPassword, getAdminSessionToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams?: Promise<{ from?: string; error?: string }>;
};

function sanitizeRedirectPath(value?: string) {
  if (!value || !value.startsWith("/admin")) return "/admin";
  if (value.includes("//")) return "/admin";
  return value;
}

async function login(formData: FormData) {
  "use server";

  const password = String(formData.get("password") || "");
  const from = sanitizeRedirectPath(String(formData.get("from") || "/admin"));
  const expectedPassword = getAdminPassword();

  if (!expectedPassword || password !== expectedPassword) {
    redirect(`/login?from=${encodeURIComponent(from)}&error=1`);
  }

  const token = await getAdminSessionToken();
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ADMIN_SESSION_MAX_AGE,
    path: "/",
  });

  redirect(from);
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const from = sanitizeRedirectPath(params?.from);
  const hasError = params?.error === "1";
  const isMissingPassword = !getAdminPassword();

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,#dbeafe,transparent_35%),linear-gradient(135deg,#f8fafc,#f7f4ef)] px-4 py-10 text-slate-950">
      <section className="w-full max-w-md overflow-hidden rounded-[2rem] bg-white shadow-2xl shadow-slate-900/10 ring-1 ring-slate-200">
        <div className="bg-slate-950 px-8 py-7 text-white">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-blue-200">AG Connect</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Administration sécurisée</h1>
          <p className="mt-2 text-sm leading-6 text-slate-300">Accès réservé au bureau de l’ASL Les Tilleuls.</p>
        </div>

        <form action={login} className="space-y-5 p-8">
          <input type="hidden" name="from" value={from} />

          <div>
            <label htmlFor="password" className="text-sm font-semibold text-slate-700">
              Mot de passe administrateur
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              autoFocus
              disabled={isMissingPassword}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base outline-none transition focus:border-slate-950 focus:bg-white focus:ring-4 focus:ring-slate-950/10 disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="••••••••••••"
            />
          </div>

          {hasError ? (
            <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 ring-1 ring-red-100">
              Mot de passe incorrect. Veuillez réessayer.
            </div>
          ) : null}

          {isMissingPassword ? (
            <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800 ring-1 ring-amber-100">
              Variable <strong>ADMIN_PASSWORD</strong> absente. Ajoute-la dans ton fichier <strong>.env</strong> en local et dans les variables d’environnement Vercel.
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isMissingPassword}
            className="w-full rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-950/15 transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
          >
            Se connecter
          </button>

          <p className="text-center text-xs leading-5 text-slate-400">
            Les pages propriétaires et les QR Codes restent accessibles sans mot de passe.
          </p>
        </form>
      </section>
    </main>
  );
}
