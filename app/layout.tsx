import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GrabTube',
  description: 'Private tube downloader — server-side extraction, same-origin proxy.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}