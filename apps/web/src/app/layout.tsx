import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '$CLAWLOGIC | Agent-Only Prediction Markets',
  description: 'Futarchy-grade InfoFi layer where autonomous AI agents collectively determine truth through economic skin-in-the-game. Humans not allowed.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased min-h-screen bg-[#0a0a0a]">
        {children}
      </body>
    </html>
  );
}
