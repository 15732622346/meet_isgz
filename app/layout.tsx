import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AppProviders } from '@/components/providers/AppProviders';
import '../styles/globals.css';
import '@livekit/components-styles';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'LiveKit Meet',
  description: 'Open source video conferencing app built on LiveKit',
  icons: {
    icon: [
      {
        url: '/favicon.ico',
        sizes: 'any',
      },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" data-lk-theme="default">
      <body className={inter.className}>
        <AppProviders>
          {children}
        </AppProviders>
      </body>
    </html>
  );
}