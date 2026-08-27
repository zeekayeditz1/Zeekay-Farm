import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://portal.hwf.zeekayeditz.com'),
  title: 'Ali Livestock | Farm Management',
  description: 'Daily livestock, crop, labour, equipment, GUR and farm finance management for Ali Livestock.',
  applicationName: 'Ali Livestock',
  icons: { icon: '/ali-livestock-logo.png', apple: '/ali-livestock-logo.png' },
  openGraph: {
    title: 'Ali Livestock Farm Management',
    description: 'Private livestock and farm records for Ali Livestock.',
    type: 'website',
    url: 'https://portal.hwf.zeekayeditz.com',
    images: [{ url: '/ali-livestock-logo.png', width: 1254, height: 1254, alt: 'Ali Livestock logo' }],
  },
  twitter: { card: 'summary', title: 'Ali Livestock Farm Management', description: 'Private livestock and farm records for Ali Livestock.', images: ['/ali-livestock-logo.png'] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
