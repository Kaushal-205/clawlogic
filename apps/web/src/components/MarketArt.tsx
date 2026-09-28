import { useId, type ReactNode } from 'react';

/**
 * Generated cover art for a market. The category (from keywords in the question) picks
 * the icon and palette; the marketId seeds the composition so every market looks distinct.
 */

interface Category {
  key: string;
  label: string;
  match: RegExp;
  colors: [string, string];
  icon: ReactNode;
}

const W = 'white';

const CATEGORIES: Category[] = [
  {
    key: 'ethereum',
    label: 'Ethereum',
    match: /\b(eth|ether|ethereum|vitalik)\b/i,
    colors: ['#2a2380', '#7c6cff'],
    icon: (
      <>
        <path d="M50 4 L80 52 L50 69 L20 52 Z" fill={W} fillOpacity={0.92} />
        <path d="M50 4 L50 69 L20 52 Z" fill={W} fillOpacity={0.62} />
        <path d="M50 75 L80 58 L50 97 L20 58 Z" fill={W} fillOpacity={0.92} />
        <path d="M50 75 L50 97 L20 58 Z" fill={W} fillOpacity={0.62} />
      </>
    ),
  },
  {
    key: 'bitcoin',
    label: 'Bitcoin',
    match: /\b(btc|bitcoin|satoshi|sats)\b/i,
    colors: ['#6b3203', '#f7931a'],
    icon: (
      <>
        <circle cx="50" cy="50" r="44" fill="none" stroke={W} strokeWidth="6" strokeOpacity={0.9} />
        <path
          d="M38 26 H56 C66 26 70 32 70 38 C70 44 66 48 60 49 C68 50 72 55 72 62 C72 69 66 74 57 74 H38 Z M46 33 V46 H55 C60 46 62 43 62 39.5 C62 36 60 33 55 33 Z M46 53 V67 H56 C61 67 64 64 64 60 C64 56 61 53 56 53 Z"
          fill={W}
          fillOpacity={0.92}
          fillRule="evenodd"
        />
        <rect x="42" y="18" width="5" height="10" rx="1.5" fill={W} fillOpacity={0.92} />
        <rect x="53" y="18" width="5" height="10" rx="1.5" fill={W} fillOpacity={0.92} />
        <rect x="42" y="72" width="5" height="10" rx="1.5" fill={W} fillOpacity={0.92} />
        <rect x="53" y="72" width="5" height="10" rx="1.5" fill={W} fillOpacity={0.92} />
      </>
    ),
  },
  {
    key: 'solana',
    label: 'Solana',
    match: /\b(sol|solana)\b/i,
    colors: ['#3b0f6b', '#14f1b2'],
    icon: (
      <g fill={W} fillOpacity={0.9}>
        <path d="M28 20 H88 L74 34 H14 Z" />
        <path d="M14 43 H74 L88 57 H28 Z" />
        <path d="M28 66 H88 L74 80 H14 Z" />
      </g>
    ),
  },
  {
    key: 'l2',
    label: 'L2 & gas',
    match: /\b(arbitrum|arb|optimism|rollups?|l2|gas|gwei)\b/i,
    colors: ['#0a3160', '#2ea7f7'],
    icon: (
      <g fill="none" stroke={W} strokeLinecap="round" strokeOpacity={0.92}>
        <path d="M12 72 A38 38 0 1 1 88 72" strokeWidth="7" />
        <path d="M22 70 L28 66 M18 50 L25 50 M28 28 L33 33 M50 18 L50 25 M72 28 L67 33 M82 50 L75 50" strokeWidth="4" />
        <path d="M50 66 L70 36" strokeWidth="6" />
        <circle cx="50" cy="66" r="6" fill={W} stroke="none" />
      </g>
    ),
  },
  {
    key: 'oracle',
    label: 'Oracle',
    match: /\b(uma|oracle|oov3|assert\w*|resolve\w*|dispute\w*|liveness)\b/i,
    colors: ['#053f3b', '#1dd3bd'],
    icon: (
      <>
        <path d="M6 50 Q50 6 94 50 Q50 94 6 50 Z" fill="none" stroke={W} strokeWidth="6" strokeOpacity={0.9} strokeLinejoin="round" />
        <circle cx="50" cy="50" r="17" fill={W} fillOpacity={0.92} />
        <circle cx="50" cy="50" r="7" fill="#053f3b" />
      </>
    ),
  },
  {
    key: 'ai',
    label: 'AI',
    match: /\b(ai|agents?|llm|gpt|claude|gemini|openai|anthropic|model)\b/i,
    colors: ['#57124c', '#f25fc6'],
    icon: (
      <g fill={W} fillOpacity={0.92}>
        <path d="M46 10 C50 38 58 46 86 50 C58 54 50 62 46 90 C42 62 34 54 6 50 C34 46 42 38 46 10 Z" />
        <path d="M80 8 C81.5 17 84 19.5 93 21 C84 22.5 81.5 25 80 34 C78.5 25 76 22.5 67 21 C76 19.5 78.5 17 80 8 Z" />
      </g>
    ),
  },
  {
    key: 'politics',
    label: 'Politics',
    match: /\b(election|president\w*|vote|voting|senate|congress|parliament|poll|minister|governor)\b/i,
    colors: ['#3b0b1f', '#e5485f'],
    icon: (
      <g fill={W} fillOpacity={0.9}>
        <path d="M8 34 L50 10 L92 34 Z" />
        <rect x="16" y="40" width="9" height="36" rx="2" />
        <rect x="35" y="40" width="9" height="36" rx="2" />
        <rect x="56" y="40" width="9" height="36" rx="2" />
        <rect x="75" y="40" width="9" height="36" rx="2" />
        <rect x="8" y="80" width="84" height="9" rx="2" />
      </g>
    ),
  },
  {
    key: 'sports',
    label: 'Sports',
    match: /\b(wins?|match|game|nba|nfl|fifa|world cup|championship|league|tournament|playoffs?|super bowl|nhl|mlb|ufc|f1|grand prix|olympic\w*)\b/i,
    colors: ['#553104', '#f5b544'],
    icon: (
      <g fill={W} fillOpacity={0.92}>
        <path d="M28 10 H72 V38 C72 55 62 63 50 63 C38 63 28 55 28 38 Z" />
        <path d="M28 18 H14 C14 34 20 42 30 45 L31 39 C24 36 21 31 20 24 H28 Z" />
        <path d="M72 18 H86 C86 34 80 42 70 45 L69 39 C76 36 79 31 80 24 H72 Z" />
        <rect x="45" y="62" width="10" height="14" />
        <rect x="32" y="76" width="36" height="10" rx="2" />
      </g>
    ),
  },
  {
    key: 'weather',
    label: 'Weather',
    match: /\b(weather|temperature|rain\w*|snow\w*|heat|storm|hurricane|celsius|fahrenheit)\b/i,
    colors: ['#0b3552', '#7dd3fc'],
    icon: (
      <g stroke={W} strokeOpacity={0.92} strokeLinecap="round" strokeWidth="6">
        <circle cx="50" cy="50" r="18" fill={W} fillOpacity={0.92} stroke="none" />
        <path d="M50 8 V20 M50 80 V92 M8 50 H20 M80 50 H92 M20 20 L28 28 M72 72 L80 80 M80 20 L72 28 M28 72 L20 80" />
      </g>
    ),
  },
  {
    key: 'macro',
    label: 'Markets',
    match: /\b(fed|rates?|inflation|cpi|gdp|s&p|nasdaq|dow|stocks?|shares|recession|price|market cap)\b|\$\s?\d/i,
    colors: ['#0b3a28', '#2fd88a'],
    icon: (
      <g fill={W} fillOpacity={0.92}>
        <rect x="14" y="44" width="16" height="30" rx="3" />
        <rect x="21" y="32" width="2.5" height="54" rx="1.25" />
        <rect x="42" y="26" width="16" height="36" rx="3" />
        <rect x="49" y="14" width="2.5" height="58" rx="1.25" />
        <rect x="70" y="36" width="16" height="26" rx="3" />
        <rect x="77" y="24" width="2.5" height="48" rx="1.25" />
      </g>
    ),
  },
];

const DEFAULT_CATEGORY: Category = {
  key: 'general',
  label: 'General',
  match: /$^/,
  colors: ['#0d2b18', '#39e66a'],
  icon: (
    <g fill="none" stroke={W} strokeOpacity={0.92} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 78 L34 50 L54 62 L90 22" />
      <path d="M68 22 H90 V44" />
    </g>
  ),
};

/** Specific subjects (assets, protocols) beat broad topics; among them the first mentioned wins. */
const SUBJECT_KEYS = new Set(['ethereum', 'bitcoin', 'solana', 'l2', 'oracle', 'ai']);

function categorize(description: string): Category {
  let best: { category: Category; index: number } | null = null;
  for (const category of CATEGORIES) {
    if (!SUBJECT_KEYS.has(category.key)) continue;
    const index = description.search(category.match);
    if (index !== -1 && (!best || index < best.index)) best = { category, index };
  }
  if (best) return best.category;
  return CATEGORIES.find((item) => !SUBJECT_KEYS.has(item.key) && item.match.test(description)) ?? DEFAULT_CATEGORY;
}

export function getMarketCategory(description: string): { key: string; label: string } {
  const category = categorize(description);
  return { key: category.key, label: category.label };
}

function seeded(seed: string): () => number {
  let h = 2166136261;
  for (const char of seed) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

export default function MarketArt({
  marketId,
  description,
  className = '',
  variant = 'banner',
}: {
  marketId: string;
  description: string;
  className?: string;
  /** `square` centres a larger icon so it survives the square crop of thumbnails. */
  variant?: 'banner' | 'square';
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const category = categorize(description);
  const [deep, bright] = category.colors;
  const rand = seeded(marketId);

  const blobA = { x: 60 + rand() * 120, y: 20 + rand() * 80, r: 150 + rand() * 60 };
  const blobB = { x: 260 + rand() * 120, y: 120 + rand() * 90, r: 120 + rand() * 60 };
  const angle = Math.round(rand() * 360);
  const tilt = Math.round((rand() - 0.5) * 22);
  const square = variant === 'square';
  const iconSize = square ? 140 : 132;
  // A square crop of the 400x225 canvas keeps x 87.5-312.5, so thumbnails centre the icon.
  const iconX = (square ? 200 : 285 + (rand() - 0.5) * 30) - iconSize / 2;
  const iconY = (square ? 112.5 : 112 + (rand() - 0.5) * 16) - iconSize / 2;

  return (
    <svg
      viewBox="0 0 400 225"
      preserveAspectRatio="xMidYMid slice"
      className={`block h-full w-full ${className}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`bg${uid}`} gradientTransform={`rotate(${angle} 0.5 0.5)`}>
          <stop offset="0" stopColor={deep} />
          <stop offset="1" stopColor="#07080a" />
        </linearGradient>
        <radialGradient id={`ba${uid}`}>
          <stop offset="0" stopColor={bright} stopOpacity="0.75" />
          <stop offset="1" stopColor={bright} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`bb${uid}`}>
          <stop offset="0" stopColor={bright} stopOpacity="0.4" />
          <stop offset="1" stopColor={bright} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`halo${uid}`}>
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <pattern id={`grid${uid}`} width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0 H0 V20" fill="none" stroke="#fff" strokeOpacity="0.07" strokeWidth="1" />
        </pattern>
      </defs>

      <rect width="400" height="225" fill={`url(#bg${uid})`} />
      <circle cx={blobA.x} cy={blobA.y} r={blobA.r} fill={`url(#ba${uid})`} />
      <circle cx={blobB.x} cy={blobB.y} r={blobB.r} fill={`url(#bb${uid})`} />
      <rect width="400" height="225" fill={`url(#grid${uid})`} />

      <circle cx={iconX + iconSize / 2} cy={iconY + iconSize / 2} r={iconSize * 0.85} fill={`url(#halo${uid})`} />
      <g
        transform={`translate(${iconX} ${iconY}) rotate(${tilt} ${iconSize / 2} ${iconSize / 2}) scale(${iconSize / 100})`}
      >
        {category.icon}
      </g>
    </svg>
  );
}
