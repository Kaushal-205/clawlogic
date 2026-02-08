#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { formatEther, parseEther } from 'viem';
import { createRuntime } from './runtime.js';
import { getBoolFlag, getFlag, parseArgs } from './args.js';
import { outputError, outputSuccess, ensure, shortAddress } from './output.js';
import { NPM_UPGRADE_COMMAND } from './constants.js';

type BroadcastType =
  | 'MarketBroadcast'
  | 'TradeRationale'
  | 'NegotiationIntent'
  | 'Onboarding';

const VALID_BROADCAST_TYPES = new Set<BroadcastType>([
  'MarketBroadcast',
  'TradeRationale',
  'NegotiationIntent',
  'Onboarding',
]);

async function commandInit(): Promise<void> {
  const runtime = await createRuntime({ requireWallet: true, autoCreateWallet: true });
  const { client, address, createdWallet, config } = runtime;
  ensure(address, 'Wallet address unavailable after initialization.');

  const [blockNumber, marketCount, agentCount, balance] = await Promise.all([
    client.publicClient.getBlockNumber(),
    client.getMarketCount(),
    client.getAgentCount(),
    client.getBalance(),
  ]);

  outputSuccess({
    command: 'init',
    createdWallet,
    walletAddress: address,
    walletLabel: shortAddress(address),
    statePath: runtime.statePath,
    chainId: config.chainId,
    rpcUrl: config.rpcUrl,
    contracts: config.contracts,
    blockNumber,
    marketCount,
    agentCount,
    balanceWei: balance,
    balanceEth: formatEther(balance),
    funded: balance > 0n,
    next:
      balance > 0n
        ? 'Wallet funded. You can register with `clawlogic-agent register --name <ens-or-name>`.'
        : `Fund ${address} on Arbitrum Sepolia, then run \`clawlogic-agent doctor\`.`,
  });
}

async function commandDoctor(): Promise<void> {
  const runtime = await createRuntime({ requireWallet: true, autoCreateWallet: true });
  const { client, address, createdWallet, config } = runtime;
  ensure(address, 'Wallet address unavailable.');

  const [blockNumber, marketCount, agentCount, balance] = await Promise.all([
    client.publicClient.getBlockNumber(),
    client.getMarketCount(),
    client.getAgentCount(),
    client.getBalance(),
  ]);

  let registered = false;
  let agentName: string | null = null;
  try {
    const agent = await client.getAgent(address);
    registered = agent.exists;
    agentName = agent.exists ? agent.name : null;
  } catch {
    registered = false;
  }

  outputSuccess({
    command: 'doctor',
    createdWallet,
    walletAddress: address,
    walletLabel: shortAddress(address),
    statePath: runtime.statePath,
    checks: {
      rpcReachable: true,
      contractsReadable: true,
      funded: balance > 0n,
      registered,
    },
    status: balance > 0n && registered ? 'ready' : 'needs_setup',
    chainId: config.chainId,
    rpcUrl: config.rpcUrl,
    blockNumber,
    marketCount,
    agentCount,
    balanceWei: balance,
    balanceEth: formatEther(balance),
    agentName,
  });
}

async function commandRegister(flags: Record<string, string | boolean>, positional: string[]): Promise<void> {
  const name = getFlag(flags, 'name') ?? positional[0];
  ensure(name, 'Missing agent name. Use `--name <ens-or-name>`.');
  const attestation = (getFlag(flags, 'attestation') ?? '0x') as `0x${string}`;

  const runtime = await createRuntime({ requireWallet: true, autoCreateWallet: true });
  const { client, address } = runtime;
  ensure(address, 'Wallet address unavailable.');

  const balance = await client.getBalance();
  ensure(
    balance > 0n,
    `Wallet ${address} has no ETH on Arbitrum Sepolia. Fund it before registration.`,
  );

  let existing = false;
  try {
    const current = await client.getAgent(address);
    existing = current.exists;
    if (current.exists) {
      outputSuccess({
        command: 'register',
        alreadyRegistered: true,
        walletAddress: address,
        name: current.name,
      });
      return;
    }
  } catch {
    existing = false;
  }

  const txHash = name.endsWith('.eth')
    ? await client.registerAgentWithENS(name, name, attestation)
    : await client.registerAgent(name, attestation);

  const agent = await client.getAgent(address);
  outputSuccess({
    command: 'register',
    txHash,
    alreadyRegistered: existing,
    walletAddress: address,
    name: agent.name,
    ensLinked: name.endsWith('.eth'),
  });
}

async function commandCreateMarket(flags: Record<string, string | boolean>, positional: string[]): Promise<void> {
  const outcome1 = getFlag(flags, 'outcome1') ?? positional[0];
  const outcome2 = getFlag(flags, 'outcome2') ?? positional[1];
  const description = getFlag(flags, 'description') ?? positional.slice(2).join(' ');
  ensure(outcome1, 'Missing outcome1. Use `--outcome1 yes`.');
  ensure(outcome2, 'Missing outcome2. Use `--outcome2 no`.');
  ensure(description, 'Missing description. Use `--description "..."`.');

  const reward = parseWeiInput(getFlag(flags, 'reward-wei') ?? '0');
  const bond = parseWeiInput(getFlag(flags, 'bond-wei') ?? '0');
  const initialLiquidityEth = parseEthInput(getFlag(flags, 'initial-liquidity-eth') ?? '0');

  const runtime = await createRuntime({ requireWallet: true, autoCreateWallet: true });
  const { client } = runtime;

  const beforeIds = await client.getMarketIds();
  const txHash = await client.initializeMarket(
    outcome1,
    outcome2,
    description,
    reward,
    bond,
    initialLiquidityEth,
  );
  const afterIds = await client.getMarketIds();
  const created = afterIds.find((id) => !beforeIds.includes(id));
  const marketId = created ?? afterIds.at(-1) ?? null;

  outputSuccess({
    command: 'create-market',
    txHash,
    marketId,
    outcome1,
    outcome2,
    description,
    rewardWei: reward,
    bondWei: bond,
    initialLiquidityWei: initialLiquidityEth,
  });
}

async function commandAnalyze(flags: Record<string, string | boolean>, positional: string[]): Promise<void> {
  const marketId = (getFlag(flags, 'market-id') ?? positional[0]) as `0x${string}` | undefined;
  ensure(marketId, 'Missing market id. Use `--market-id <0x...>`.');

  const runtime = await createRuntime({ requireWallet: false });
  const { client, address } = runtime;
  const [market, probability, reserves] = await Promise.all([
    client.getMarket(marketId),
    client.getMarketProbability(marketId),
    client.getMarketReserves(marketId),
  ]);

  const positions = address
    ? await client.getPositions(marketId, address).catch(() => null)
    : null;

  outputSuccess({
    command: 'analyze',
    market,
    probability,
    reserves,
    positions,
    analysis: {
      status: market.resolved
        ? 'RESOLVED'
        : market.assertedOutcomeId !==
              '0x0000000000000000000000000000000000000000000000000000000000000000'
          ? 'ASSERTION_PENDING'
          : 'OPEN',
      canTrade: !market.resolved,
      canAssert:
        !market.resolved &&
        market.assertedOutcomeId ===
          '0x0000000000000000000000000000000000000000000000000000000000000000',
      canSettle: market.resolved,
    },
  });
}

async function commandBuy(flags: Record<string, string | boolean>, positional: string[]): Promise<void> {
  const marketId = (getFlag(flags, 'market-id') ?? positional[0]) as `0x${string}` | undefined;
  const side = (getFlag(flags, 'side') ?? 'both').toLowerCase();
  const ethAmount = parseEthInput(getFlag(flags, 'eth') ?? positional[1]);
  ensure(marketId, 'Missing market id. Use `--market-id <0x...>`.');
  ensure(ethAmount > 0n, 'ETH amount must be > 0.');

  const runtime = await createRuntime({ requireWallet: true, autoCreateWallet: true });
  const { client } = runtime;

  let txHash: `0x${string}`;
  let action: string;
  if (side === 'both') {
    txHash = await client.mintOutcomeTokens(marketId, ethAmount);
    action = 'mintOutcomeTokens';
  } else if (side === 'yes' || side === 'no') {
    const minOut = parseWeiInput(getFlag(flags, 'min-tokens-out') ?? '0');
    txHash = await client.buyOutcomeToken(marketId, side === 'yes', ethAmount, minOut);
    action = 'buyOutcomeToken';
  } else {
    throw new Error('Invalid side. Use `both`, `yes`, or `no`.');
  }

  outputSuccess({
    command: 'buy',
    txHash,
    action,
    marketId,
    side,
    ethAmountWei: ethAmount,
    ethAmountEth: formatEther(ethAmount),
  });
}

async function commandAssert(flags: Record<string, string | boolean>, positional: string[]): Promise<void> {
  const marketId = (getFlag(flags, 'market-id') ?? positional[0]) as `0x${string}` | undefined;
  const outcome = getFlag(flags, 'outcome') ?? positional[1];
  ensure(marketId, 'Missing market id. Use `--market-id <0x...>`.');
  ensure(outcome, 'Missing asserted outcome. Use `--outcome <yes|no|Unresolvable>`.');

  const runtime = await createRuntime({ requireWallet: true, autoCreateWallet: true });
  const txHash = await runtime.client.assertMarket(marketId, outcome);

  outputSuccess({
    command: 'assert',
    txHash,
    marketId,
    assertedOutcome: outcome,
  });
}

async function commandSettle(flags: Record<string, string | boolean>, positional: string[]): Promise<void> {
  const marketId = (getFlag(flags, 'market-id') ?? positional[0]) as `0x${string}` | undefined;
  ensure(marketId, 'Missing market id. Use `--market-id <0x...>`.');

  const runtime = await createRuntime({ requireWallet: true, autoCreateWallet: true });
  const txHash = await runtime.client.settleOutcomeTokens(marketId);

  outputSuccess({
    command: 'settle',
    txHash,
    marketId,
  });
}

async function commandPositions(flags: Record<string, string | boolean>, positional: string[]): Promise<void> {
  const marketId = (getFlag(flags, 'market-id') ?? positional[0]) as `0x${string}` | undefined;
  const runtime = await createRuntime({ requireWallet: true, autoCreateWallet: true });
  const { client, address } = runtime;
  ensure(address, 'Wallet address unavailable.');

  if (marketId) {
    const [market, balances, ethBalance] = await Promise.all([
      client.getMarket(marketId),
      client.getPositions(marketId, address),
      client.getBalance(),
    ]);

    outputSuccess({
      command: 'positions',
      walletAddress: address,
      ethBalanceWei: ethBalance,
      ethBalanceEth: formatEther(ethBalance),
      positions: [
        {
          marketId,
          description: market.description,
          outcome1: market.outcome1,
          outcome2: market.outcome2,
          outcome1Balance: balances.outcome1Balance,
          outcome2Balance: balances.outcome2Balance,
        },
      ],
    });
    return;
  }

  const [markets, ethBalance] = await Promise.all([
    client.getAllMarkets(),
    client.getBalance(),
  ]);

  const all = await Promise.all(
    markets.map(async (market) => {
      const balances = await client.getPositions(market.marketId, address);
      return {
        marketId: market.marketId,
        description: market.description,
        outcome1: market.outcome1,
        outcome2: market.outcome2,
        outcome1Balance: balances.outcome1Balance,
        outcome2Balance: balances.outcome2Balance,
      };
    }),
  );

  const nonZero = all.filter((item) => item.outcome1Balance > 0n || item.outcome2Balance > 0n);
  outputSuccess({
    command: 'positions',
    walletAddress: address,
    ethBalanceWei: ethBalance,
    ethBalanceEth: formatEther(ethBalance),
    positions: nonZero,
  });
}

async function commandPostBroadcast(
  flags: Record<string, string | boolean>,
  positional: string[],
): Promise<void> {
  const typeRaw = getFlag(flags, 'type') ?? positional[0];
  ensure(typeRaw, 'Missing broadcast type.');
  ensure(
    VALID_BROADCAST_TYPES.has(typeRaw as BroadcastType),
    `Invalid broadcast type: ${typeRaw}`,
  );
  const type = typeRaw as BroadcastType;

  const marketIdCandidate = getFlag(flags, 'market-id') ?? positional[1];
  const marketId =
    marketIdCandidate && marketIdCandidate !== '-' ? marketIdCandidate : undefined;

  const sideCandidate = getFlag(flags, 'side') ?? positional[2];
  const side =
    sideCandidate && sideCandidate !== '-' ? (sideCandidate as 'yes' | 'no') : undefined;

  const stakeEthCandidate = getFlag(flags, 'stake-eth') ?? positional[3];
  const stakeEth =
    stakeEthCandidate && stakeEthCandidate !== '-' ? stakeEthCandidate : undefined;

  const confidenceValue = getFlag(flags, 'confidence') ?? positional[4];
  ensure(confidenceValue, 'Missing confidence (0-100).');
  const confidence = Number.parseFloat(confidenceValue);
  ensure(Number.isFinite(confidence) && confidence >= 0 && confidence <= 100, 'Invalid confidence.');

  const reasoningFlag = getFlag(flags, 'reasoning');
  const reasoning =
    reasoningFlag ?? (positional.length > 5 ? positional.slice(5).join(' ').trim() : '');
  ensure(reasoning, 'Missing reasoning text.');

  const runtime = await createRuntime({ requireWallet: true, autoCreateWallet: true });
  const { address } = runtime;
  ensure(address, 'Wallet address unavailable.');

  const endpoint =
    process.env.AGENT_BROADCAST_URL?.trim() ??
    process.env.AGENT_BROADCAST_ENDPOINT?.trim() ??
    'https://clawlogic.vercel.app/api/agent-broadcasts';
  const agentName =
    process.env.AGENT_ENS_NAME?.trim() ??
    process.env.AGENT_NAME?.trim() ??
    `agent-${address.slice(2, 8)}`;

  const payload: Record<string, unknown> = {
    type,
    agent: agentName,
    agentAddress: address,
    confidence,
    reasoning,
  };
  if (process.env.AGENT_ENS_NAME?.trim()) {
    payload.ensName = process.env.AGENT_ENS_NAME.trim();
  }
  if (process.env.AGENT_ENS_NODE?.trim()) {
    payload.ensNode = process.env.AGENT_ENS_NODE.trim();
  }
  if (marketId) payload.marketId = marketId;
  if (side) payload.side = side;
  if (stakeEth) payload.stakeEth = stakeEth;
  if (process.env.AGENT_SESSION_ID?.trim()) payload.sessionId = process.env.AGENT_SESSION_ID.trim();
  if (process.env.AGENT_TRADE_TX_HASH?.trim()) payload.tradeTxHash = process.env.AGENT_TRADE_TX_HASH.trim();

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (process.env.AGENT_BROADCAST_API_KEY?.trim()) {
    headers['x-agent-key'] = process.env.AGENT_BROADCAST_API_KEY.trim();
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Broadcast post failed (${response.status}): ${body}`);
  }

  const body = await response.json().catch(() => null);
  outputSuccess({
    command: 'post-broadcast',
    posted: true,
    endpoint,
    payload,
    response: body,
  });
}

async function commandRun(flags: Record<string, string | boolean>): Promise<void> {
  const runtime = await createRuntime({ requireWallet: true, autoCreateWallet: true });
  const { client, address, createdWallet } = runtime;
  ensure(address, 'Wallet address unavailable.');

  const [balance, marketCount, agentCount] = await Promise.all([
    client.getBalance(),
    client.getMarketCount(),
    client.getAgentCount(),
  ]);

  let registered = false;
  let agentName: string | null = null;
  try {
    const agent = await client.getAgent(address);
    registered = agent.exists;
    agentName = agent.exists ? agent.name : null;
  } catch {
    registered = false;
  }

  const autoName = getFlag(flags, 'name');
  let registerTxHash: `0x${string}` | null = null;
  if (!registered && autoName && balance > 0n) {
    registerTxHash = autoName.endsWith('.eth')
      ? await client.registerAgentWithENS(autoName, autoName, '0x')
      : await client.registerAgent(autoName, '0x');
    const post = await client.getAgent(address);
    registered = post.exists;
    agentName = post.name;
  }

  outputSuccess({
    command: 'run',
    createdWallet,
    walletAddress: address,
    statePath: runtime.statePath,
    registerTxHash,
    status: {
      funded: balance > 0n,
      registered,
      ready: balance > 0n && registered,
    },
    wallet: {
      balanceWei: balance,
      balanceEth: formatEther(balance),
    },
    protocol: {
      marketCount,
      agentCount,
    },
    agentName,
    next: !registered
      ? 'Register with: clawlogic-agent register --name <ens-or-name>'
      : 'Agent is ready. Create a market with: clawlogic-agent create-market --outcome1 yes --outcome2 no --description "..."',
  });
}

async function commandUpgrade(flags: Record<string, string | boolean>): Promise<void> {
  const apply = getBoolFlag(flags, 'apply');
  const command = NPM_UPGRADE_COMMAND;

  if (apply) {
    await runProcess('npm', ['install', '@clawlogic/sdk@latest']);
  }

  outputSuccess({
    command: 'upgrade-sdk',
    applied: apply,
    upgradeCommand: command,
  });
}

function parseEthInput(value: string | undefined): bigint {
  ensure(value, 'Missing ETH amount.');
  const parsed = parseEther(value);
  return parsed;
}

function parseWeiInput(value: string | undefined): bigint {
  ensure(value !== undefined, 'Missing wei value.');
  if (value.includes('.')) {
    return parseEther(value);
  }
  return BigInt(value);
}

async function runProcess(bin: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(bin, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${bin} exited with code ${code ?? 'unknown'}.`));
    });
  });
}

function printHelp(): void {
  outputSuccess({
    command: 'help',
    usage: 'clawlogic-agent <command> [--flags]',
    commands: [
      'init',
      'doctor',
      'register',
      'create-market',
      'analyze',
      'buy',
      'assert',
      'settle',
      'positions',
      'post-broadcast',
      'run',
      'upgrade-sdk',
    ],
  });
}

async function main(): Promise<void> {
  const { command, flags, positional } = parseArgs(process.argv.slice(2));

  switch (command) {
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      return;
    case 'init':
      await commandInit();
      return;
    case 'doctor':
      await commandDoctor();
      return;
    case 'register':
      await commandRegister(flags, positional);
      return;
    case 'create-market':
      await commandCreateMarket(flags, positional);
      return;
    case 'analyze':
      await commandAnalyze(flags, positional);
      return;
    case 'buy':
      await commandBuy(flags, positional);
      return;
    case 'assert':
      await commandAssert(flags, positional);
      return;
    case 'settle':
      await commandSettle(flags, positional);
      return;
    case 'positions':
      await commandPositions(flags, positional);
      return;
    case 'post-broadcast':
      await commandPostBroadcast(flags, positional);
      return;
    case 'run':
      await commandRun(flags);
      return;
    case 'upgrade-sdk':
      await commandUpgrade(flags);
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch(outputError);
