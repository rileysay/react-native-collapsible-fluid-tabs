export type PanDirection = 'undecided' | 'horizontal' | 'vertical';

export type DirectionConfig = {
  horizontalDistance: number;
  verticalDistance: number;
  ratio: number;
};

export const DEFAULT_SWIPE_ACTIVATION = 15;
export const DEFAULT_SWIPE_FAIL = 10;
export const DEFAULT_SWIPE_DIRECTION_RATIO = 1.4;

/** Shared direction boundary for paging, chrome drags, and content gestures. */
export function resolvePanDirection(
  translationX: number,
  translationY: number,
  { horizontalDistance, verticalDistance, ratio }: DirectionConfig
): PanDirection {
  'worklet';
  const x = Math.abs(translationX);
  const y = Math.abs(translationY);
  if (x === 0 && y === 0) return 'undecided';

  if (x >= horizontalDistance && x > y && x >= y * ratio) {
    return 'horizontal';
  }
  if (y >= verticalDistance && y >= x * ratio) {
    return 'vertical';
  }

  // Bound the extra travel for an ambiguous diagonal. Prefer scrolling once
  // it reaches twice the larger activation distance (30 points by default).
  if (Math.max(x, y) >= 2 * Math.max(horizontalDistance, verticalDistance)) {
    return 'vertical';
  }
  return 'undecided';
}
