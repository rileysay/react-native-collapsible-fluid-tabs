import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';

export default function Layout({ children }: LayoutProps<'/'>) {
  return <><SiteHeader />{children}<SiteFooter /></>;
}
