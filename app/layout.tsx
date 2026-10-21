import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GrabTube',
  description: 'Private adult video downloader — direct links, no redirects.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}