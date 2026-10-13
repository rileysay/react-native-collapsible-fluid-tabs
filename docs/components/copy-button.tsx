'use client';

import { useEffect, useRef, useState } from 'react';
import { Copy } from 'reicon-react/icons/Copy';
import { Check } from 'reicon-react/icons/Check';

export function CopyButton({ text, label = 'Copy code', className = '' }: { text: string; label?: string; className?: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timeout.current), []);
  async function copy() {
    try { await navigator.clipboard.writeText(text); setStatus('copied'); }
    catch { setStatus('error'); }
    clearTimeout(timeout.current);
    timeout.current = setTimeout(() => setStatus('idle'), 2400);
  }
  return <button type="button" onClick={copy} className={'icon-button copy-button ' + className} aria-label={status === 'copied' ? 'Copied' : label} title={status === 'error' ? 'Select the text and copy it manually' : label}>
    {status === 'copied' ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
    <span className="sr-only" role="status">{status === 'copied' ? 'Copied to clipboard' : status === 'error' ? 'Clipboard unavailable. Select the text to copy it.' : ''}</span>
  </button>;
}
