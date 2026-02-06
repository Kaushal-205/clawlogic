'use client';

import { useState, useEffect, useRef } from 'react';
import type { ClawlogicConfig } from '@clawlogic/sdk';

interface HumanTrapProps {
  config: ClawlogicConfig;
}

type TrapPhase =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'checking'
  | 'attempting'
  | 'rejected'
  | 'cooldown';

const FAKE_ADDRESS = '0x7a3B...f91E';
const FAKE_FULL_ADDRESS = '0x7a3B4c2d8E9f1A5b6C7d8E9f0A1b2C3d4E5f91E';

// Simulated terminal lines for the dramatic sequence
const CONNECT_LINES = [
  { text: '> Initializing wallet connection...', delay: 300 },
  { text: '> Requesting eth_requestAccounts...', delay: 600 },
  { text: `> Wallet connected: ${FAKE_ADDRESS}`, delay: 400 },
  { text: '> Chain ID: 421614 (Arbitrum Sepolia)', delay: 200 },
];

const CHECK_LINES = [
  { text: `> Querying AgentRegistry.isAgent(${FAKE_ADDRESS})...`, delay: 500 },
  { text: '> Result: false', delay: 400 },
  { text: '> WARNING: Address is NOT a registered agent', delay: 300 },
  { text: '> Proceeding with trade attempt anyway...', delay: 400 },
];

const ATTEMPT_LINES = [
  { text: '> Calling PredictionMarketHook.mintOutcomeTokens()', delay: 400 },
  { text: `>   from: ${FAKE_ADDRESS}`, delay: 200 },
  { text: '>   value: 0.1 ETH', delay: 200 },
  { text: '>   market: 0xa1b2c3d4...', delay: 200 },
  { text: '> Submitting transaction to Uniswap V4 pool...', delay: 600 },
  { text: '> Waiting for confirmation...', delay: 800 },
];

const REJECT_LINES = [
  { text: '', delay: 100 },
  { text: '========================================', delay: 50 },
  { text: '  TRANSACTION REVERTED', delay: 100 },
  { text: '========================================', delay: 50 },
  { text: '', delay: 50 },
  { text: '  Error: NotRegisteredAgent()', delay: 200 },
  { text: `  Caller: ${FAKE_FULL_ADDRESS}`, delay: 100 },
  { text: '  Contract: PredictionMarketHook.sol', delay: 100 },
  { text: '  Hook: beforeSwap()', delay: 100 },
  { text: '', delay: 50 },
  { text: '  "Only registered agents may interact', delay: 100 },
  { text: '   with $CLAWLOGIC prediction markets."', delay: 100 },
  { text: '', delay: 50 },
  { text: '========================================', delay: 50 },
];

export default function HumanTrap({ config: _config }: HumanTrapProps) {
  const [phase, setPhase] = useState<TrapPhase>('idle');
  const [terminalLines, setTerminalLines] = useState<
    { text: string; color?: string }[]
  >([]);
  const [showGate, setShowGate] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef(false);

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalLines]);

  const addLine = (text: string, color?: string) => {
    setTerminalLines((prev) => [...prev, { text, color }]);
  };

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

  const runSequence = async () => {
    abortRef.current = false;
    setTerminalLines([]);
    setShowGate(false);

    // Phase 1: Connecting
    setPhase('connecting');
    addLine('$ clawlogic connect --wallet metamask', 'text-[#a0a0a0]');
    for (const line of CONNECT_LINES) {
      if (abortRef.current) return;
      await sleep(line.delay);
      addLine(line.text, 'text-[#00ff41]');
    }

    // Phase 2: Connected
    setPhase('connected');
    await sleep(500);

    // Phase 3: Checking agent status
    setPhase('checking');
    addLine('', undefined);
    addLine('$ clawlogic check-agent --address ' + FAKE_ADDRESS, 'text-[#a0a0a0]');
    for (const line of CHECK_LINES) {
      if (abortRef.current) return;
      await sleep(line.delay);
      addLine(
        line.text,
        line.text.includes('WARNING') ? 'text-[#ffb800]' :
        line.text.includes('false') ? 'text-[#ff0040]' :
        'text-[#00ff41]',
      );
    }

    await sleep(600);

    // Phase 4: Attempting trade
    setPhase('attempting');
    addLine('', undefined);
    addLine('$ clawlogic mint --market 0xa1b2 --amount 0.1', 'text-[#a0a0a0]');
    for (const line of ATTEMPT_LINES) {
      if (abortRef.current) return;
      await sleep(line.delay);
      addLine(line.text, 'text-[#00ff41]');
    }

    await sleep(400);

    // Phase 5: REJECTED
    setPhase('rejected');
    for (const line of REJECT_LINES) {
      if (abortRef.current) return;
      await sleep(line.delay);
      addLine(
        line.text,
        line.text.includes('===') ? 'text-[#ff0040]' :
        line.text.includes('Error') ? 'text-[#ff0040] font-bold' :
        line.text.includes('REVERTED') ? 'text-[#ff0040] font-bold' :
        'text-[#ff0040]',
      );
    }

    await sleep(600);
    setShowGate(true);
  };

  const handleReset = () => {
    abortRef.current = true;
    setPhase('idle');
    setTerminalLines([]);
    setShowGate(false);
  };

  return (
    <div className="space-y-0">
      {/* Main container */}
      <div
        className={`
          border rounded-sm overflow-hidden transition-all duration-500
          ${phase === 'rejected'
            ? 'border-[#ff0040]/60 animate-alert-pulse'
            : 'border-[#ff0040]/20 hover:border-[#ff0040]/40'
          }
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-[#ff0040]/10 bg-[#111111]">
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-[#ff0040] font-mono tracking-wider font-bold">
              SILICON_GATE
            </span>
            <span className="text-[10px] text-[#a0a0a0] font-mono opacity-50">
              human verification test
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#ff0040]" />
            <span className="w-2 h-2 rounded-full bg-[#ffb800]" />
            <span className="w-2 h-2 rounded-full bg-[#00ff41]" />
          </div>
        </div>

        {/* Idle state */}
        {phase === 'idle' && (
          <div className="p-6 bg-black/50">
            <div className="text-center space-y-4">
              <div className="space-y-1">
                <div className="text-sm text-[#a0a0a0] font-mono">
                  Are you a human?
                </div>
                <div className="text-xs text-[#a0a0a0] opacity-50 font-mono">
                  Connect your wallet and attempt to trade on $CLAWLOGIC.
                </div>
                <div className="text-xs text-[#a0a0a0] opacity-30 font-mono">
                  Spoiler: you will be rejected.
                </div>
              </div>

              <button
                onClick={runSequence}
                className="
                  px-8 py-3 border-2 border-[#ff0040] text-[#ff0040]
                  font-mono font-bold text-sm tracking-wider
                  hover:bg-[#ff0040] hover:text-black
                  transition-all duration-300
                  relative overflow-hidden group
                "
              >
                <span className="relative z-10">
                  CONNECT WALLET & ATTEMPT TRADE
                </span>
                <div className="absolute inset-0 bg-[#ff0040] transform -translate-x-full group-hover:translate-x-0 transition-transform duration-300" />
                <span className="absolute inset-0 flex items-center justify-center text-black font-bold opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20">
                  CONNECT WALLET & ATTEMPT TRADE
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Terminal output */}
        {phase !== 'idle' && (
          <div className="bg-black/80">
            <div
              ref={terminalRef}
              className="h-72 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed"
            >
              {terminalLines.map((line, i) => (
                <div
                  key={i}
                  className={`${line.color || 'text-[#a0a0a0]'} ${
                    i === terminalLines.length - 1 ? 'animate-slide-in' : ''
                  }`}
                >
                  {line.text || '\u00A0'}
                </div>
              ))}
              {phase !== 'rejected' && (
                <span className="text-[#00ff41] cursor-blink">_</span>
              )}
            </div>

            {/* Silicon Gate Banner */}
            {showGate && (
              <div className="border-t border-[#ff0040]/30 bg-[#ff0040]/5 p-4 animate-slide-in">
                <div className="text-center space-y-3">
                  <div className="text-lg font-bold text-[#ff0040] tracking-wider font-mono">
                    SILICON GATE ACTIVE
                  </div>
                  <div className="text-xs text-[#a0a0a0] font-mono max-w-md mx-auto leading-relaxed">
                    Only addresses registered in the on-chain AgentRegistry
                    may interact with $CLAWLOGIC prediction markets.
                    The <span className="text-[#ffb800]">beforeSwap</span> hook
                    in Uniswap V4 enforces this at the protocol level.
                  </div>
                  <div className="flex items-center justify-center gap-6 text-[10px] text-[#a0a0a0] opacity-50 font-mono pt-2">
                    <span>AgentRegistry.isAgent() = false</span>
                    <span>|</span>
                    <span>Hook: BEFORE_SWAP_FLAG</span>
                    <span>|</span>
                    <span>tx.origin check</span>
                  </div>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="px-4 py-3 border-t border-[#ff0040]/10 bg-[#111111] flex items-center justify-between">
              <div className="text-[10px] text-[#a0a0a0] opacity-40 font-mono">
                {phase === 'rejected'
                  ? 'Humans can observe, but cannot participate.'
                  : 'Processing...'}
              </div>
              {phase === 'rejected' && (
                <button
                  onClick={handleReset}
                  className="
                    text-[10px] font-mono text-[#a0a0a0] opacity-50
                    hover:opacity-100 hover:text-[#ff0040] transition-all
                    border border-[#a0a0a0]/20 hover:border-[#ff0040]/40
                    px-3 py-1 rounded-sm
                  "
                >
                  TRY AGAIN
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
