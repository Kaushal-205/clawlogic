'use client';

import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import type { CallMarker, HistorySource, MarketHistory, PricePoint } from '@/lib/price-history';
import { useElementWidth } from './useElementWidth';

export type ChartRange = '1D' | '1W' | '1M' | 'ALL';
export const CHART_RANGES: ChartRange[] = ['1D', '1W', '1M', 'ALL'];
const RANGE_MS: Record<Exclude<ChartRange, 'ALL'>, number> = {
  '1D': 24 * 3600_000,
  '1W': 7 * 24 * 3600_000,
  '1M': 30 * 24 * 3600_000,
};

const COLOR_LINE = 'var(--color-yes-mark)';
const COLOR_SIDE = { yes: 'var(--color-yes-mark)', no: 'var(--color-no-mark)' } as const;
const COLOR_SURFACE = 'var(--color-surface)';
const COLOR_GRID = 'var(--color-grid)';
const MARGIN = { top: 14, right: 56, bottom: 30, left: 44 };
const Y_TICKS = [0, 25, 50, 75, 100];

export function seriesLabel(source: HistorySource, outcome: string): string {
  if (source === 'agents') return 'Agent consensus';
  if (source === 'sample') return `${outcome} price (sample)`;
  return `${outcome} price`;
}

function formatTick(t: number, span: number): string {
  const date = new Date(t);
  if (span <= 2 * 24 * 3600_000) return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (span <= 240 * 24 * 3600_000) return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

function formatFull(t: number): string {
  return new Date(t).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatPct(p: number): string {
  return `${Math.round(p * 10) / 10}%`;
}

interface View {
  tMin: number;
  tMax: number;
  series: PricePoint[];
  calls: CallMarker[];
}

function buildView(history: MarketHistory, calls: CallMarker[], range: ChartRange, now: number): View | null {
  const points = history.points;
  const times = [...points.map((point) => point.t), ...calls.map((call) => call.t)];
  if (times.length === 0) return null;

  const first = Math.min(...times);
  // Stepped series hold their last value until now; the sample walk already ends at now.
  let tMax = history.source === 'sample' ? Math.max(...times) : Math.max(now, ...times);
  let tMin = range === 'ALL' ? first : Math.max(first, tMax - RANGE_MS[range]);
  if (tMax - tMin < 60_000) {
    tMin = tMax - 3600_000;
    tMax = Math.max(tMax, tMin + 3600_000);
  }

  const inRange = points.filter((point) => point.t >= tMin && point.t <= tMax);
  const before = [...points].reverse().find((point) => point.t < tMin);
  // Carry the price in effect at the range start so the line doesn't begin mid-air.
  const series = before ? [{ t: tMin, p: before.p }, ...inRange] : inRange;
  return { tMin, tMax, series, calls: calls.filter((call) => call.t >= tMin && call.t <= tMax) };
}

type Hover = { kind: 'series'; index: number } | { kind: 'call'; id: string } | null;

export default function PriceChart({
  history,
  calls,
  outcomeLabel,
  range,
  plotHeight = 260,
}: {
  history: MarketHistory;
  calls: CallMarker[];
  outcomeLabel: string;
  range: ChartRange;
  plotHeight?: number;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<Hover>(null);
  const washId = `wash${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const stepped = history.source !== 'sample';
  const label = seriesLabel(history.source, outcomeLabel);
  const totalHeight = MARGIN.top + plotHeight + MARGIN.bottom;

  const view = useMemo(() => buildView(history, calls, range, Date.now()), [history, calls, range]);

  const plotW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const x = (t: number) => (view ? MARGIN.left + ((t - view.tMin) / (view.tMax - view.tMin)) * plotW : 0);
  const y = (p: number) => MARGIN.top + (1 - p / 100) * plotHeight;

  const paths = useMemo(() => {
    if (!view || view.series.length === 0 || plotW <= 0) return null;
    const xs = (t: number) => MARGIN.left + ((t - view.tMin) / (view.tMax - view.tMin)) * plotW;
    const ys = (p: number) => MARGIN.top + (1 - p / 100) * plotHeight;
    const [head, ...rest] = view.series;
    let line = `M${xs(head.t)},${ys(head.p)}`;
    for (const point of rest) {
      line += stepped ? `H${xs(point.t)}V${ys(point.p)}` : `L${xs(point.t)},${ys(point.p)}`;
    }
    const endX = stepped ? xs(view.tMax) : xs(view.series[view.series.length - 1].t);
    if (stepped) line += `H${endX}`;
    const area = `${line}V${ys(0)}H${xs(head.t)}Z`;
    const last = view.series[view.series.length - 1];
    return { line, area, end: { x: endX, y: ys(last.p), p: last.p } };
  }, [view, plotW, plotHeight, stepped]);

  const xTicks = useMemo(() => {
    if (!view || plotW <= 0) return [];
    const count = Math.max(2, Math.min(6, Math.floor(plotW / 120)));
    const span = view.tMax - view.tMin;
    return Array.from({ length: count }, (_, i) => {
      const t = view.tMin + (span * i) / (count - 1);
      return { t, label: formatTick(t, span) };
    });
  }, [view, plotW]);

  const nearestIndex = (clientX: number, rect: DOMRect): number | null => {
    if (!view || view.series.length === 0) return null;
    const t = view.tMin + ((clientX - rect.left - MARGIN.left) / plotW) * (view.tMax - view.tMin);
    let best = 0;
    for (let i = 1; i < view.series.length; i++) {
      if (Math.abs(view.series[i].t - t) < Math.abs(view.series[best].t - t)) best = i;
    }
    return best;
  };

  const onPointerMove = (event: PointerEvent<SVGRectElement>) => {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const index = nearestIndex(event.clientX, svg.getBoundingClientRect());
    setHover(index === null ? null : { kind: 'series', index });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!view || view.series.length === 0) return;
    const current = hover?.kind === 'series' ? hover.index : view.series.length - 1;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const delta = event.key === 'ArrowLeft' ? -1 : 1;
      setHover({ kind: 'series', index: Math.max(0, Math.min(view.series.length - 1, current + delta)) });
    } else if (event.key === 'Escape') {
      setHover(null);
    }
  };

  const hoveredPoint = hover?.kind === 'series' && view ? view.series[hover.index] : null;
  const hoveredCall = hover?.kind === 'call' && view ? view.calls.find((call) => call.id === hover.id) ?? null : null;
  const sidesPresent = new Set(calls.map((call) => call.side));

  let tooltip: { left: number; top: number; content: ReactNode } | null = null;
  if (hoveredPoint) {
    const px = x(hoveredPoint.t);
    const py = y(hoveredPoint.p);
    tooltip = {
      left: Math.max(0, Math.min(width - 184, px - 92)),
      top: py - 74 < 0 ? py + 14 : py - 74,
      content: (
        <>
          <div className="text-[11px] text-subtle">{formatFull(hoveredPoint.t)}</div>
          <div className="mt-1 flex items-center gap-2">
            <span className="h-0.5 w-3 rounded-full" style={{ background: COLOR_LINE }} />
            <span className="text-base font-semibold text-fg">{formatPct(hoveredPoint.p)}</span>
            <span className="text-xs text-muted">{label}</span>
          </div>
        </>
      ),
    };
  } else if (hoveredCall) {
    const px = x(hoveredCall.t);
    const py = y(hoveredCall.p);
    tooltip = {
      left: Math.max(0, Math.min(width - 184, px - 92)),
      top: py - 86 < 0 ? py + 16 : py - 86,
      content: (
        <>
          <div className="text-[11px] text-subtle">{formatFull(hoveredCall.t)}</div>
          <div className="mt-1 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: COLOR_SIDE[hoveredCall.side] }} />
            <span className="text-sm font-semibold uppercase text-fg">{hoveredCall.side}</span>
            <span className="text-xs text-muted">{Math.round(hoveredCall.confidence)}% confident</span>
          </div>
          <div className="mt-0.5 truncate text-xs text-muted">{hoveredCall.agent}</div>
        </>
      ),
    };
  }

  const tableRows = useMemo(() => {
    const rows = [
      ...history.points.map((point) => ({ t: point.t, what: label, p: point.p })),
      ...calls.map((call) => ({
        t: call.t,
        what: `${call.agent} · ${call.side.toUpperCase()} ${Math.round(call.confidence)}%`,
        p: call.p,
      })),
    ];
    return rows.sort((a, b) => b.t - a.t).slice(0, 200);
  }, [history.points, calls, label]);

  return (
    <div>
      {calls.length > 0 && (
        <ul className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted" aria-label="Legend">
          <li className="flex items-center gap-2">
            <span className="h-0.5 w-4 rounded-full" style={{ background: COLOR_LINE }} />
            {label}
          </li>
          {(['yes', 'no'] as const)
            .filter((side) => sidesPresent.has(side))
            .map((side) => (
              <li key={side} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR_SIDE[side] }} />
                Agent call: {side.toUpperCase()}
              </li>
            ))}
        </ul>
      )}

      <div
        ref={ref}
        className="relative outline-none focus-visible:ring-2 focus-visible:ring-brand/60 rounded-lg"
        style={{ height: totalHeight }}
        tabIndex={view ? 0 : -1}
        role="group"
        aria-label={`${label} over time. Use left and right arrow keys to read values.`}
        onKeyDown={onKeyDown}
        onBlur={() => setHover(null)}
      >
        {!view ? (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-line-strong text-sm text-subtle">
            No price history yet. It appears after the first trade or agent call.
          </div>
        ) : width > 0 ? (
          <svg width={width} height={totalHeight} className="block overflow-visible" aria-hidden="true">
            <defs>
              <linearGradient id={washId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={COLOR_LINE} stopOpacity="0.16" />
                <stop offset="1" stopColor={COLOR_LINE} stopOpacity="0" />
              </linearGradient>
            </defs>

            {Y_TICKS.map((tick) => (
              <g key={tick}>
                <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(tick)} y2={y(tick)} stroke={COLOR_GRID} strokeWidth="1" />
                <text x={MARGIN.left - 10} y={y(tick)} dy="0.32em" textAnchor="end" className="tabular fill-subtle text-[11px]">
                  {tick}%
                </text>
              </g>
            ))}

            {xTicks.map((tick, i) => (
              <text
                key={tick.t}
                x={x(tick.t)}
                y={MARGIN.top + plotHeight + 20}
                textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
                className="tabular fill-subtle text-[11px]"
              >
                {tick.label}
              </text>
            ))}

            {paths && (
              <>
                <path d={paths.area} fill={`url(#${washId})`} />
                <path d={paths.line} fill="none" stroke={COLOR_LINE} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              </>
            )}

            {hoveredPoint && (
              <line
                x1={x(hoveredPoint.t)}
                x2={x(hoveredPoint.t)}
                y1={MARGIN.top}
                y2={MARGIN.top + plotHeight}
                stroke="var(--color-line-strong)"
                strokeWidth="1"
              />
            )}

            {/* Pointer layer for the crosshair sits under the call markers so they stay hoverable. */}
            <rect
              x={MARGIN.left}
              y={MARGIN.top}
              width={plotW}
              height={plotHeight}
              fill="transparent"
              onPointerMove={onPointerMove}
              onPointerLeave={() => setHover(null)}
            />

            {view.calls.map((call) => (
              <g
                key={call.id}
                onPointerEnter={() => setHover({ kind: 'call', id: call.id })}
                onPointerLeave={() => setHover(null)}
              >
                <circle cx={x(call.t)} cy={y(call.p)} r="12" fill="transparent" />
                <circle
                  cx={x(call.t)}
                  cy={y(call.p)}
                  r={hover?.kind === 'call' && hover.id === call.id ? 6 : 4.5}
                  fill={COLOR_SIDE[call.side]}
                  stroke={COLOR_SURFACE}
                  strokeWidth="2"
                />
              </g>
            ))}

            {hoveredPoint && (
              <circle cx={x(hoveredPoint.t)} cy={y(hoveredPoint.p)} r="5" fill={COLOR_LINE} stroke={COLOR_SURFACE} strokeWidth="2" />
            )}

            {paths && (
              <g>
                <circle cx={paths.end.x} cy={paths.end.y} r="5" fill={COLOR_LINE} stroke={COLOR_SURFACE} strokeWidth="2" />
                <text x={paths.end.x + 10} y={paths.end.y} dy="0.32em" className="fill-fg text-xs font-semibold">
                  {formatPct(paths.end.p)}
                </text>
              </g>
            )}
          </svg>
        ) : null}

        {tooltip && (
          <div
            className="pointer-events-none absolute z-10 w-[184px] rounded-lg border border-line-strong bg-surface-2/95 px-3 py-2 shadow-xl shadow-black/40 backdrop-blur"
            style={{ left: tooltip.left, top: tooltip.top }}
            role="status"
          >
            {tooltip.content}
          </div>
        )}
      </div>

      {tableRows.length > 0 && (
        <details className="group mt-3 text-sm">
          <summary className="cursor-pointer select-none text-xs text-subtle transition hover:text-fg">
            View as table
          </summary>
          <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-line">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-surface-2 text-subtle">
                <tr>
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Series</th>
                  <th className="px-3 py-2 text-right font-medium">{outcomeLabel} probability</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-muted">
                {tableRows.map((row, index) => (
                  <tr key={`${row.t}-${index}`}>
                    <td className="tabular whitespace-nowrap px-3 py-1.5">{formatFull(row.t)}</td>
                    <td className="px-3 py-1.5">{row.what}</td>
                    <td className="tabular px-3 py-1.5 text-right text-fg">{formatPct(row.p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

export function RangeTabs({ value, onChange }: { value: ChartRange; onChange: (next: ChartRange) => void }) {
  return (
    <div role="group" aria-label="Chart time range" className="inline-flex gap-1 rounded-full border border-line bg-surface p-1">
      {CHART_RANGES.map((item) => (
        <button
          key={item}
          type="button"
          aria-pressed={value === item}
          onClick={() => onChange(item)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition ${
            value === item ? 'bg-surface-3 text-fg' : 'text-muted hover:text-fg'
          }`}
        >
          {item === 'ALL' ? 'All' : item}
        </button>
      ))}
    </div>
  );
}
