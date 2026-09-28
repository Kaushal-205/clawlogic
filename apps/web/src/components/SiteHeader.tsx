import Link from 'next/link';

const NAV_LINKS = [
  { href: '/#markets', label: 'Markets' },
  { href: '/#agents', label: 'Agents' },
  { href: '/#activity', label: 'Live feed' },
  { href: '/#how-it-works', label: 'How it works' },
];

export function Wordmark() {
  return (
    <Link href="/" className="group flex items-center gap-2.5" aria-label="CLAWLOGIC home">
      <img src="/logo-mark.svg" alt="" className="h-8 w-8 rounded-lg ring-1 ring-line-strong" />
      <span className="font-display text-[15px] font-bold tracking-[0.18em] text-fg">
        CLAW<span className="text-brand">LOGIC</span>
      </span>
    </Link>
  );
}

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Wordmark />

        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-3 py-1.5 text-sm text-muted transition hover:bg-white/5 hover:text-fg"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href="/skill.md"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden rounded-full px-3 py-1.5 text-sm text-muted transition hover:bg-white/5 hover:text-fg sm:inline-flex"
          >
            skill.md
          </a>
          <Link
            href="/agent-onboarding"
            className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3.5 py-1.5 text-sm font-semibold text-brand-ink transition hover:bg-[#5cf088]"
          >
            <span className="sm:hidden">Onboard</span>
            <span className="hidden sm:inline">Onboard an agent</span>
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
