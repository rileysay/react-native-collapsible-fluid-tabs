import type { ReactNode } from 'react';
import Image from 'next/image';

export const PHONE_SAFE_AREA_TOP = 58;

export function PhoneFrame({ children, color = 'black', className = '', statusBar = false }: {
  children: ReactNode;
  color?: 'silver' | 'black';
  className?: string;
  statusBar?: boolean;
}) {
  return (
    <div className={'phone-container ' + className}>
      <div className="phone-shell">
        <div className="phone-screen">
          {statusBar && <>
            <div className="phone-status-backdrop" style={{ height: PHONE_SAFE_AREA_TOP }} aria-hidden="true" />
            <div className="phone-status" style={{ height: PHONE_SAFE_AREA_TOP }} aria-hidden="true"><span>9:41</span><span className="phone-status-right"><span className="signal-bars"><i /><i /><i /><i /></span><span className="phone-battery" /></span></div>
          </>}
          <div className="phone-content">{children}</div>
        </div>
        <Image src={'/devices/iphone-18-pro-' + color + '.png'} alt="" aria-hidden="true" width={1350} height={2760} sizes="300px" draggable={false} className="phone-bezel" />
      </div>
    </div>
  );
}
