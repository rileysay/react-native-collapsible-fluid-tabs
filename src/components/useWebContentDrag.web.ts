/// <reference lib="dom" />

import { useCallback, useEffect, useMemo } from 'react';
import {
  GestureStateManager,
  MouseButton,
  PointerType,
  usePanGesture,
} from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';

import { useDirectionalPan } from './useDirectionalPan';
import type { WebContentDragOptions } from './useWebContentDrag';

export function useWebContentDrag({
  directionConfig,
  activeIndex,
  listRefs,
  headerScroll,
  cancelScrollToTop,
}: WebContentDragOptions) {
  const owner = useSharedValue(-1);
  const dragging = useSharedValue(false);
  const lastTranslation = useSharedValue(0);
  const velocity = useSharedValue(0);
  const canActivate = useCallback(
    () =>
      owner.value === activeIndex.value &&
      headerScroll.canScroll() &&
      headerScroll.maxOffset() > 0,
    [activeIndex, headerScroll, owner]
  );
  const direction = useDirectionalPan('vertical', directionConfig, canActivate);

  const canDragAt = useCallback(
    (x: number, y: number) => {
      const scroller = listRefs[activeIndex.value]?.() as unknown as
        | HTMLElement
        | undefined;
      const doc = scroller?.ownerDocument;
      const target = doc?.elementFromPoint(x, y);
      if (!scroller || !target || !scroller.contains(target)) return false;
      if (
        target.closest(
          'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="slider"], [role="switch"]'
        )
      )
        return false;
      for (let node = target; node !== scroller; node = node.parentElement!) {
        const style = doc!.defaultView!.getComputedStyle(node);
        if (
          (/auto|scroll/.test(style.overflowY) &&
            node.scrollHeight > node.clientHeight) ||
          (/auto|scroll/.test(style.overflowX) &&
            node.scrollWidth > node.clientWidth)
        )
          return false;
      }
      return true;
    },
    [activeIndex, listRefs]
  );

  useEffect(
    () => () => {
      if (dragging.value && headerScroll.index.value === owner.value)
        headerScroll.cancel(false);
    },
    [dragging, headerScroll, owner]
  );

  return usePanGesture(
    useMemo<NonNullable<Parameters<typeof usePanGesture>[0]>>(
      () => ({
        manualActivation: true,
        mouseButton: MouseButton.LEFT,
        activeCursor: 'grabbing',
        testID: 'fluid-tabs-mouse-scroll',
        ...direction,
        onTouchesDown: (event) => {
          'worklet';
          const touch = event.allTouches[0];
          if (
            event.pointerType !== PointerType.MOUSE ||
            event.allTouches.length !== 1 ||
            !touch ||
            !canDragAt(touch.absoluteX, touch.absoluteY)
          ) {
            owner.value = -1;
            GestureStateManager.fail(event.handlerTag);
            return;
          }
          owner.value = activeIndex.value;
          direction.onTouchesDown(event);
        },
        onActivate: (event) => {
          'worklet';
          if (!canActivate()) {
            GestureStateManager.fail(event.handlerTag);
            return;
          }
          cancelScrollToTop();
          dragging.value = headerScroll.begin();
          lastTranslation.value = event.translationY;
          velocity.value = 0;
        },
        onUpdate: (event) => {
          'worklet';
          if (
            !dragging.value ||
            !canActivate() ||
            headerScroll.index.value !== owner.value
          )
            return;
          const delta = event.translationY - lastTranslation.value;
          lastTranslation.value = event.translationY;
          velocity.value = -event.velocityY;
          headerScroll.move(headerScroll.offset.value - delta);
        },
        onFinalize: (event) => {
          'worklet';
          if (dragging.value && headerScroll.index.value === owner.value) {
            if (event.canceled || !canActivate()) headerScroll.cancel(false);
            else headerScroll.finish(velocity.value);
          }
          dragging.value = false;
          owner.value = -1;
        },
      }),
      [
        activeIndex,
        canActivate,
        canDragAt,
        cancelScrollToTop,
        direction,
        dragging,
        headerScroll,
        lastTranslation,
        owner,
        velocity,
      ]
    )
  );
}
