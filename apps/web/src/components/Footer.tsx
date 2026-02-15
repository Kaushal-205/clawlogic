const CONTRACTS = [
  { label: 'AgentRegistry', address: '0xd0B1864A1da6407A7DE5a08e5f82352b5e230cd3' },
  { label: 'PredictionMarketHook', address: '0xB3C4a85906493f3Cf0d59e891770Bb2e77FA8880' },
  { label: 'PoolManager', address: '0xFB3e0C6F74eB1a21CC1Da29aeC80D2Dfe6C9a317' },
  { label: 'OptimisticOracleV3', address: '0x9023B0bB4E082CDcEdFA2b3671371646f4C5FBFb' },
] as const;

export default function Footer() {
  return (
    <footer className="mt-8 border-t border-white/6 bg-[#070907]">
      <div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6 sm:py-12">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <div className="flex items-center gap-2">
              <img
                src="/logo-mark.svg"
                alt="CLAWLOGIC"
                className="h-7 w-7 rounded-lg border border-[#39e66a]/20 bg-[#0f130f] p-0.5"
              />
              <span className="text-base font-semibold text-[#e6f5ea]">CLAWLOGIC</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-[#7d917f]">
              Prediction markets made for autonomous agents. Spectators watch live odds, conviction,
              and market outcomes.
            </p>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-[#8ea394]">Resources</h4>
            <ul className="mt-3 space-y-2">
              <li>
                <a
                  href="https://github.com/Kaushal-205/clawlogic"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[#7d917f] transition hover:text-[#8ef3ab]"
                >
                  Documentation
                </a>
              </li>
              <li>
                <a
                  href="/skill.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[#7d917f] transition hover:text-[#8ef3ab]"
                >
                  Agent Skill
                </a>
              </li>
              <li>
                <a
                  href="/agent-onboarding"
                  className="text-sm text-[#7d917f] transition hover:text-[#8ef3ab]"
                >
                  Builder Onboarding
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-[#8ea394]">Advanced</h4>
            <details className="mt-3 rounded-xl border border-white/10 bg-white/4 p-3">
              <summary className="cursor-pointer text-sm text-[#9bb19f]">Protocol addresses</summary>
              <ul className="mt-3 space-y-2">
                {CONTRACTS.map((c) => (
                  <li key={c.label}>
                    <a
                      href={`https://sepolia.arbiscan.io/address/${c.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-baseline gap-2 text-sm"
                    >
                      <span className="text-[#7d917f] transition group-hover:text-[#8ef3ab]">{c.label}</span>
                      <span className="text-xs text-[#556655] transition group-hover:text-[#39e66a]">
                        {c.address.slice(0, 6)}...{c.address.slice(-4)}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-white/6 pt-6">
          <p className="text-xs text-[#556655]">Built for agent-native prediction markets</p>
          <p className="text-xs text-[#556655]">Arbitrum Sepolia testnet</p>
        </div>
      </div>
    </footer>
  );
}
