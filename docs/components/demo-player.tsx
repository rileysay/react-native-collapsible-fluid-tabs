'use client';

import { useState } from 'react';
import Image from 'next/image';
import { PhoneFrame, PHONE_SAFE_AREA_TOP } from './phone-frame';
import type { Demo } from '@/lib/demos';

export function DemoPlayer({ demo, className = '', color = 'black' }: {
  demo: Demo; className?: string; color?: 'silver' | 'black';
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={'demo-player ' + className}>
      <PhoneFrame color={color} statusBar={!demo.video && !demo.image}>
        {demo.video ? <video className="demo-video" src={demo.video} poster={demo.poster} style={{ objectFit: demo.fit ?? 'contain' }} controls muted loop playsInline preload="metadata" aria-label={demo.title + ' demonstration'} onError={() => setFailed(true)} /> : demo.image ? <Image src={demo.image} alt={demo.title + ' demonstration'} width={390} height={830} unoptimized className="demo-video" style={{ objectFit: demo.fit ?? 'contain' }} onError={() => setFailed(true)} /> : <>
          <iframe src="/demo" data-phone-safe-area-top={PHONE_SAFE_AREA_TOP} title="Interactive React Native Fluid Tabs web example" className="native-demo" onError={() => setFailed(true)} />
        </>}
        {failed && <div className="demo-loading" role="status"><span>The preview couldn’t load.</span><a href="/demo/index.html" target="_blank" rel="noreferrer">Open the web example ↗</a></div>}
      </PhoneFrame>
    </div>
  );
}
