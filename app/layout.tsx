import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://portal.hwf.zeekayeditz.com'),
  title: 'Ali Dairies | Farm Management',
  description: 'Daily livestock, dairy, crop, labour, equipment, GUR and farm finance management for Ali Dairies.',
  applicationName: 'Ali Dairies',
  icons: { icon: '/ali-livestock-logo.png', apple: '/ali-livestock-logo.png' },
  openGraph: {
    title: 'Ali Dairies Farm Management',
    description: 'Private dairy, livestock and farm records for Ali Dairies.',
    type: 'website',
    url: 'https://portal.hwf.zeekayeditz.com',
    images: [{ url: '/ali-livestock-logo.png', width: 1254, height: 1254, alt: 'Ali Dairies logo' }],
  },
  twitter: { card: 'summary', title: 'Ali Dairies Farm Management', description: 'Private dairy, livestock and farm records for Ali Dairies.', images: ['/ali-livestock-logo.png'] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
