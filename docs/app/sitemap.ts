import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/site';
import { source } from '@/lib/source';
export default function sitemap(): MetadataRoute.Sitemap {
  return ['/', '/examples', ...source.getPages().map((page) => page.url)].map((url) => ({ url: new URL(url, getSiteUrl()).toString() }));
}
