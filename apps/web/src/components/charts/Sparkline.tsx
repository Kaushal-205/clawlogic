'use client';

import { useId, useMemo } from 'react';
import type { MarketHistory } from '@/lib/price-history';
import { useElementWidth } from './useElementWidth';

const COLOR_LINE = 'var(--color-yes-mark)';
const PAD = 5;

/** Compact trend line for market tiles. Same 0-100% scale as the full chart. */
export default function Sparkline({ history, height = 48 }: { history: MarketHistory; height?: number }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const washId = `spark${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const stepped = history.source !== 'sample';

  const shape = useMemo(() => {
    const points = history.points;
    if (points.length === 0 || width <= 0) return null;
    const now = Date.now();
    const tMin = points[0].t;
    const tMax = stepped ? Math.max(now, points[points.length - 1].t) : points[points.length - 1].t;
    const span = tMax - tMin || 1;
    const x = (t: number) => PAD + ((t - tMin) / span) * (width - PAD * 2);
    const y = (p: number) => PAD + (1 - p / 100) * (height - PAD * 2);

    const [head, ...rest] = points;
    let line = `M${x(head.t)},${y(head.p)}`;
    for (const point of rest) line += stepped ? `H${x(point.t)}V${y(point.p)}` : `L${x(point.t)},${y(point.p)}`;
    const endX = points.length === 1 ? width - PAD : stepped ? x(tMax) : x(points[points.length - 1].t);
    if (stepped || points.length === 1) line += `H${endX}`;
    const last = points[points.length - 1];
    return {
      line,
      area: `${line}V${height - PAD}H${x(head.t)}Z`,
      end: { x: endX, y: y(last.p) },
      first: head.p,
      last: last.p,
    };
  }, [history.points, width, height, stepped]);

  const summary = shape
    ? `Trend from ${Math.round(shape.first)}% to ${Math.round(shape.last)}%`
    : 'No price history yet';

  return (
    <div ref={ref} style={{ height }} className="w-full" role="img" aria-label={summary} title={summary}>
      {shape ? (
        <svg width={width} height={height} className="block overflow-visible" aria-hidden="true">
          <defs>
            <linearGradient id={washId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={COLOR_LINE} stopOpacity="0.18" />
              <stop offset="1" stopColor={COLOR_LINE} stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1={PAD} x2={width - PAD} y1={height / 2} y2={height / 2} stroke="var(--color-grid)" strokeWidth="1" />
          <path d={shape.area} fill={`url(#${washId})`} />
          <path d={shape.line} fill="none" stroke={COLOR_LINE} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={shape.end.x} cy={shape.end.y} r="4" fill={COLOR_LINE} stroke="var(--color-surface)" strokeWidth="2" />
        </svg>
      ) : (
        <div className="flex h-full items-center">
          <div className="h-px w-full bg-grid" />
        </div>
      )}
    </div>
  );
}
