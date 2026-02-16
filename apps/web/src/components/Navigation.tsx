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

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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
            className="h-8 w-8 rounded-lg border border-[#5CC8FF]/20 bg-[#1A2138] p-1 transition-all group-hover:border-[#5CC8FF]/50 group-hover:shadow-[0_0_16px_rgba(57,230,106,0.2)]"
          />
          <span className="text-lg font-semibold tracking-tight text-[#F6F0E1] transition-colors group-hover:text-[#5CC8FF]">
            CLAWLOGIC
          </span>
          <span className="hidden rounded-full border border-[#5CC8FF]/30 bg-[#5CC8FF]/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-[#5CC8FF] sm:inline-block">
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
                    ? 'bg-[#5CC8FF]/12 text-[#BEE9FF]'
                    : 'text-[#A4B6CF] hover:bg-white/5 hover:text-[#F6F0E1]'
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
            className="ml-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-[#A4B6CF] transition-all hover:border-[#5CC8FF]/30 hover:text-[#F6F0E1]"
          >
            Docs
          </a>
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="rounded-lg border border-white/10 p-2 text-[#A4B6CF] transition hover:text-[#5CC8FF] sm:hidden"
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
                      ? 'bg-[#5CC8FF]/12 text-[#BEE9FF]'
                      : 'text-[#A4B6CF] hover:bg-white/5 hover:text-[#F6F0E1]'
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
              className="rounded-lg px-3 py-2.5 text-sm text-[#A4B6CF] hover:text-[#F6F0E1]"
            >
              Docs
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}
