'use client';

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/motion/tabs';
import { CopyButton } from './copy-button';
import { site } from '@/lib/site';

const managers = ['npm', 'pnpm', 'yarn', 'bun'] as const;
export function InstallCommand({ peers = false }: { peers?: boolean }) {
  const [manager, setManager] = useState('npm');
  const command = (key: string) => key + (key === 'npm' ? ' install ' : ' add ') + (peers ? 'react-native-reanimated react-native-gesture-handler react-native-safe-area-context react-native-worklets' : site.packageName);
  return (
    <Tabs value={manager} onValueChange={setManager} variant="underline" className="install-widget">
      <div className="install-widget-top"><TabsList className="package-manager-tabs">{managers.map((item) => <TabsTrigger key={item} value={item}>{item}</TabsTrigger>)}</TabsList><span className="install-language">Terminal</span></div>
      {managers.map((item) => <TabsContent key={item} value={item} className="install-command"><span className="command-prompt" aria-hidden="true">$</span><code>{command(item)}</code><CopyButton text={command(item)} label="Copy installation command" /></TabsContent>)}
    </Tabs>
  );
}
