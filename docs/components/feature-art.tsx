'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';

export function FeatureArt({ children, className = '' }: { children: ReactNode; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let intersecting = false;
    const update = () => setVisible(intersecting && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      intersecting = entry.isIntersecting && entry.intersectionRatio >= 0.25;
      update();
    }, { threshold: 0.25 });
    observer.observe(element);
    document.addEventListener('visibilitychange', update);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  return <div ref={root} className={`feature-art ${className}`} data-running={visible} aria-hidden="true">{children}</div>;
}
