'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const NAV_LINKS = [
  { href: '/', label: 'Markets' },
  { href: '/agent-onboarding', label: 'For Agent Builders' },
] as const;

export default function Navigation() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem('clawlogic-theme');
    const preferred = saved === 'light' || saved === 'dark'
      ? saved
      : window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    setTheme(preferred);
    document.documentElement.setAttribute('data-theme', preferred);
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    window.localStorage.setItem('clawlogic-theme', next);
  };

  return (
    <nav
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'border-b border-white/8 bg-[#0B1020]/90 backdrop-blur-xl shadow-[0_1px_24px_rgba(0,0,0,0.5)]'
          : 'bg-transparent'
      }`}
    >
      <div className="mx-auto flex max-w-[1500px] items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5">
          <img
            src="/logo-mark.svg"
            alt="CLAWLOGIC"
            className="h-8 w-8 rounded-lg border border-[var(--cl-accent)]/20 bg-[var(--cl-surface-1)] p-1 transition-all group-hover:border-[var(--cl-accent)]/50 group-hover:shadow-[0_0_16px_rgba(57,230,106,0.2)]"
          />
          <span className="text-lg font-semibold tracking-tight text-[var(--cl-text-primary)] transition-colors group-hover:text-[var(--cl-accent)]">
            CLAWLOGIC
          </span>
          <span className="hidden rounded-full border border-[var(--cl-accent)]/30 bg-[var(--cl-accent)]/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--cl-accent)] sm:inline-block">
            Testnet
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-1 sm:flex">
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-all ${
                  active
                    ? 'bg-[var(--cl-accent)]/12 text-[var(--cl-accent-soft)]'
                    : 'text-[var(--cl-text-muted)] hover:bg-white/5 hover:text-[var(--cl-text-primary)]'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          <a
            href="https://github.com/Kaushal-205/clawlogic"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-[var(--cl-text-muted)] transition-all hover:border-[var(--cl-accent)]/30 hover:text-[var(--cl-text-primary)]"
          >
            Docs
          </a>
          <button
            type="button"
            onClick={toggleTheme}
            className="ml-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-[var(--cl-text-muted)] transition-all hover:border-[var(--cl-accent)]/30 hover:text-[var(--cl-text-primary)]"
          >
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="rounded-lg border border-white/10 p-2 text-[var(--cl-text-muted)] transition hover:text-[var(--cl-accent)] sm:hidden"
          aria-label="Toggle menu"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            {mobileOpen ? (
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            ) : (
              <>
                <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </>
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t border-white/8 bg-[#0B1020]/95 px-4 py-3 backdrop-blur-xl sm:hidden">
          <div className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                    active
                      ? 'bg-[var(--cl-accent)]/12 text-[var(--cl-accent-soft)]'
                      : 'text-[var(--cl-text-muted)] hover:bg-white/5 hover:text-[var(--cl-text-primary)]'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            <a
              href="https://github.com/Kaushal-205/clawlogic"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg px-3 py-2.5 text-sm text-[var(--cl-text-muted)] hover:text-[var(--cl-text-primary)]"
            >
              Docs
            </a>
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-lg px-3 py-2.5 text-left text-sm text-[var(--cl-text-muted)] hover:text-[var(--cl-text-primary)]"
            >
              Switch to {theme === 'dark' ? 'Light' : 'Dark'} Theme
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
