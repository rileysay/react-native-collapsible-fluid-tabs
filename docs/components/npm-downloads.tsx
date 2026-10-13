import { site } from '@/lib/site';

export async function NpmDownloads() {
  let stats: { downloads: number; start: string; end: string };
  try {
    const response = await fetch(`https://api.npmjs.org/downloads/point/last-month/${site.packageName}`, {
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!Number.isSafeInteger(data.downloads) || data.downloads < 0 ||
      typeof data.start !== 'string' || typeof data.end !== 'string') return null;

    stats = data;
  } catch {
    return null;
  }
  return (
    <a className="npm-downloads" href={site.npm} title={`npm downloads · ${stats.start} to ${stats.end}`}>
      <span>{new Intl.NumberFormat('en').format(stats.downloads)}</span> monthly downloads{' '}
      <span className="npm-downloads-source">on npm</span>
    </a>
  );
}
