// Pure, worklet-safe math for the pager and collapsing header. Kept free of
// Reanimated / RN imports so it runs identically on the UI thread (workletized
// by the Babel plugin) and in plain Jest. The `'worklet'` directives are no-ops
// outside the Reanimated runtime.

/** How far ahead of the release point a flick is projected, in seconds. */
const PROJECTION = 0.12;
/** Velocity (points/s) above which a flick flips the page regardless of distance. */
const FLICK_VELOCITY = 800;

/** Normalize public indices before indexing arrays or positioning the pager. */
export function clampTabIndex(index: number, tabCount: number): number {
  'worklet';
  const finiteIndex = Number.isFinite(index) ? index : 0;
  return Math.max(0, Math.min(Math.round(finiteIndex), tabCount - 1));
}

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
  tabCount: number,
  canceled: boolean = false
): number {
  'worklet';
  const index = clampTabIndex(currentIndex, tabCount);
  if (
    canceled ||
    tabCount <= 1 ||
    !Number.isFinite(pageWidth) ||
    pageWidth <= 0
  ) {
    return index;
  }

  // A fast reversal follows the release velocity in either direction. Checking
  // projected distance first made identical mirrored flicks behave differently.
  if (Math.abs(velocityX) > FLICK_VELOCITY) {
    return clampTabIndex(index + (velocityX < 0 ? 1 : -1), tabCount);
  }
  const projected = translationX + velocityX * PROJECTION;
  if (projected < -pageWidth / 4) {
    return Math.min(index + 1, tabCount - 1);
  }
  if (projected > pageWidth / 4) {
    return Math.max(index - 1, 0);
  }
  return index;
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
/** Scroll distance over which the collapsible header may collapse. */
export function getHeaderCollapseRange(
  headerHeight: number,
  minHeaderHeight: number = 0
): number {
  'worklet';
  const h = Math.max(0, headerHeight);
  const min = Math.min(Math.max(0, minHeaderHeight), h);
  return h - min;
}

export function collapseTranslateY(
  scrollY: number,
  headerHeight: number,
  stretch: boolean,
  minHeaderHeight: number = 0
): number {
  'worklet';
  if (scrollY < 0) return stretch ? -scrollY : 0;
  const range = getHeaderCollapseRange(headerHeight, minHeaderHeight);
  return -Math.min(scrollY, range);
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
  const i = clampTabIndex(activeIndex, tabCount);
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
