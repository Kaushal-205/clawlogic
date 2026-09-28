'use client';

import type { ReactNode } from 'react';
import type { AgentBroadcast } from '@/lib/client';
import type { MarketInfo, MarketProbability } from '@clawlogic/sdk';
import {
  EXPLORER_URL,
  broadcastVerb,
  estimateSlippageBand,
  formatEthShort,
  getAgentLabel,
  getAssertedOutcome,
  getMarketStatus,
  parseCrossedIntentQuote,
  relativeTime,
  shortHash,
} from '@/lib/market-view';
import { AgentAvatar, ConfidenceMeter, SidePill, StatusBadge } from './ui';

interface MarketCardProps {
  market: MarketInfo;
  index: number;
  probability?: MarketProbability;
  /** Broadcasts for this market, newest first. */
  events: AgentBroadcast[];
  clobEnabled: boolean;
  showAdvanced?: boolean;
}

function isAgentCall(event: AgentBroadcast): boolean {
  return (
    event.type === 'TradeRationale' ||
    event.type === 'NegotiationIntent' ||
    event.type === 'MarketBroadcast'
  );
}

function getLatestNarrative(events: AgentBroadcast[]): AgentBroadcast | null {
  return (
    events.find((event) => event.type === 'TradeRationale') ??
    events.find((event) => event.type === 'NegotiationIntent') ??
    events.find((event) => event.type === 'MarketBroadcast') ??
    null
  );
}

function OutcomeFigure({
  label,
  pct,
  tone,
  align,
  state,
}: {
  label: string;
  pct: number | null;
  tone: 'yes' | 'no';
  align: 'left' | 'right';
  state: 'neutral' | 'won' | 'lost';
}) {
  const color = tone === 'yes' ? 'text-yes' : 'text-no';
  return (
    <div className={`${align === 'right' ? 'text-right' : ''} ${state === 'lost' ? 'opacity-45' : ''}`}>
      <div className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider ${color} ${align === 'right' ? 'justify-end' : ''}`}>
        {label}
        {state === 'won' && (
          <span className="rounded bg-white/10 px-1 py-px text-[10px] tracking-normal text-fg normal-case">Won</span>
        )}
      </div>
      <div className="tabular mt-0.5 font-display text-3xl font-semibold leading-none text-fg sm:text-4xl">
        {pct === null ? '—' : `${pct}%`}
      </div>
    </div>
  );
}

function DetailRow({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`min-w-0 ${wide ? 'sm:col-span-2' : ''}`}>
      <dt className="text-subtle">{label}</dt>
      <dd className="mt-0.5 break-all font-mono text-muted">{children}</dd>
    </div>
  );
}

export default function MarketCard({
  market,
  index,
  probability,
  events,
  clobEnabled,
  showAdvanced = false,
}: MarketCardProps) {
  const status = getMarketStatus(market);
  const assertedOutcome = getAssertedOutcome(market);
  const winner = status === 'resolved' ? assertedOutcome : null;

  const p1 = probability?.outcome1Probability ?? 0;
  const p2 = probability?.outcome2Probability ?? 0;
  const priced = p1 + p2 > 0;
  const yesPct = priced ? Math.round((p1 / (p1 + p2)) * 100) : null;
  const noPct = yesPct === null ? null : 100 - yesPct;

  const calls = events.filter(isAgentCall);
  const latest = getLatestNarrative(events);
  const earlier = calls.filter((event) => event !== latest).slice(0, 2);

  const latestTrade = events.find((event) => event.type === 'TradeRationale') ?? null;
  const latestIntentYes =
    events.find((event) => event.type === 'NegotiationIntent' && event.side === 'yes') ?? null;
  const latestIntentNo =
    events.find((event) => event.type === 'NegotiationIntent' && event.side === 'no') ?? null;
  const quoteFromTrade = latestTrade ? parseCrossedIntentQuote(latestTrade.reasoning) : null;
  const yesBid = latestIntentYes ? Math.round(latestIntentYes.confidence * 100) : null;
  const noAsk = latestIntentNo ? Math.round(latestIntentNo.confidence * 100) : null;
  const inferredEdge =
    yesBid !== null && noAsk !== null ? yesBid - (10_000 - noAsk) : null;

  const statusDetail =
    status === 'resolving' && assertedOutcome
      ? `${assertedOutcome.toUpperCase()} proposed`
      : status === 'resolved' && winner
        ? `${winner.toUpperCase()} won`
        : undefined;

  return (
    <article
      className="animate-card-in rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-line-strong sm:p-6"
      style={{ animationDelay: `${Math.min(index * 60, 300)}ms` }}
    >
      <StatusBadge status={status} detail={statusDetail} />

      <h3 className="mt-4 text-balance font-display text-xl font-semibold leading-snug text-fg sm:text-[22px]">
        {market.description}
      </h3>

      {/* Odds */}
      <div className="mt-5">
        <div className="flex items-end justify-between gap-4">
          <OutcomeFigure
            label={market.outcome1}
            pct={yesPct}
            tone="yes"
            align="left"
            state={winner ? (winner === market.outcome1 ? 'won' : 'lost') : 'neutral'}
          />
          <OutcomeFigure
            label={market.outcome2}
            pct={noPct}
            tone="no"
            align="right"
            state={winner ? (winner === market.outcome2 ? 'won' : 'lost') : 'neutral'}
          />
        </div>
        <div
          className="mt-3 flex h-2 gap-1 overflow-hidden rounded-full"
          role="img"
          aria-label={
            yesPct === null
              ? 'Not priced yet'
              : `${market.outcome1} ${yesPct} percent, ${market.outcome2} ${noPct} percent`
          }
        >
          {yesPct === null ? (
            <div className="h-full w-full rounded-full bg-surface-3" />
          ) : (
            <>
              {yesPct > 0 && (
                <div className="h-full rounded-full bg-yes transition-all duration-700" style={{ flex: `${yesPct} 1 0%` }} />
              )}
              {(noPct ?? 0) > 0 && (
                <div className="h-full rounded-full bg-no transition-all duration-700" style={{ flex: `${noPct} 1 0%` }} />
              )}
            </>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-subtle">
          <span>
            <span className="tabular text-muted">{formatEthShort(market.totalCollateral)} ETH</span> pooled
          </span>
          <span>
            <span className="tabular text-muted">{calls.length}</span> agent{' '}
            {calls.length === 1 ? 'call' : 'calls'}
          </span>
          {yesPct === null && <span>Not priced yet</span>}
        </div>
      </div>

      {/* Latest reasoning */}
      <div className="mt-5 rounded-xl border border-line bg-surface-2/70 p-4">
        {latest ? (
          <>
            <div className="flex items-center gap-3">
              <AgentAvatar address={latest.agentAddress} name={getAgentLabel(latest)} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="truncate font-medium text-fg">{getAgentLabel(latest)}</span>
                  {latest.side && <SidePill side={latest.side} />}
                </div>
                <div className="text-xs text-subtle">
                  {broadcastVerb(latest)} · {relativeTime(latest.timestamp)}
                </div>
              </div>
            </div>

            <p className="mt-3 text-[15px] leading-relaxed text-muted">{latest.reasoning}</p>

            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
              <ConfidenceMeter value={latest.confidence} />
              {latest.stakeEth && (
                <span className="text-muted">
                  Stake <span className="tabular font-medium text-fg">{latest.stakeEth} ETH</span>
                </span>
              )}
            </div>

            {earlier.length > 0 && (
              <ul className="mt-4 space-y-2 border-t border-line pt-3">
                {earlier.map((event) => (
                  <li key={event.id} className="flex min-w-0 items-center gap-2 text-sm">
                    <AgentAvatar address={event.agentAddress} name={getAgentLabel(event)} size="xs" />
                    <span className="truncate text-fg/90">{getAgentLabel(event)}</span>
                    <span className="hidden shrink-0 text-subtle sm:inline">{broadcastVerb(event)}</span>
                    {event.side && <SidePill side={event.side} size="sm" />}
                    <span className="ml-auto shrink-0 text-xs text-subtle">{relativeTime(event.timestamp)}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="text-sm text-subtle">No agent has explained a position on this market yet.</p>
        )}
      </div>

      {showAdvanced && (
        <dl className="mt-4 grid gap-x-6 gap-y-3 rounded-xl border border-dashed border-line-strong p-4 text-xs sm:grid-cols-2">
          <DetailRow label="Market ID" wide>
            {market.marketId}
          </DetailRow>
          <DetailRow label="Pool collateral">{formatEthShort(market.totalCollateral)} ETH</DetailRow>
          <DetailRow label="UMA bond / reward">
            {formatEthShort(market.requiredBond)} / {formatEthShort(market.reward)} ETH
          </DetailRow>
          <DetailRow label="CLOB matching">{clobEnabled ? 'enabled' : 'disabled'}</DetailRow>
          {quoteFromTrade ? (
            <DetailRow label="Crossed quote edge">{(quoteFromTrade.edgeBps / 100).toFixed(2)}%</DetailRow>
          ) : inferredEdge !== null ? (
            <DetailRow label="Indicative intent edge">{(inferredEdge / 100).toFixed(2)}%</DetailRow>
          ) : (
            <DetailRow label="Slippage profile">{estimateSlippageBand(market.totalCollateral)}</DetailRow>
          )}
          {latestTrade?.tradeTxHash && (
            <DetailRow label="Latest trade tx" wide>
              <a
                href={`${EXPLORER_URL}/tx/${latestTrade.tradeTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand hover:underline"
              >
                {shortHash(latestTrade.tradeTxHash, 10, 8)} ↗
              </a>
            </DetailRow>
          )}
        </dl>
      )}
    </article>
  );
}
