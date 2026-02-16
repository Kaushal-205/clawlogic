export interface MarketProfileImageEntry {
  marketId: `0x${string}`;
  imagePath: string;
  providedBy: string;
  createdAt: string;
  source: 'agent-file' | 'hybrid-backfill';
}

let manifestCache: MarketProfileImageEntry[] | null = null;

export async function loadMarketImageManifest(): Promise<MarketProfileImageEntry[]> {
  if (manifestCache) {
    return manifestCache;
  }
  try {
    const response = await fetch('/market-profiles.json', { cache: 'no-store' });
    if (!response.ok) {
      manifestCache = [];
      return manifestCache;
    }
    const data = await response.json();
    if (!Array.isArray(data)) {
      manifestCache = [];
      return manifestCache;
    }
    manifestCache = data as MarketProfileImageEntry[];
    return manifestCache;
  } catch {
    manifestCache = [];
    return manifestCache;
  }
}

export function getMarketImageMap(
  entries: MarketProfileImageEntry[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const entry of entries) {
    if (!entry.marketId || !entry.imagePath) {
      continue;
    }
    map[entry.marketId.toLowerCase()] = entry.imagePath;
  }
  return map;
}

export function fallbackMarketImageDataUri(marketId: `0x${string}`, description?: string): string {
  const seed = marketId.slice(2).padEnd(64, '0');
  const h1 = Number.parseInt(seed.slice(0, 2), 16) % 360;
  const h2 = Number.parseInt(seed.slice(6, 8), 16) % 360;
  const h3 = Number.parseInt(seed.slice(12, 14), 16) % 360;
  const title = (description ?? 'Market Profile').slice(0, 32).replace(/&/g, '&amp;');
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${h1} 74% 56%)" />
      <stop offset="50%" stop-color="hsl(${h2} 72% 56%)" />
      <stop offset="100%" stop-color="hsl(${h3} 70% 54%)" />
    </linearGradient>
  </defs>
  <rect width="800" height="800" fill="url(#g)" />
  <circle cx="640" cy="130" r="190" fill="#fff" fill-opacity="0.12"/>
  <circle cx="180" cy="700" r="220" fill="#fff" fill-opacity="0.08"/>
  <rect x="70" y="530" width="660" height="180" rx="18" fill="#091123" fill-opacity="0.45" />
  <text x="105" y="592" fill="#ffffff" font-size="38" font-family="Inter,Arial,sans-serif" font-weight="700">${title}</text>
  <text x="105" y="646" fill="#d9e6ff" font-size="20" font-family="Inter,Arial,sans-serif">${marketId.slice(0, 14)}...${marketId.slice(-10)}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
