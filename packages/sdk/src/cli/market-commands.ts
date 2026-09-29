import { formatEther, parseEther } from 'viem';
import type { ClawlogicClient } from '../client.js';
import type { MarketDetails, MarketInfo } from '../types.js';
import { computeMarketKey, findSimilarMarkets } from '../market-dedupe.js';
import { createRuntime } from './runtime.js';
import { getBoolFlag, getFlag } from './args.js';
import { ensure, outputSuccess } from './output.js';

type Flags = Record<string, string | boolean>;
type Hex = `0x${string}`;

const ZERO_BYTES32 = `0x${'0'.repeat(64)}` as const;
const ZERO_ADDRESS = `0x${'0'.repeat(40)}` as const;
const DEFAULT_SLIPPAGE_BPS = 100n; // 1%

// ─────────────────────────────────────────────────────────────────────────────
// Input helpers
// ─────────────────────────────────────────────────────────────────────────────

export function parseEthInput(value: string | undefined): bigint {
  ensure(value, 'Missing ETH amount.');
  return parseEther(value);
}

export function parseWeiInput(value: string | undefined): bigint {
  ensure(value !== undefined, 'Missing wei value.');
  if (value.includes('.')) {
    return parseEther(value);
  }
  return BigInt(value);
}

/** Unix seconds or an ISO date ("2026-12-31", "2026-12-31T23:59:00Z"). */
export function parseCloseTime(value: string | undefined, flag = '--close-time'): bigint {
  if (!value || value === '0') return 0n;
  if (/^\d+$/.test(value)) return BigInt(value);
  const ms = Date.parse(value);
  ensure(Number.isFinite(ms), `Invalid ${flag} "${value}". Use unix seconds or an ISO date.`);
  return BigInt(Math.floor(ms / 1000));
}

/** Mirrors PredictionMarketHook.MAX_MARKET_DURATION. */
const MAX_MARKET_DURATION = 365n * 24n * 60n * 60n;

function parseSide(value: string | undefined): boolean {
  const side = (value ?? '').toLowerCase();
  ensure(side === 'yes' || side === 'no', 'Invalid side. Use `--side yes` or `--side no`.');
  return side === 'yes';
}

function slippageBps(flags: Flags): bigint {
  const raw = getFlag(flags, 'max-slippage-bps');
  if (raw === undefined) return DEFAULT_SLIPPAGE_BPS;
  const bps = BigInt(raw);
  ensure(bps >= 0n && bps <= 10_000n, 'max-slippage-bps must be between 0 and 10000.');
  return bps;
}

function withSlippage(amount: bigint, bps: bigint): bigint {
  return (amount * (10_000n - bps)) / 10_000n;
}

function marketIdFrom(flags: Flags, positional: string[]): Hex {
  const marketId = (getFlag(flags, 'market-id') ?? positional[0]) as Hex | undefined;
  ensure(marketId, 'Missing market id. Use `--market-id <0x...>`.');
  return marketId;
}

/** Latest block timestamp -- deadlines are enforced on-chain, so compare against chain time. */
async function chainNow(client: ClawlogicClient): Promise<bigint> {
  return (await client.publicClient.getBlock()).timestamp;
}

function isoOrNull(seconds: bigint): string | null {
  return seconds === 0n ? null : new Date(Number(seconds) * 1000).toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Market status
// ─────────────────────────────────────────────────────────────────────────────

type MarketStatus = 'OPEN' | 'NO_LIQUIDITY' | 'CLOSED' | 'AWAITING_ASSERTION' | 'ASSERTION_PENDING' | 'RESOLVED';

function marketStatus(
  market: MarketInfo,
  info: MarketDetails,
  reserves: { reserve1: bigint },
  now: bigint,
): MarketStatus {
  if (market.resolved) return 'RESOLVED';
  if (market.assertedOutcomeId !== ZERO_BYTES32) return 'ASSERTION_PENDING';
  if (now >= info.resolutionTime) return 'AWAITING_ASSERTION';
  if (now >= info.closeTime) return 'CLOSED';
  if (reserves.reserve1 === 0n) return 'NO_LIQUIDITY';
  return 'OPEN';
}

async function loadMarket(client: ClawlogicClient, marketId: Hex) {
  const [market, info, probability, reserves, now] = await Promise.all([
    client.getMarket(marketId),
    client.getMarketInfo(marketId),
    client.getMarketProbability(marketId),
    client.getMarketReserves(marketId),
    chainNow(client),
  ]);
  ensure(market.outcome1Token !== ZERO_ADDRESS, `Market ${marketId} not found.`);
  return { market, info, probability, reserves, status: marketStatus(market, info, reserves, now) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Commands
// ─────────────────────────────────────────────────────────────────────────────

/** List markets (newest first) so agents can find something to trade before creating. */
export async function commandMarkets(flags: Flags): Promise<void> {
  const includeResolved = getBoolFlag(flags, 'all');
  const limit = Number(getFlag(flags, 'limit') ?? '50');
  const { client } = await createRuntime({ requireWallet: false });

  const ids = (await client.getMarketIds()).slice().reverse();
  const rows = [];
  for (const marketId of ids) {
    if (rows.length >= limit) break;
    const { market, info, probability, reserves, status } = await loadMarket(client, marketId);
    if (status === 'RESOLVED' && !includeResolved) continue;
    rows.push({
      marketId,
      description: market.description,
      outcomes: [market.outcome1, market.outcome2],
      status,
      probability: { [market.outcome1]: probability.outcome1Probability, [market.outcome2]: probability.outcome2Probability },
      collateralEth: formatEther(market.totalCollateral),
      liquidityEth: formatEther(reserves.reserve1 < reserves.reserve2 ? reserves.reserve1 : reserves.reserve2),
      closeTime: isoOrNull(info.closeTime),
      resolutionTime: isoOrNull(info.resolutionTime),
      creator: info.creator,
    });
  }

  outputSuccess({ command: 'markets', count: rows.length, markets: rows });
}

export async function commandCreateMarket(flags: Flags, positional: string[]): Promise<void> {
  const outcome1 = getFlag(flags, 'outcome1') ?? positional[0];
  const outcome2 = getFlag(flags, 'outcome2') ?? positional[1];
  const description = getFlag(flags, 'description') ?? positional.slice(2).join(' ');
  ensure(outcome1, 'Missing outcome1. Use `--outcome1 yes`.');
  ensure(outcome2, 'Missing outcome2. Use `--outcome2 no`.');
  ensure(description, 'Missing description. Use `--description "..."`.');
  computeMarketKey(description, outcome1, outcome2); // same validation as the contract

  const reward = parseWeiInput(getFlag(flags, 'reward-wei') ?? '0');
  const bond = parseWeiInput(getFlag(flags, 'bond-wei') ?? '0');
  const initialLiquidity = parseEthInput(getFlag(flags, 'initial-liquidity-eth') ?? '0');
  const closeTime = parseCloseTime(getFlag(flags, 'close-time'));
  const resolutionTime = parseCloseTime(getFlag(flags, 'resolution-time'), '--resolution-time');
  ensure(
    resolutionTime > 0n,
    'Missing --resolution-time: when the answer will be known (unix seconds or ISO date). ' +
      'Nobody can assert the outcome before then.',
  );
  const force = getBoolFlag(flags, 'force');
  const threshold = Number(getFlag(flags, 'similarity-threshold') ?? '0.7');

  const runtime = await createRuntime({ requireWallet: true, autoCreateWallet: true });
  const { client } = runtime;
  const now = await chainNow(client);
  ensure(resolutionTime > now, '--resolution-time must be in the future.');
  ensure(resolutionTime <= now + MAX_MARKET_DURATION, '--resolution-time must be within 365 days.');
  ensure(
    closeTime === 0n || (closeTime > now && closeTime <= resolutionTime),
    '--close-time must be in the future and not after --resolution-time.',
  );

  // 1. Exact duplicate (the contract would revert anyway -- fail before paying gas).
  const existing = await client.findActiveMarket(description, outcome1, outcome2);
  if (existing) {
    throw new Error(
      `Duplicate: open market ${existing} already asks this question. ` +
        `Trade it instead: clawlogic-agent buy --market-id ${existing} --side yes --eth 0.01`,
    );
  }

  // 2. Reworded duplicates among open markets.
  if (!force) {
    const open = (await client.getAllMarkets()).filter((m) => !m.resolved);
    const similar = findSimilarMarkets(open, description, threshold);
    if (similar.length > 0) {
      throw new Error(
        `Similar open market(s) exist: ${similar
          .slice(0, 3)
          .map((m) => `${m.marketId} "${m.description}" (${m.similarity.toFixed(2)})`)
          .join('; ')}. Trade one of them, or pass --force if yours is a genuinely different question.`,
      );
    }
  }

  const fees = await client.getFeeConfig();
  ensure(!fees.paused, 'Protocol is paused: market creation is temporarily disabled.');
  ensure(
    bond <= fees.maxRequiredBond,
    `--bond-wei exceeds the protocol cap of ${fees.maxRequiredBond} (0 = use the UMA minimum bond).`,
  );
  const value = fees.marketCreationFee + initialLiquidity;

  const txHash = await client.createMarket({
    outcome1,
    outcome2,
    description,
    reward,
    requiredBond: bond,
    closeTime,
    resolutionTime,
    value,
  });
  const marketId = await client.findActiveMarket(description, outcome1, outcome2);

  outputSuccess({
    command: 'create-market',
    txHash,
    marketId,
    outcome1,
    outcome2,
    description,
    closeTime: isoOrNull(closeTime === 0n ? resolutionTime : closeTime),
    resolutionTime: isoOrNull(resolutionTime),
    rewardWei: reward,
    bondWei: bond,
    creationFeeWei: fees.marketCreationFee,
    initialLiquidityWei: initialLiquidity,
    note:
      initialLiquidity === 0n
        ? 'No liquidity seeded: nobody can buy/sell until someone runs add-liquidity.'
        : 'You hold the LP shares and earn the LP fee on every trade. Withdraw with remove-liquidity.',
  });
}

export async function commandAnalyze(flags: Flags, positional: string[]): Promise<void> {
  const marketId = marketIdFrom(flags, positional);
  const runtime = await createRuntime({ requireWallet: false });
  const { client, address } = runtime;
  const { market, info, probability, reserves, status } = await loadMarket(client, marketId);

  const probeWei = parseEther('0.01');
  const [fees, bond, assertion, positions, lpShares, buyYes, buyNo] = await Promise.all([
    client.getFeeConfig(),
    client.getAssertionBond(marketId),
    client.getActiveAssertion(marketId),
    address ? client.getPositions(marketId, address).catch(() => null) : null,
    address ? client.getLpShares(marketId, address) : 0n,
    client.quoteBuy(marketId, true, probeWei),
    client.quoteBuy(marketId, false, probeWei),
  ]);

  outputSuccess({
    command: 'analyze',
    market,
    info: { ...info, closeTime: isoOrNull(info.closeTime), resolutionTime: isoOrNull(info.resolutionTime) },
    probability,
    reserves,
    positions,
    lpShares,
    fees: {
      protocolFeeBps: fees.protocolFeeBps,
      lpFeeBps: fees.lpFeeBps,
      note: 'Fees apply to buy/sell only. mint (--side both), merge, settle and LP withdrawal are fee-free.',
    },
    quotesFor0_01Eth: {
      [market.outcome1]: { tokensOut: buyYes.amountOut, payoutIfWinsEth: formatEther(buyYes.amountOut) },
      [market.outcome2]: { tokensOut: buyNo.amountOut, payoutIfWinsEth: formatEther(buyNo.amountOut) },
    },
    assertion: assertion && {
      ...assertion,
      expiresAt: isoOrNull(assertion.expirationTime),
      disputed: assertion.disputer !== ZERO_ADDRESS,
    },
    assertionBond: bond,
    analysis: {
      status,
      canTrade: status === 'OPEN',
      canMint: !market.resolved && !fees.paused,
      canAssert:
        !market.resolved && market.assertedOutcomeId === ZERO_BYTES32 && status === 'AWAITING_ASSERTION',
      assertableFrom: isoOrNull(info.resolutionTime),
      canDispute: assertion !== null && assertion.disputer === ZERO_ADDRESS,
      canSettle: market.resolved,
      payoutRule: 'Each winning token redeems for 1 wei of ETH (1 token = 1 ETH at 18 decimals).',
    },
  });
}

export async function commandQuote(flags: Flags, positional: string[]): Promise<void> {
  const marketId = marketIdFrom(flags, positional);
  const isOutcome1 = parseSide(getFlag(flags, 'side'));
  const ethFlag = getFlag(flags, 'eth');
  const tokensFlag = getFlag(flags, 'tokens');
  ensure(ethFlag || tokensFlag, 'Pass `--eth <amount>` to quote a buy or `--tokens <amount>` to quote a sell.');

  const { client } = await createRuntime({ requireWallet: false });
  if (ethFlag) {
    const ethIn = parseEthInput(ethFlag);
    const q = await client.quoteBuy(marketId, isOutcome1, ethIn);
    outputSuccess({
      command: 'quote',
      action: 'buy',
      ethInWei: ethIn,
      tokensOut: q.amountOut,
      avgPriceEth: q.amountOut === 0n ? null : Number(ethIn) / Number(q.amountOut),
      protocolFeeWei: q.protocolFee,
      lpFeeWei: q.lpFee,
    });
    return;
  }
  const tokensIn = parseEthInput(tokensFlag);
  const q = await client.quoteSell(marketId, isOutcome1, tokensIn);
  outputSuccess({
    command: 'quote',
    action: 'sell',
    tokensIn,
    ethOutWei: q.amountOut,
    ethOut: formatEther(q.amountOut),
    protocolFeeWei: q.protocolFee,
    lpFeeWei: q.lpFee,
  });
}

export async function commandBuy(flags: Flags, positional: string[]): Promise<void> {
  const marketId = marketIdFrom(flags, positional);
  const side = (getFlag(flags, 'side') ?? 'both').toLowerCase();
  const ethAmount = parseEthInput(getFlag(flags, 'eth') ?? positional[1]);
  ensure(ethAmount > 0n, 'ETH amount must be > 0.');

  const { client } = await createRuntime({ requireWallet: true, autoCreateWallet: true });

  if (side === 'both') {
    const txHash = await client.mintOutcomeTokens(marketId, ethAmount);
    outputSuccess({
      command: 'buy',
      txHash,
      action: 'mintOutcomeTokens',
      marketId,
      side,
      ethAmountWei: ethAmount,
      ethAmountEth: formatEther(ethAmount),
      note: 'You hold equal YES and NO. Sell the side you disagree with (`sell`) or merge back to ETH (`merge`).',
    });
    return;
  }

  const isOutcome1 = parseSide(side);
  const quote = await client.quoteBuy(marketId, isOutcome1, ethAmount);
  ensure(quote.amountOut > 0n, 'Market has no liquidity. Add some with `add-liquidity` or pick another market.');
  const minOut =
    getFlag(flags, 'min-tokens-out') !== undefined
      ? parseWeiInput(getFlag(flags, 'min-tokens-out'))
      : withSlippage(quote.amountOut, slippageBps(flags));
  const txHash = await client.buyOutcomeToken(marketId, isOutcome1, ethAmount, minOut);

  outputSuccess({
    command: 'buy',
    txHash,
    action: 'buyOutcomeToken',
    marketId,
    side,
    ethAmountWei: ethAmount,
    ethAmountEth: formatEther(ethAmount),
    expectedTokensOut: quote.amountOut,
    minTokensOut: minOut,
    payoutIfWinsEth: formatEther(quote.amountOut),
    feesWei: { protocol: quote.protocolFee, lp: quote.lpFee },
  });
}

export async function commandSell(flags: Flags, positional: string[]): Promise<void> {
  const marketId = marketIdFrom(flags, positional);
  const isOutcome1 = parseSide(getFlag(flags, 'side'));
  const tokensFlag = getFlag(flags, 'tokens') ?? 'all';

  const { client, address } = await createRuntime({ requireWallet: true, autoCreateWallet: true });
  ensure(address, 'Wallet address unavailable.');
  const positions = await client.getPositions(marketId, address);
  const held = isOutcome1 ? positions.outcome1Balance : positions.outcome2Balance;
  const tokensIn = tokensFlag === 'all' ? held : parseEthInput(tokensFlag);
  ensure(tokensIn > 0n && tokensIn <= held, `Nothing to sell: you hold ${formatEther(held)} of that outcome.`);

  const quote = await client.quoteSell(marketId, isOutcome1, tokensIn);
  ensure(quote.amountOut > 0n, 'Sell would return 0 ETH (no liquidity or amount too small).');
  const minEthOut = withSlippage(quote.amountOut, slippageBps(flags));
  const txHash = await client.sellOutcomeToken(marketId, isOutcome1, tokensIn, minEthOut);

  outputSuccess({
    command: 'sell',
    txHash,
    marketId,
    side: isOutcome1 ? 'yes' : 'no',
    tokensIn,
    expectedEthOutWei: quote.amountOut,
    expectedEthOut: formatEther(quote.amountOut),
    minEthOutWei: minEthOut,
    feesWei: { protocol: quote.protocolFee, lp: quote.lpFee },
  });
}

export async function commandMerge(flags: Flags, positional: string[]): Promise<void> {
  const marketId = marketIdFrom(flags, positional);
  const amountFlag = getFlag(flags, 'amount') ?? 'all';
  const { client, address } = await createRuntime({ requireWallet: true, autoCreateWallet: true });
  ensure(address, 'Wallet address unavailable.');
  const { outcome1Balance, outcome2Balance } = await client.getPositions(marketId, address);
  const maxSets = outcome1Balance < outcome2Balance ? outcome1Balance : outcome2Balance;
  const amount = amountFlag === 'all' ? maxSets : parseEthInput(amountFlag);
  ensure(amount > 0n && amount <= maxSets, `You can merge at most ${formatEther(maxSets)} complete sets.`);

  const txHash = await client.mergeOutcomeTokens(marketId, amount);
  outputSuccess({ command: 'merge', txHash, marketId, amountWei: amount, ethReturned: formatEther(amount) });
}

export async function commandAddLiquidity(flags: Flags, positional: string[]): Promise<void> {
  const marketId = marketIdFrom(flags, positional);
  const ethAmount = parseEthInput(getFlag(flags, 'eth') ?? positional[1]);
  ensure(ethAmount > 0n, 'ETH amount must be > 0.');
  const { client, address } = await createRuntime({ requireWallet: true, autoCreateWallet: true });
  ensure(address, 'Wallet address unavailable.');

  const txHash = await client.addLiquidity(marketId, ethAmount);
  const shares = await client.getLpShares(marketId, address);
  outputSuccess({
    command: 'add-liquidity',
    txHash,
    marketId,
    ethAmountWei: ethAmount,
    lpSharesTotal: shares,
    note: 'LPs earn the LP fee on every trade but carry outcome risk. Withdraw anytime with remove-liquidity.',
  });
}

export async function commandRemoveLiquidity(flags: Flags, positional: string[]): Promise<void> {
  const marketId = marketIdFrom(flags, positional);
  const sharesFlag = getFlag(flags, 'shares') ?? 'all';
  const { client, address } = await createRuntime({ requireWallet: true, autoCreateWallet: true });
  ensure(address, 'Wallet address unavailable.');
  const owned = await client.getLpShares(marketId, address);
  const shares = sharesFlag === 'all' ? owned : parseWeiInput(sharesFlag);
  ensure(shares > 0n && shares <= owned, `You own ${owned} LP shares in this market.`);

  const txHash = await client.removeLiquidity(marketId, shares);
  outputSuccess({
    command: 'remove-liquidity',
    txHash,
    marketId,
    sharesRemoved: shares,
    note: 'You received outcome tokens. Sell/merge them now, or settle after resolution.',
  });
}

export async function commandAssert(flags: Flags, positional: string[]): Promise<void> {
  const marketId = marketIdFrom(flags, positional);
  const outcome = getFlag(flags, 'outcome') ?? positional[1];
  ensure(outcome, 'Missing asserted outcome. Use `--outcome <yes|no|Unresolvable>`.');

  const { client } = await createRuntime({ requireWallet: true, autoCreateWallet: true });
  const [bond, currency, liveness, info, now] = await Promise.all([
    client.getAssertionBond(marketId),
    client.getBondCurrency(),
    client.getDefaultLiveness(),
    client.getMarketInfo(marketId),
    chainNow(client),
  ]);
  ensure(
    now >= info.resolutionTime,
    `Too early: the outcome can only be asserted from ${isoOrNull(info.resolutionTime)}.`,
  );
  const txHash = await client.assertMarket(marketId, outcome); // approves the bond if needed

  outputSuccess({
    command: 'assert',
    txHash,
    marketId,
    assertedOutcome: outcome,
    bond,
    bondCurrency: currency,
    livenessSeconds: liveness,
    settleAfter: new Date(Date.now() + Number(liveness) * 1000).toISOString(),
    next: 'After the liveness window, run `clawlogic-agent settle --market-id <id>` (anyone can finalize).',
  });
}

export async function commandDispute(flags: Flags, positional: string[]): Promise<void> {
  const marketId = marketIdFrom(flags, positional);
  const { client } = await createRuntime({ requireWallet: true, autoCreateWallet: true });
  const assertion = await client.getActiveAssertion(marketId);
  ensure(assertion, 'Market has no active assertion to dispute.');
  ensure(assertion.disputer === ZERO_ADDRESS, 'Assertion is already disputed.');
  ensure(
    (await chainNow(client)) < assertion.expirationTime,
    'Liveness window has passed; the assertion can no longer be disputed.',
  );

  const txHash = await client.disputeAssertion(marketId);
  outputSuccess({
    command: 'dispute',
    txHash,
    marketId,
    assertionId: assertion.assertionId,
    bond: assertion.bond,
    bondCurrency: assertion.currency,
    next: "UMA's DVM votes on disputes (typically 2-4 days). If you are right you receive the asserter's bond.",
  });
}

/**
 * Drive a market to payout: finalize the UMA assertion if its liveness has
 * passed, withdraw LP shares, then redeem outcome tokens.
 */
export async function commandSettle(flags: Flags, positional: string[]): Promise<void> {
  const marketId = marketIdFrom(flags, positional);
  const { client, address } = await createRuntime({ requireWallet: true, autoCreateWallet: true });
  ensure(address, 'Wallet address unavailable.');
  const steps: Record<string, unknown>[] = [];

  let market = await client.getMarket(marketId);
  if (!market.resolved) {
    const assertion = await client.getActiveAssertion(marketId);
    ensure(assertion, 'Market has no assertion yet. Assert the outcome first with `clawlogic-agent assert`.');
    const now = await chainNow(client);
    ensure(
      assertion.disputer === ZERO_ADDRESS,
      "Assertion is disputed and waits for UMA's DVM vote. Run settle again after the vote.",
    );
    ensure(
      now >= assertion.expirationTime,
      `Liveness window still running. Settle after ${isoOrNull(assertion.expirationTime)}.`,
    );
    steps.push({ step: 'settleAssertion', txHash: await client.settleAssertion(marketId) });
    market = await client.getMarket(marketId);
    ensure(market.resolved, 'Assertion settled but the market did not resolve (assertion was false). Assert again.');
  }

  // The reward always goes to the asserter; whoever settles first pays it out.
  if (market.reward > 0n) {
    steps.push({ step: 'claimAssertionReward', reward: market.reward, txHash: await client.claimAssertionReward(marketId) });
  }

  const lpShares = await client.getLpShares(marketId, address);
  if (lpShares > 0n) {
    steps.push({ step: 'removeLiquidity', shares: lpShares, txHash: await client.removeLiquidity(marketId, lpShares) });
  }

  const { outcome1Balance, outcome2Balance } = await client.getPositions(marketId, address);
  if (outcome1Balance > 0n || outcome2Balance > 0n) {
    const before = await client.getBalance();
    try {
      steps.push({ step: 'settleOutcomeTokens', txHash: await client.settleOutcomeTokens(marketId) });
    } catch (error) {
      // Holding only losing tokens is not an error worth failing the command for.
      if (!String(error).includes('NoTokensToSettle')) throw error;
      steps.push({ step: 'settleOutcomeTokens', skipped: 'only losing tokens held' });
    }
    const after = await client.getBalance();
    steps.push({ step: 'payout', approxEthReceived: formatEther(after > before ? after - before : 0n) });
  }

  outputSuccess({ command: 'settle', marketId, resolved: true, steps });
}
