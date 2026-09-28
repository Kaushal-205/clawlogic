import type { ReactNode } from 'react';
import type { MarketStatus } from '@/lib/market-view';

// ---------------------------------------------------------------------------
// Agent avatar: deterministic hue per address so agents are recognisable at a glance
// ---------------------------------------------------------------------------

const AVATAR_SIZES = {
  xs: 'h-5 w-5 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
} as const;

function hueFor(seed: string): number {
  let hash = 0;
  for (const char of seed.toLowerCase()) {
    hash = (hash * 31 + char.charCodeAt(0)) % 360;
  }
  return hash;
}

export function AgentAvatar({
  address,
  name,
  size = 'sm',
}: {
  address: string;
  name: string;
  size?: keyof typeof AVATAR_SIZES;
}) {
  const hue = hueFor(address);
  const initial = (name.startsWith('0x') ? name.slice(2, 3) : name.charAt(0)).toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-display font-semibold ${AVATAR_SIZES[size]}`}
      style={{
        backgroundColor: `hsl(${hue} 65% 55% / 0.16)`,
        color: `hsl(${hue} 85% 74%)`,
        boxShadow: `inset 0 0 0 1px hsl(${hue} 70% 62% / 0.32)`,
      }}
    >
      {initial}
    </span>
  );
}

// ---------------------------------------------------------------------------
// YES / NO pill
// ---------------------------------------------------------------------------

export function SidePill({ side, size = 'md' }: { side?: 'yes' | 'no'; size?: 'sm' | 'md' }) {
  const tone =
    side === 'yes'
      ? 'bg-yes/12 text-yes ring-yes/30'
      : side === 'no'
        ? 'bg-no/12 text-no ring-no/30'
        : 'bg-white/5 text-muted ring-line-strong';
  const sizing = size === 'sm' ? 'px-1.5 py-px text-[10px]' : 'px-2 py-0.5 text-[11px]';
  return (
    <span
      className={`inline-flex items-center rounded-md font-semibold uppercase tracking-wider ring-1 ring-inset ${tone} ${sizing}`}
    >
      {side ?? 'Watching'}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Confidence meter
// ---------------------------------------------------------------------------

export function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <span className="inline-flex items-center gap-2" title={`${pct}% confidence`}>
      <span className="relative h-1.5 w-14 overflow-hidden rounded-full bg-surface-3">
        <span className="absolute inset-y-0 left-0 rounded-full bg-fg/70" style={{ width: `${pct}%` }} />
      </span>
      <span className="tabular text-muted">
        <span className="font-medium text-fg">{pct}%</span> confident
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Market status badge
// ---------------------------------------------------------------------------

const STATUS_META: Record<MarketStatus, { label: string; dot: string; live: boolean }> = {
  open: { label: 'Open', dot: 'text-yes', live: true },
  resolving: { label: 'Resolving', dot: 'text-pending', live: true },
  resolved: { label: 'Resolved', dot: 'text-subtle', live: false },
};

export function StatusBadge({ status, detail }: { status: MarketStatus; detail?: ReactNode }) {
  const meta = STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-xs font-medium text-fg">
      <span className={meta.live ? `live-dot ${meta.dot}` : `h-2 w-2 rounded-full bg-current ${meta.dot}`} />
      {meta.label}
      {detail && <span className="font-normal text-muted">· {detail}</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Toggle switch
// ---------------------------------------------------------------------------

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="group inline-flex items-center gap-2.5 rounded-full py-1 text-sm text-muted transition hover:text-fg"
    >
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-brand' : 'bg-surface-3 ring-1 ring-inset ring-line-strong'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full shadow transition-transform ${
            checked ? 'translate-x-[18px] bg-brand-ink' : 'translate-x-0.5 bg-fg/80'
          }`}
        />
      </span>
      {label}
    </button>
  );
}
