import { useCallback, useEffect, useRef, useState } from 'react';
import type { ImageSourcePropType } from 'react-native';

export type DemoScreen = 'home' | 'x' | 'instagram' | 'lab';

export interface Photo {
  id: string;
  source: ImageSourcePropType;
  title: string;
  caption: string;
  color: string;
}

// Bundled assets keep scrolling and image loading consistent when testing offline.
export const PHOTOS: Photo[] = [
  {
    id: 'coast',
    source: require('../assets/photos/coast.jpg'),
    title: 'Saltwater therapy',
    caption: 'No plans. Just the tide, a camera, and a very long walk.',
    color: '#8ba7a2',
  },
  {
    id: 'mountains',
    source: require('../assets/photos/mountains.jpg'),
    title: 'A little perspective',
    caption: 'The best part of an early start is having this all to yourself.',
    color: '#9ba6aa',
  },
  {
    id: 'lake',
    source: require('../assets/photos/lake.jpg'),
    title: 'Somewhere quiet',
    caption: 'Taking the scenic route. Always.',
    color: '#75877d',
  },
  {
    id: 'forest',
    source: require('../assets/photos/forest.jpg'),
    title: 'Out of office',
    caption: 'A reminder to look up every once in a while.',
    color: '#60735c',
  },
  {
    id: 'dunes',
    source: require('../assets/photos/dunes.jpg'),
    title: 'Chasing the light',
    caption: 'Stayed for one more photo. And then one more.',
    color: '#b1a078',
  },
  {
    id: 'night',
    source: require('../assets/photos/night.jpg'),
    title: 'After hours',
    caption: 'Nothing on the agenda but this view.',
    color: '#7e7e95',
  },
];

export const GALLERY = Array.from({ length: 60 }, (_, i) => ({
  ...PHOTOS[i % PHOTOS.length]!,
  id: `photo-${i}`,
}));

export interface Post {
  id: string;
  text: string;
  time: string;
  photo?: Photo;
  likes: number;
}
export const POSTS: Post[] = Array.from({ length: 36 }, (_, i) => ({
  id: `post-${i}`,
  text:
    i % 3 === 1
      ? 'Trying to get better at noticing the small things. The light on the way home. A street you haven’t taken before. There’s usually a photo in there somewhere.'
      : PHOTOS[i % PHOTOS.length]!.caption,
  time: i < 3 ? `${i + 1}h` : `${i + 1}d`,
  photo: i % 3 === 1 ? undefined : PHOTOS[i % PHOTOS.length],
  likes: 128 + i * 17,
}));
export const REPLIES: Post[] = POSTS.map((post, i) => ({
  ...post,
  id: `reply-${i}`,
  photo: undefined,
  text: [
    'That early morning light is always worth the alarm.',
    'Thank you! This was one of those days where everything just came together.',
    'The long way home is usually the good one.',
  ][i % 3]!,
}));
export const LIKED_POSTS = [...POSTS].reverse();
export const TAGGED_PHOTOS = [...GALLERY].reverse();

export const keyById = (item: { id: string }) => item.id;
export const photoItemType = () => 'photo';
export const postItemType = (item: Post) =>
  item.photo ? 'photo-post' : 'text-post';

export function useDemoRefresh() {
  const [refreshing, setRefreshing] = useState(false);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (pending.current !== null) clearTimeout(pending.current);
    },
    []
  );
  const onRefresh = useCallback(() => {
    if (pending.current !== null) return;
    setRefreshing(true);
    pending.current = setTimeout(() => {
      pending.current = null;
      setRefreshing(false);
    }, 1500);
  }, []);
  return { refreshing, onRefresh };
}
