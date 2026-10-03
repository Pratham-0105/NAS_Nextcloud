import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'My Cloud Storage',
  description: 'Fast, secure personal cloud storage for photos, files, and documents',
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
