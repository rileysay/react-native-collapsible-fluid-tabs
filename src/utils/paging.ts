// Pure, worklet-safe math for the pager and collapsing header. Kept free of
// Reanimated / RN imports so it runs identically on the UI thread (workletized
// by the Babel plugin) and in plain Jest. The `'worklet'` directives are no-ops
// outside the Reanimated runtime.

/** How far ahead of the release point a flick is projected, in seconds. */
const PROJECTION = 0.12;
/** Velocity (px/s) above which a flick flips the page regardless of distance. */
const FLICK_VELOCITY = 800;

/**
 * Decide which page to land on after a horizontal pan release. A page flips
 * when the projected landing point passes a quarter page, or when the release
 * velocity alone exceeds the flick threshold.
 */
export function resolveSnapIndex(
  currentIndex: number,
  translationX: number,
  velocityX: number,
  pageWidth: number,
  tabCount: number
): number {
  'worklet';
  const projected = translationX + velocityX * PROJECTION;
  if (projected < -pageWidth / 4 || velocityX < -FLICK_VELOCITY) {
    return Math.min(currentIndex + 1, tabCount - 1);
  }
  if (projected > pageWidth / 4 || velocityX > FLICK_VELOCITY) {
    return Math.max(currentIndex - 1, 0);
  }
  return currentIndex;
}

/**
 * Apply rubber-band resistance once a value moves past its bounds, so dragging
 * beyond the first / last page feels springy rather than hard-stopped.
 */
export function rubberBand(
  raw: number,
  minX: number,
  maxX: number,
  resistance: number = 0.3
): number {
  'worklet';
  if (raw > maxX) return maxX + (raw - maxX) * resistance;
  if (raw < minX) return minX + (raw - minX) * resistance;
  return raw;
}

/**
 * Vertical offset for the collapsing header given the active list's scroll
 * position. With `stretch`, overscroll (negative scrollY) pushes the header
 * down; otherwise overscroll is ignored and the header only collapses upward.
 */
export function collapseTranslateY(
  scrollY: number,
  headerHeight: number,
  stretch: boolean
): number {
  'worklet';
  if (scrollY < 0) return stretch ? -scrollY : 0;
  return -Math.min(scrollY, headerHeight);
}

type ScrollOffsetFallback = number | { value: number };

function readFallbackScrollOffset(fallbackScrollY: ScrollOffsetFallback) {
  'worklet';
  return typeof fallbackScrollY === 'number'
    ? fallbackScrollY
    : fallbackScrollY.value;
}

/** Header-visible scroll offset. During a programmatic scroll-to-top animation
 *  the native list may emit scroll events unevenly, so header chrome reads the
 *  UI-thread-driven programmatic offset until the list lands at 0.
 *
 *  On Android `stretch`, pull-to-refresh is driven synthetically via the
 *  mirrored `scrollY` while the native list stays at offset 0 — prefer that
 *  negative fallback over the per-page value so the chrome rides the pull. */
export function getHeaderScrollOffset(
  activeIndex: number,
  tabCount: number,
  perPageScrollY: readonly { value: number }[],
  fallbackScrollY: ScrollOffsetFallback,
  scrollToTopIndex: number,
  scrollToTopOffset: number
): number {
  'worklet';
  if (tabCount <= 0) return readFallbackScrollOffset(fallbackScrollY);
  const i = Math.max(0, Math.min(activeIndex, tabCount - 1));
  if (scrollToTopIndex === i) return scrollToTopOffset;
  const fallback = readFallbackScrollOffset(fallbackScrollY);
  const pageY = perPageScrollY[i];
  const pageOffset = pageY ? pageY.value : fallback;
  // `<= 1` matches the custom pull's own at-top checks (enable + preserve
  // guards): lists can rest at fractional offsets, which must not mask the
  // negative pull.
  if (fallback < 0 && pageOffset <= 1) return fallback;
  return pageOffset;
}
