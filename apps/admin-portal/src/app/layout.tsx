import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cloud Storage Manager & Hardware Admin',
  description: 'Self-Hosted Cloud Platform Hardware & Pool Manager',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-background text-slate-100 antialiased selection:bg-blue-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}
