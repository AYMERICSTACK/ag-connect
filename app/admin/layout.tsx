import Link from "next/link";

const links = [
  { href: "/admin", label: "Pilotage" },
  { href: "/admin/participants", label: "Participants" },
  { href: "/admin/resolutions", label: "Résolutions" },
  { href: "/admin/votes", label: "Votes" },
  { href: "/admin/report", label: "PV" },
  { href: "/admin/finalize", label: "Finaliser" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 px-4 py-3 backdrop-blur-xl print:hidden">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Link href="/admin" className="flex items-center gap-3 text-slate-950">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-sm font-bold text-white shadow-lg shadow-slate-950/15">AG</span>
            <span>
              <span className="block text-sm font-semibold leading-4">AG Connect</span>
              <span className="text-xs text-slate-500">Administration sécurisée</span>
            </span>
          </Link>

          <nav className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-600">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="rounded-full px-3 py-2 transition hover:bg-slate-100 hover:text-slate-950">
                {link.label}
              </Link>
            ))}
            <form action="/logout" method="post">
              <button type="submit" className="rounded-full bg-slate-950 px-4 py-2 text-white transition hover:bg-slate-800">
                Déconnexion
              </button>
            </form>
          </nav>
        </div>
      </header>
      {children}
    </>
  );
}
