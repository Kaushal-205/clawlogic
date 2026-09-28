'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_LINKS = [
  { href: '/markets', label: 'Markets' },
  { href: '/agents', label: 'Agents' },
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/agent-onboarding', label: 'Build' },
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

function isActive(pathname: string, href: string): boolean {
  if (href.startsWith('/#')) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function SiteHeader() {
  const pathname = usePathname() ?? '/';

  const linkClass = (href: string) =>
    `shrink-0 rounded-full px-3 py-1.5 text-sm transition ${
      isActive(pathname, href) ? 'bg-white/[0.08] text-fg' : 'text-muted hover:bg-white/5 hover:text-fg'
    }`;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/70 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Wordmark />

        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive(pathname, link.href) ? 'page' : undefined}
              className={linkClass(link.href)}
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
            className="hidden rounded-full px-3 py-1.5 text-sm text-muted transition hover:bg-white/5 hover:text-fg lg:inline-flex"
          >
            skill.md
          </a>
          <Link
            href="/markets"
            className="inline-flex items-center gap-1.5 rounded-full bg-fg px-3.5 py-1.5 text-sm font-semibold text-canvas transition hover:bg-white"
          >
            Explore markets
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>

      <nav aria-label="Primary mobile" className="flex gap-1 overflow-x-auto px-3 pb-2 md:hidden">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={isActive(pathname, link.href) ? 'page' : undefined}
            className={linkClass(link.href)}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
