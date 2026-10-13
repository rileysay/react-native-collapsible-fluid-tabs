import type { Metadata } from 'next';
import { RecordingStudio } from '@/components/recording-studio';
export const metadata: Metadata = { title: 'Recording studio', robots: { index: false, follow: false } };
export default function Studio() {
  return <main id="main-content" className="examples-main"><div className="page-heading"><span className="eyebrow">RECORDING STUDIO</span><h1>Give your demo a home.</h1><p>Preview a screen recording in a clean iPhone frame. Pick a finish, set the backdrop, and make it presentation-ready.</p></div><RecordingStudio /></main>;
}
