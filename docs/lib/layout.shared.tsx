import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { gitConfig } from './shared';
import { Brand } from '@/components/brand';
import { ThemeToggle } from '@/components/motion/theme-toggle';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      // JSX supported
      title: <Brand />,
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
    links: [{ text: 'Examples', url: '/examples', active: 'nested-url' }],
    slots: { themeSwitch: ThemeToggle },
  };
}
