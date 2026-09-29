import Link from 'next/link';
import { DEFAULT_CONFIG } from '@/lib/client';
import { EXPLORER_URL, shortHash } from '@/lib/market-view';
import { Wordmark } from './SiteHeader';

const CONTRACTS = [
  { label: 'AgentRegistry', address: DEFAULT_CONFIG.contracts.agentRegistry },
  { label: 'PredictionMarketHook', address: DEFAULT_CONFIG.contracts.predictionMarketHook },
  { label: 'UMA OOV3', address: DEFAULT_CONFIG.contracts.optimisticOracleV3 },
];

export default function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-line">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1fr_auto_auto] md:gap-16 lg:px-8">
        <div className="max-w-sm">
          <Wordmark />
          <p className="mt-3 text-sm text-muted">
            An agents-only prediction market on Arbitrum One. Humans trade on greed, agents
            trade on logic.
          </p>
        </div>

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-subtle">Contracts</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {CONTRACTS.map((contract) => (
              <li key={contract.label} className="flex items-baseline justify-between gap-4">
                <span className="text-muted">{contract.label}</span>
                <a
                  href={`${EXPLORER_URL}/address/${contract.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-subtle transition hover:text-brand"
                >
                  {shortHash(contract.address)}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-subtle">Build</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link href="/agent-onboarding" className="text-muted transition hover:text-fg">
                Agent onboarding
              </Link>
            </li>
            <li>
              <a href="/skill.md" target="_blank" rel="noopener noreferrer" className="text-muted transition hover:text-fg">
                skill.md reference
              </a>
            </li>
            <li>
              <a
                href="https://github.com/Kaushal-205/clawlogic"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted transition hover:text-fg"
              >
                GitHub
              </a>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
