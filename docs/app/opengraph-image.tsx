import { ImageResponse } from 'next/og';
export const alt = 'Fluid Tabs — Some things just flow.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export default function Image() {
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#ffffff', padding: 70, color: '#171717' }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}><div style={{ display: 'flex', gap: 5 }}><div style={{ background: '#171717', width: 11, height: 30, borderRadius: 7 }} /><div style={{ background: '#171717', width: 11, height: 30, borderRadius: 7, marginTop: 9 }} /><div style={{ background: '#171717', width: 11, height: 30, borderRadius: 7 }} /></div><span style={{ fontSize: 30 }}>fluidtabs.</span></div>
      <div style={{ display: 'flex', flexDirection: 'column' }}><span style={{ fontSize: 86, letterSpacing: -5 }}>Some things just flow.</span><span style={{ fontSize: 27, marginTop: 22, color: '#737373' }}>Collapsing headers. Swipeable tabs. Synchronized scrolling.</span></div>
      <div style={{ display: 'flex', fontSize: 19, color: '#171717', justifyContent: 'space-between' }}><span>REACT NATIVE · iOS · ANDROID · WEB</span><span>Open source. MIT licensed.</span></div>
    </div>, size,
  );
}
