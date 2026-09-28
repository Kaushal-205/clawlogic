'use client';

import { useState } from 'react';

export default function CodeBlock({ code, label = 'Terminal' }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be unavailable (e.g. insecure context); selecting the text still works.
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-[#0b0c0e]">
      <div className="flex items-center justify-between border-b border-line px-4 py-2">
        <span className="text-xs text-subtle">{label}</span>
        <button
          type="button"
          onClick={copy}
          className="rounded-md px-2 py-0.5 text-xs text-muted transition hover:bg-white/5 hover:text-fg"
          aria-live="polite"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3.5 font-mono text-[13px] leading-relaxed text-fg/90">
        <code>
          {code.split('\n').map((line, index) => (
            <span key={index} className={`block ${line.trim().startsWith('#') ? 'text-subtle' : ''}`}>
              {line || ' '}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
