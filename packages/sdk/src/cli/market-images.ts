import { mkdir, readFile, writeFile, copyFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { extname, resolve, join } from 'node:path';

export type MarketImageSource = 'agent-file' | 'hybrid-backfill';

export interface MarketProfileImageEntry {
  marketId: `0x${string}`;
  imagePath: string;
  providedBy: string;
  createdAt: string;
  source: MarketImageSource;
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
        'Run this command from the repository root or set CLAWLOGIC_WEB_PUBLIC_DIR.',
    );
  });
}

async function readManifest(): Promise<MarketProfileImageEntry[]> {
  const path = resolveManifestPath();
  try {
    const raw = await readFile(path, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is MarketProfileImageEntry => {
      return (
        item &&
        typeof item === 'object' &&
        typeof item.marketId === 'string' &&
        typeof item.imagePath === 'string' &&
        typeof item.providedBy === 'string' &&
        typeof item.createdAt === 'string' &&
        (item.source === 'agent-file' || item.source === 'hybrid-backfill')
      );
    });
  } catch {
    return [];
  }
}

async function writeManifest(entries: MarketProfileImageEntry[]): Promise<void> {
  const path = resolveManifestPath();
  await mkdir(resolveWebPublicDir(), { recursive: true });
  await writeFile(path, `${JSON.stringify(entries, null, 2)}\n`, 'utf-8');
}

function normalizeImageExtension(path: string): string {
  const ext = extname(path).toLowerCase();
  if (!ext) {
    throw new Error('Market image file must include an extension.');
  }
  if (!['.png', '.jpg', '.jpeg', '.webp', '.svg'].includes(ext)) {
    throw new Error('Unsupported market image extension. Use png, jpg, jpeg, webp, or svg.');
  }
  return ext.replace('.', '');
}

function upsertManifestEntry(
  entries: MarketProfileImageEntry[],
  next: MarketProfileImageEntry,
): MarketProfileImageEntry[] {
  const withoutCurrent = entries.filter(
    (entry) => entry.marketId.toLowerCase() !== next.marketId.toLowerCase(),
  );
  return [next, ...withoutCurrent].sort((a, b) => a.marketId.localeCompare(b.marketId));
}

export async function persistAgentProvidedMarketImage(input: {
  marketId: `0x${string}`;
  sourceFilePath: string;
  providedBy: string;
}): Promise<MarketProfileImageEntry> {
  await ensureWebPublicDir();
  const ext = normalizeImageExtension(input.sourceFilePath);
  const imageDir = resolveImageDir();
  await mkdir(imageDir, { recursive: true });

  const fileName = `${input.marketId}.${ext}`;
  const destFsPath = join(imageDir, fileName);
  await copyFile(resolve(input.sourceFilePath), destFsPath);

  const nextEntry: MarketProfileImageEntry = {
    marketId: input.marketId,
    imagePath: `/${IMAGE_DIR}/${fileName}`,
    providedBy: input.providedBy,
    createdAt: new Date().toISOString(),
    source: 'agent-file',
  };

  const manifest = await readManifest();
  const nextManifest = upsertManifestEntry(manifest, nextEntry);
  await writeManifest(nextManifest);
  return nextEntry;
}

function pickColor(seed: string, index: number): string {
  const palette = [
    '#3E63DD',
    '#6B7DFF',
    '#46B7FF',
    '#F4B45F',
    '#F07A56',
    '#8DD7C8',
  ];
  const offset = Number.parseInt(seed.slice(index * 2, index * 2 + 2), 16) || 0;
  return palette[offset % palette.length];
}

export function buildDeterministicMarketImageSvg(
  marketId: `0x${string}`,
  description: string,
): string {
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

function escapeXml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function tryGenerateAiImagePng(prompt: string): Promise<Buffer | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const model = process.env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-1';
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      prompt,
      size: '1024x1024',
      response_format: 'b64_json',
    }),
  });
  if (!response.ok) {
    return null;
  }

  const json = (await response.json()) as {
    data?: Array<{ b64_json?: string }>;
  };
  const encoded = json.data?.[0]?.b64_json;
  if (!encoded) {
    return null;
  }
  return Buffer.from(encoded, 'base64');
}

export async function generateAndPersistBackfillMarketImage(input: {
  marketId: `0x${string}`;
  description: string;
  providedBy?: string;
  force?: boolean;
}): Promise<MarketProfileImageEntry> {
  await ensureWebPublicDir();
  const manifest = await readManifest();
  const existing = manifest.find(
    (entry) => entry.marketId.toLowerCase() === input.marketId.toLowerCase(),
  );
  if (existing && !input.force) {
    return existing;
  }

  const imageDir = resolveImageDir();
  await mkdir(imageDir, { recursive: true });

  const aiPrompt =
    `Create a polished, abstract market profile image for this prediction event: "${input.description}". ` +
    'No text, no logos, no people, high contrast, geometric visual language.';
  const aiPng = await tryGenerateAiImagePng(aiPrompt).catch(() => null);

  let fileName: string;
  if (aiPng) {
    fileName = `${input.marketId}.png`;
    await writeFile(join(imageDir, fileName), aiPng);
  } else {
    fileName = `${input.marketId}.svg`;
    const svg = buildDeterministicMarketImageSvg(input.marketId, input.description);
    await writeFile(join(imageDir, fileName), svg, 'utf-8');
  }

  const nextEntry: MarketProfileImageEntry = {
    marketId: input.marketId,
    imagePath: `/${IMAGE_DIR}/${fileName}`,
    providedBy: input.providedBy ?? 'system-backfill',
    createdAt: new Date().toISOString(),
    source: 'hybrid-backfill',
  };
  const nextManifest = upsertManifestEntry(manifest, nextEntry);
  await writeManifest(nextManifest);
  return nextEntry;
}

export async function getMarketImageManifest(): Promise<MarketProfileImageEntry[]> {
  await ensureWebPublicDir();
  return readManifest();
}
