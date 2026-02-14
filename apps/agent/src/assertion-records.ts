import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_ASSERTION_RECORDS_FILE = resolve(
  __dirname,
  '../../../.clawlogic/assertions.json',
);

export interface AssertionRecord {
  marketId: `0x${string}`;
  assertionId: `0x${string}`;
  asserter: `0x${string}`;
  txHash: `0x${string}`;
  chainId: number;
  source: 'assert-demo' | 'orchestrator';
  createdAt: string;
}

function getAssertionRecordsFile(): string {
  return process.env.CLAWLOGIC_ASSERTION_RECORDS_FILE || DEFAULT_ASSERTION_RECORDS_FILE;
}

async function readAssertionRecords(filePath: string): Promise<AssertionRecord[]> {
  try {
    const text = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(text) as AssertionRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveAssertionRecord(record: AssertionRecord): Promise<void> {
  const filePath = getAssertionRecordsFile();
  const current = await readAssertionRecords(filePath);
  const withoutDuplicate = current.filter((item) => item.assertionId !== record.assertionId);
  const merged = [record, ...withoutDuplicate].slice(0, 500);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(merged, null, 2), 'utf-8');
}

export async function findLatestAssertionIdForMarket(
  marketId: `0x${string}`,
): Promise<`0x${string}` | null> {
  const filePath = getAssertionRecordsFile();
  const records = await readAssertionRecords(filePath);
  const match = records.find((item) => item.marketId.toLowerCase() === marketId.toLowerCase());
  return match?.assertionId ?? null;
}
