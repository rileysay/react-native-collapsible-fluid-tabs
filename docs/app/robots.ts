import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/site';
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: '/', disallow: ['/studio', '/demo/', '/api/'] }, sitemap: new URL('/sitemap.xml', getSiteUrl()).toString() };
}
