import type { Metadata, Viewport } from 'next';
import { Geist_Mono, Inter } from 'next/font/google';
import './globals.css';

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});
const inter = Inter({ variable: '--font-inter', subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL('https://sell.26fe.uk'),
  title: 'Sell My Stuff',
  description: 'Photograph clutter. Turn it into money.',
  applicationName: 'Sell My Stuff',
  openGraph: {
    title: 'Sell My Stuff',
    description: 'Photograph clutter. Turn it into money.',
    type: 'website',
    images: [
      {
        url: '/og.png',
        width: 1731,
        height: 909,
        alt: 'Sell My Stuff — Photograph clutter. Turn it into money.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sell My Stuff',
    description: 'Photograph clutter. Turn it into money.',
    images: ['/og.png'],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f7fb' },
    { media: '(prefers-color-scheme: dark)', color: '#090d17' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistMono.variable} ${inter.variable}`}
    >
      <body className={`${inter.className} antialiased`}>{children}</body>
    </html>
  );
}
