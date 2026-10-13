/**
 * Add recordings to public/demos/ and set the corresponding video path below.
 * MP4 (H.264) is the most portable choice; WebM is also supported.
 * Record just the screen: the website adds the device frame.
 * See public/demos/README.md for sizes, posters, and the preview studio.
 */
export type Demo = {
  id: string;
  title: string;
  description: string;
  video?: string;
  image?: string;
  poster?: string;
  fit?: 'cover' | 'contain';
};

export const demos: Demo[] = [
  {
    id: 'profile',
    title: 'Profile',
    description: 'A collapsing header, a pinned tab bar, and a scrollable feed.',
  },
  {
    id: 'swipe',
    title: 'Paging',
    description: 'Move between pages while the header and scroll positions stay in sync.',
  },
  {
    id: 'refresh',
    title: 'Refresh and tabs',
    description: 'Pull to refresh and adaptive tab bars.',
  },
];
