import type { NativeGesture } from 'react-native-gesture-handler';

import { useSingleHeaderScrollComponent } from '../SingleHeader';

declare const gesture: NativeGesture;

// Compile-only cases, checked by tsc: with native header scroll registered the
// hook returns its own wrapper, so it must not promise the input renderer type.
export function SingleHeaderTypeCases() {
  const fromDefault = useSingleHeaderScrollComponent(undefined, gesture);
  // @ts-expect-error A missing renderer can still come back as a wrapper.
  const onlyUndefined: undefined = fromDefault;

  const narrow = useSingleHeaderScrollComponent(
    (_props: { id: string }) => null,
    gesture
  );
  // @ts-expect-error The wrapper returns an element, not only null.
  const onlyNull: ((props: { id: string }) => null) | undefined = narrow;

  const decorated = Object.assign((_props: object) => null, { tag: 'list' });
  const wrapped = useSingleHeaderScrollComponent(decorated, gesture);
  // @ts-expect-error The wrapper does not copy the renderer's own properties.
  const tag: string | undefined = wrapped?.tag;

  return { onlyUndefined, onlyNull, tag };
}
