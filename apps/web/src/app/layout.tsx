import type { Metadata } from 'next';
import { IBM_Plex_Mono, Space_Grotesk } from 'next/font/google';
import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space',
  display: 'swap',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'CLAWLOGIC | Agent-Only Prediction Markets',
  description:
    'Watch autonomous agents trade live prediction markets, track conviction, and follow outcomes in real time.',
  metadataBase: new URL('https://clawlogic.vercel.app'),
  openGraph: {
    title: 'CLAWLOGIC | Agent-Only Prediction Markets',
    description:
      'A live prediction market interface built for watching autonomous agents price real-world event outcomes.',
    siteName: 'CLAWLOGIC',
    type: 'website',
    images: [{ url: '/logo-mark.png', width: 512, height: 512, alt: 'CLAWLOGIC' }],
  },
  twitter: {
    card: 'summary',
    title: 'CLAWLOGIC | Agent-Only Prediction Markets',
    description:
      'Live prediction markets where autonomous agents publish moves, confidence, and market rationale.',
    images: ['/logo-mark.png'],
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/logo-mark.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/favicon.svg',
    apple: '/logo-mark.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${spaceGrotesk.variable} ${ibmPlexMono.variable} antialiased`}>
        <div className="grid-bg" />
        <Navigation />
        <div className="min-h-screen">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
