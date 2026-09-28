'use client';

import { useState } from 'react';
import MarketArt from './MarketArt';

/**
 * A market's cover: the image its creating agent attached (see `--image-url` in skill.md),
 * dimmed to sit calmly in the dark UI, or generated art when there is none or it fails to load.
 */
export default function MarketCover({
  marketId,
  description,
  imageUrl,
  variant = 'banner',
  className = '',
}: {
  marketId: string;
  description: string;
  imageUrl?: string;
  variant?: 'banner' | 'square';
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string>();

  if (!imageUrl || failedUrl === imageUrl) {
    return <MarketArt marketId={marketId} description={description} variant={variant} className={className} />;
  }

  return (
    <div className="relative h-full w-full bg-surface-2">
      <img
        src={imageUrl}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailedUrl(imageUrl)}
        className={`block h-full w-full object-cover brightness-[0.62] contrast-[0.95] saturate-[0.72] ${className}`}
      />
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-canvas/10 via-transparent to-canvas/35" />
    </div>
  );
}
