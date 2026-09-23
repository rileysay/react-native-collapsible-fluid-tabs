import { useMemo } from 'react';
import {
  GestureStateManager,
  type usePanGesture,
} from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';

import {
  resolvePanDirection,
  type DirectionConfig,
  type PanDirection,
} from '../utils/gestureDirection';

type PanConfig = NonNullable<Parameters<typeof usePanGesture>[0]>;
type DirectionCallbacks = Required<
  Pick<
    PanConfig,
    'onTouchesDown' | 'onTouchesMove' | 'onTouchesUp' | 'onTouchesCancel'
  >
>;
type TouchStart = {
  id: number;
  x: number;
  y: number;
};

/**
 * Both recognizers use this classifier with identical thresholds. Each keeps
 * its own touch lifetime because their hit regions and enabled states differ.
 * They can only activate for opposite outcomes, regardless of callback order.
 */
export function useDirectionalPan(
  direction: 'horizontal' | 'vertical' | 'down',
  config: DirectionConfig,
  canActivate?: (translationY: number) => boolean
): DirectionCallbacks {
  const touchStart = useSharedValue<TouchStart | null>(null);
  const decision = useSharedValue<PanDirection | 'rejected'>('undecided');

  return useMemo<DirectionCallbacks>(
    () => ({
      onTouchesDown: (event) => {
        'worklet';
        if (event.allTouches.length !== 1) {
          // An extra finger must not choose an axis by moving the centroid.
          // Once active, RNGH's continuous translation handles pointer changes.
          if (decision.value === 'undecided') {
            decision.value = 'rejected';
            GestureStateManager.fail(event.handlerTag);
          }
          return;
        }
        const touch = event.allTouches[0]!;
        touchStart.value = {
          id: touch.id,
          x: touch.absoluteX,
          y: touch.absoluteY,
        };
        decision.value = 'undecided';
      },
      onTouchesMove: (event) => {
        'worklet';
        if (decision.value !== 'undecided') return;
        const start = touchStart.value;
        const touch = event.allTouches.find((value) => value.id === start?.id);
        if (!start || !touch) {
          decision.value = 'rejected';
          GestureStateManager.fail(event.handlerTag);
          return;
        }
        // Window coordinates remain stable as the header/list moves underneath
        // the finger, including while catching a fling or a scroll-to-top.
        const dy = touch.absoluteY - start.y;
        const next = resolvePanDirection(touch.absoluteX - start.x, dy, config);
        if (next === 'undecided') return;
        decision.value = next;
        const matches =
          direction === 'horizontal'
            ? next === 'horizontal'
            : next === 'vertical' && (direction === 'vertical' || dy > 0);
        if (matches && (!canActivate || canActivate(dy))) {
          GestureStateManager.activate(event.handlerTag);
        } else {
          GestureStateManager.fail(event.handlerTag);
        }
      },
      onTouchesUp: (event) => {
        'worklet';
        // Release an undecided tap without starting an animation or refresh.
        if (decision.value === 'undecided') {
          decision.value = 'rejected';
          GestureStateManager.fail(event.handlerTag);
        }
      },
      onTouchesCancel: () => {
        'worklet';
        decision.value = 'rejected';
        // RNGH owns cancellation/finalization of an already active pan.
      },
    }),
    [canActivate, config, decision, direction, touchStart]
  );
}
