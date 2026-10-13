export const site = {
  name: 'Fluid Tabs',
  packageName: 'react-native-collapsible-fluid-tabs',
  description:
    'Collapsing headers, swipeable tabs, and scrolling that stays in sync. Build fluid React Native interfaces with a composable, typed API.',
  github: 'https://github.com/rileysay/react-native-collapsible-fluid-tabs',
  npm: 'https://www.npmjs.com/package/react-native-collapsible-fluid-tabs',
  author: 'Riley',
};

export function getSiteUrl() {
  const url = process.env.SITE_URL;
  if (url) return new URL(url);
  const deployment = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  return new URL(deployment ? 'https://' + deployment : 'http://localhost:3000');
}
