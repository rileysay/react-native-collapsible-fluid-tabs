/// <reference lib="dom" />

import {
  useCallback,
  useEffect,
  useState,
  type ComponentRef,
  type RefCallback,
} from 'react';
import type { View } from 'react-native';

import type { WebWheelScrollOptions } from './useWebWheelScroll';

const WHEEL_DURATION = 140;
let nextListenerId = 1000000;

type WheelRun = {
  index: number;
  expectedOffset: number;
  from: number;
  target: number;
  startedAt: number;
  direction: number;
};

function isElement(value: unknown): value is HTMLElement {
  return !!value && (value as HTMLElement).nodeType === 1;
}

function getScroller(ref: WebWheelScrollOptions['listRefs'][number]) {
  // Reanimated's web AnimatedRef resolves getScrollableNode/getNativeScrollRef.
  // The fallback also supports a ref whose public instance exposes the node.
  const resolved: unknown = ref?.();
  if (isElement(resolved)) return resolved;
  const instance = ref?.current;
  const node: unknown =
    instance?.getScrollableNode?.() ?? instance?.getNativeScrollRef?.();
  return isElement(node) ? node : null;
}

function hasIndependentTarget(
  target: Element,
  root: HTMLElement,
  scroller: HTMLElement,
  win: Window
) {
  if (
    target.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="slider"]'
    )
  )
    return true;

  for (
    let node: Element | null = target;
    node && node !== root;
    node = node.parentElement
  ) {
    if (node === scroller) return false;
    const style = win.getComputedStyle(node);
    if (
      (/auto|scroll/.test(style.overflowY) &&
        node.scrollHeight > node.clientHeight) ||
      (/auto|scroll/.test(style.overflowX) &&
        node.scrollWidth > node.clientWidth)
    )
      return true;
  }
  return false;
}

/** Keep browser wheel scrolling and the sibling header on one frame clock. */
export function useWebWheelScroll({
  activeIndex,
  perPageScrollY,
  listRefs,
  headerScroll,
  cancelScrollToTop,
  headerScrollEnabled,
  reduceMotion,
}: WebWheelScrollOptions): RefCallback<ComponentRef<typeof View>> {
  const [host, setHost] = useState<ComponentRef<typeof View> | null>(null);
  const ref = useCallback(
    (node: ComponentRef<typeof View> | null) => setHost(node),
    []
  );

  useEffect(() => {
    const root = host as unknown as HTMLElement | null;
    const win = root?.ownerDocument?.defaultView;
    if (!root || !win) return;

    let run: WheelRun | null = null;
    let frame: number | null = null;

    // A pointer gesture or imperative scroll may take the same controller.
    // Release only the index/offset pair that this wheel run last wrote.
    const ownsController = () =>
      run !== null &&
      headerScroll.index.value === run.index &&
      Math.abs(headerScroll.offset.value - run.expectedOffset) < 0.01;

    const stop = () => {
      if (frame !== null) win.cancelAnimationFrame(frame);
      frame = null;
      const owned = ownsController();
      run = null;
      if (owned) headerScroll.cancel(false);
    };

    const tick = (time: number) => {
      frame = null;
      if (!run) return;
      if (
        !ownsController() ||
        activeIndex.value !== run.index ||
        !headerScroll.canScroll()
      ) {
        stop();
        return;
      }
      const max = headerScroll.maxOffset();
      run.target = Math.max(0, Math.min(max, run.target));
      const progress = Math.min(
        1,
        Math.max(0, (time - run.startedAt) / WHEEL_DURATION)
      );
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.max(
        0,
        Math.min(max, run.from + (run.target - run.from) * eased)
      );
      headerScroll.move(value);
      run.expectedOffset = headerScroll.offset.value;
      if (progress === 1) stop();
      else frame = win.requestAnimationFrame(tick);
    };

    const onWheel = (event: WheelEvent) => {
      if (
        event.defaultPrevented ||
        !event.cancelable ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        !Number.isFinite(event.deltaY) ||
        event.deltaY === 0 ||
        Math.abs(event.deltaX) >= Math.abs(event.deltaY)
      ) {
        stop();
        return;
      }
      const target = event.target;
      const index = activeIndex.value;
      const scroller = getScroller(listRefs[index]!);
      if (!isElement(target) || !scroller || !root.contains(scroller)) {
        stop();
        return;
      }
      const page = target.closest('[data-fluid-tabs-page]');
      if (
        (page && page.getAttribute('data-fluid-tabs-page') !== String(index)) ||
        (!page && !headerScrollEnabled) ||
        !headerScroll.canScroll() ||
        hasIndependentTarget(target, root, scroller, win)
      ) {
        stop();
        return;
      }

      if (run && (!ownsController() || run.index !== index)) stop();
      const lineHeight =
        parseFloat(win.getComputedStyle(scroller).lineHeight) || 16;
      const unit =
        event.deltaMode === 1
          ? lineHeight
          : event.deltaMode === 2
            ? scroller.clientHeight
            : 1;
      const delta = event.deltaY * unit;
      const max = headerScroll.maxOffset();
      const current = run?.expectedOffset ?? perPageScrollY[index]?.value ?? 0;
      // Leave scrolling at either edge to the browser's normal scroll chain.
      if ((delta < 0 && current <= 0) || (delta > 0 && current >= max)) {
        stop();
        return;
      }

      if (!run) {
        cancelScrollToTop();
        if (!headerScroll.begin()) return;
        run = {
          index,
          expectedOffset: headerScroll.offset.value,
          from: headerScroll.offset.value,
          target: headerScroll.offset.value,
          startedAt: win.performance.now(),
          direction: Math.sign(delta),
        };
      }
      event.preventDefault();

      // Fine pixel deltas already describe continuous trackpad motion.
      const coarse =
        event.deltaMode !== 0 ||
        (Math.abs(delta) >= 50 && Number.isInteger(delta));
      if (reduceMotion || !coarse) {
        headerScroll.move(
          Math.max(0, Math.min(max, run.expectedOffset + delta))
        );
        run.expectedOffset = headerScroll.offset.value;
        stop();
        return;
      }

      const sameDirection = run.direction === Math.sign(delta);
      run.from = run.expectedOffset;
      run.target = Math.max(
        0,
        Math.min(max, (sameDirection ? run.target : run.from) + delta)
      );
      run.direction = Math.sign(delta);
      run.startedAt = win.performance.now();
      if (frame === null) frame = win.requestAnimationFrame(tick);
    };

    const listenerId = nextListenerId++;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        [
          'ArrowUp',
          'ArrowDown',
          'PageUp',
          'PageDown',
          'Home',
          'End',
          ' ',
        ].includes(event.key)
      )
        stop();
    };
    activeIndex.addListener(listenerId, stop);
    root.addEventListener('wheel', onWheel, { passive: false });
    root.addEventListener('pointerdown', stop, true);
    root.addEventListener('touchstart', stop, true);
    root.addEventListener('keydown', onKeyDown, true);
    return () => {
      stop();
      activeIndex.removeListener(listenerId);
      root.removeEventListener('wheel', onWheel);
      root.removeEventListener('pointerdown', stop, true);
      root.removeEventListener('touchstart', stop, true);
      root.removeEventListener('keydown', onKeyDown, true);
    };
  }, [
    host,
    activeIndex,
    perPageScrollY,
    listRefs,
    headerScroll,
    cancelScrollToTop,
    headerScrollEnabled,
    reduceMotion,
  ]);

  return ref;
}
