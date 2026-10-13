import { Providers } from '@/components/providers';
import { Analytics } from '@vercel/analytics/next';
import './global.css';
import { Inter, Geist_Mono } from 'next/font/google';
import type { Metadata } from 'next';
import { getSiteUrl, site } from '@/lib/site';

const sans = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: { default: 'Fluid Tabs — React Native, in motion.', template: '%s · Fluid Tabs' },
  description: site.description,
  applicationName: site.name,
  keywords: ['React Native', 'collapsible tabs', 'collapsing header', 'Reanimated', 'Expo', 'fluid tabs'],
  openGraph: { title: site.name, description: site.description, type: 'website', siteName: site.name },
  twitter: { card: 'summary_large_image', title: site.name, description: site.description },
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={sans.variable + ' ' + mono.variable} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen" suppressHydrationWarning>
        <Providers>
          <a href="#main-content" className="skip-link">Skip to content</a>
          {children}
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
