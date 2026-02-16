import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { extname, join, resolve } from 'node:path';

interface MarketProfileImageEntry {
  marketId: `0x${string}`;
  imagePath: string;
  providedBy: string;
  createdAt: string;
  source: 'agent-file' | 'hybrid-backfill';
}

const MANIFEST_FILE = 'market-profiles.json';
const IMAGE_DIR = 'market-profiles';

function resolveWebPublicDir(): string {
  return resolve(process.env.CLAWLOGIC_WEB_PUBLIC_DIR ?? 'apps/web/public');
}

function resolveManifestPath(): string {
  return join(resolveWebPublicDir(), MANIFEST_FILE);
}

function resolveImageDir(): string {
  return join(resolveWebPublicDir(), IMAGE_DIR);
}

async function ensureWebPublicDir(): Promise<void> {
  const dir = resolveWebPublicDir();
  await access(dir, constants.R_OK | constants.W_OK).catch(() => {
    throw new Error(
      `Unable to access web public directory at "${dir}". ` +
        'Run from repo root or set CLAWLOGIC_WEB_PUBLIC_DIR.',
    );
  });
}

async function readManifest(): Promise<MarketProfileImageEntry[]> {
  try {
    const raw = await readFile(resolveManifestPath(), 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MarketProfileImageEntry[]) : [];
  } catch {
    return [];
  }
}

async function writeManifest(entries: MarketProfileImageEntry[]): Promise<void> {
  await writeFile(resolveManifestPath(), `${JSON.stringify(entries, null, 2)}\n`, 'utf-8');
}

function normalizeImageExtension(path: string): string {
  const ext = extname(path).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.webp', '.svg'].includes(ext)) {
    throw new Error('Unsupported market image extension. Use png, jpg, jpeg, webp, or svg.');
  }
  return ext.replace('.', '');
}

export async function persistMarketImageFromAgent(input: {
  marketId: `0x${string}`;
  sourceFilePath: string;
  providedBy: string;
}): Promise<{ imagePath: string }> {
  await ensureWebPublicDir();
  await mkdir(resolveImageDir(), { recursive: true });

  const ext = normalizeImageExtension(input.sourceFilePath);
  const fileName = `${input.marketId}.${ext}`;
  const dest = join(resolveImageDir(), fileName);
  await copyFile(resolve(input.sourceFilePath), dest);

  const entry: MarketProfileImageEntry = {
    marketId: input.marketId,
    imagePath: `/${IMAGE_DIR}/${fileName}`,
    providedBy: input.providedBy,
    createdAt: new Date().toISOString(),
    source: 'agent-file',
  };

  const manifest = await readManifest();
  const next = [
    entry,
    ...manifest.filter((item) => item.marketId.toLowerCase() !== entry.marketId.toLowerCase()),
  ];
  await writeManifest(next);
  return { imagePath: entry.imagePath };
}

function pickColor(seed: string, index: number): string {
  const palette = ['#2f66d6', '#5f7dff', '#4cb4ff', '#f0ae56', '#ec7b58', '#90d7cb'];
  const offset = Number.parseInt(seed.slice(index * 2, index * 2 + 2), 16) || 0;
  return palette[offset % palette.length];
}

function escapeXml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildMarketSvg(marketId: `0x${string}`, description: string): string {
  const seed = marketId.slice(2).padEnd(64, '0');
  const c1 = pickColor(seed, 0);
  const c2 = pickColor(seed, 4);
  const c3 = pickColor(seed, 8);
  const c4 = pickColor(seed, 12);
  const words = description.trim().split(/\s+/).slice(0, 5).join(' ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800" role="img" aria-label="Market profile image">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c1}" />
      <stop offset="55%" stop-color="${c2}" />
      <stop offset="100%" stop-color="${c3}" />
    </linearGradient>
  </defs>
  <rect width="800" height="800" fill="url(#bg)" />
  <circle cx="640" cy="160" r="190" fill="${c4}" fill-opacity="0.24"/>
  <circle cx="180" cy="690" r="220" fill="#FFFFFF" fill-opacity="0.1"/>
  <rect x="72" y="500" width="656" height="200" rx="24" fill="#081020" fill-opacity="0.44"/>
  <text x="104" y="575" fill="#FFFFFF" font-size="38" font-family="Inter, Arial, sans-serif" font-weight="700">${escapeXml(words || 'CLAWLOGIC Market')}</text>
  <text x="104" y="632" fill="#DDE8FF" font-size="20" font-family="Inter, Arial, sans-serif">${marketId.slice(0, 14)}...${marketId.slice(-10)}</text>
</svg>`;
}

export async function generateMarketImageFromAgent(input: {
  marketId: `0x${string}`;
  description: string;
  providedBy: string;
}): Promise<{ imagePath: string }> {
  await ensureWebPublicDir();
  await mkdir(resolveImageDir(), { recursive: true });

  const fileName = `${input.marketId}.svg`;
  const dest = join(resolveImageDir(), fileName);
  const svg = buildMarketSvg(input.marketId, input.description);
  await writeFile(dest, svg, 'utf-8');

  const entry: MarketProfileImageEntry = {
    marketId: input.marketId,
    imagePath: `/${IMAGE_DIR}/${fileName}`,
    providedBy: input.providedBy,
    createdAt: new Date().toISOString(),
    source: 'hybrid-backfill',
  };

  const manifest = await readManifest();
  const next = [
    entry,
    ...manifest.filter((item) => item.marketId.toLowerCase() !== entry.marketId.toLowerCase()),
  ];
  await writeManifest(next);
  return { imagePath: entry.imagePath };
}
