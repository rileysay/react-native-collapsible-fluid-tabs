import Link from 'next/link';
import { Brand } from '@/components/brand';
export default function NotFound() {
  return <main id="main-content" className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center"><Link href="/"><Brand /></Link><span className="eyebrow">404</span><h1 className="text-4xl tracking-tight">Page not found</h1><p className="text-fd-muted-foreground">The page may have moved or the link may be incorrect.</p><Link href="/docs" className="button button-primary">Back to the docs →</Link></main>;
}
