import { useCallback } from 'react';
import type { AnimatedRef, SharedValue } from 'react-native-reanimated';

import { setScrollRef } from '../utils/scrollRef';

export function useTrackedScrollRef(
  ref: AnimatedRef<any> | undefined,
  mounted: SharedValue<boolean> | undefined
) {
  return useCallback(
    (instance: any | null) => {
      if (ref && mounted) setScrollRef(ref, mounted, instance);
    },
    [mounted, ref]
  );
}
