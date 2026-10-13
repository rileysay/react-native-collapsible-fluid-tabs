'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Maximize } from 'reicon-react/icons/Maximize';
import { PhoneFrame } from './phone-frame';

const backgrounds = { White: '#ffffff', Mist: '#eeeeee', Graphite: '#262626', Black: '#000000' };
export function RecordingStudio() {
  const [video, setVideo] = useState<string>();
  const [fileName, setFileName] = useState('');
  const [mime, setMime] = useState('');
  const [color, setColor] = useState<'silver' | 'black'>('black');
  const [background, setBackground] = useState<keyof typeof backgrounds>('Mist');
  const [fit, setFit] = useState<'contain' | 'cover'>('contain');
  const [error, setError] = useState('');
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => () => { if (video) URL.revokeObjectURL(video); }, [video]);
  return <div className="studio-layout">
    <div className="studio-controls">
      <div><label htmlFor="recording">Your recording or screenshot</label><input id="recording" type="file" accept="video/mp4,video/webm,video/quicktime,image/gif,image/png,image/webp,image/jpeg" onChange={(event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('video/') && !/^image\/(gif|png|webp|jpeg)$/.test(file.type)) { setError('Choose an MP4, WebM, MOV, GIF, or screenshot.'); return; }
        setError(''); setFileName(file.name); setMime(file.type); setVideo(URL.createObjectURL(file));
      }} /><p className="studio-help mt-3">Your recording stays in this browser. Nothing is uploaded or saved to the site.</p></div>
      <div><span className="studio-control-label">Device finish</span><div className="studio-swatches">{(['silver', 'black'] as const).map((item) => <button key={item} aria-pressed={color === item} onClick={() => setColor(item)}>{item === 'silver' ? 'Silver' : 'Space black'}</button>)}</div></div>
      <div><span className="studio-control-label">Backdrop</span><div className="studio-swatches">{(Object.keys(backgrounds) as Array<keyof typeof backgrounds>).map((item) => <button key={item} aria-pressed={background === item} onClick={() => setBackground(item)}>{item}</button>)}</div></div>
      <div><span className="studio-control-label">Video fit</span><div className="studio-swatches"><button aria-pressed={fit === 'contain'} onClick={() => setFit('contain')}>Show full recording</button><button aria-pressed={fit === 'cover'} onClick={() => setFit('cover')}>Fill frame</button></div></div>
      <button className="button button-primary self-start" onClick={async () => { try { await stage.current?.requestFullscreen(); } catch { setError('Fullscreen is unavailable in this browser. The inline preview still works.'); } }}>Present fullscreen <Maximize size={18} aria-hidden="true" /></button>
      {error && <p role="alert" className="studio-error">{error}</p>}
      <p className="studio-help">For the website, put your finished MP4 in <code>public/demos/</code> and add its path in <code>lib/demos.ts</code>. The homepage and examples page share the same recording.</p>
    </div>
    <div ref={stage} className="studio-stage" style={{ background: backgrounds[background] }}>
      <PhoneFrame color={color}>{video ? mime.startsWith('image/') ? <Image src={video} alt={'Preview: ' + fileName} width={390} height={830} unoptimized className="demo-video" style={{ objectFit: fit }} onError={() => setError('This image could not be loaded. Try a PNG, GIF, or WebP.')} /> : <video key={video} className="demo-video" src={video} style={{ objectFit: fit }} controls loop muted playsInline aria-label={'Preview: ' + fileName} onError={() => setError('This codec is unsupported by your browser. Export an H.264 MP4 or a WebM.')} /> : <div className="studio-placeholder"><strong>Your next<br />great scroll.</strong><span>Add a recording to see it here.</span></div>}</PhoneFrame>
    </div>
  </div>;
}
