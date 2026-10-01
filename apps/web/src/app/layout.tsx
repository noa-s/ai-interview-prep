import type { Metadata } from 'next';
import './globals.css';
import { SessionUsageProvider } from '@/context/SessionUsageProvider';

export const metadata: Metadata = {
  title: 'AI Interview Prep — CV Helper',
  description: 'CV Helper — AI-powered interview preparation',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased bg-gray-50"><SessionUsageProvider>{children}</SessionUsageProvider></body>
    </html>
  );
}
