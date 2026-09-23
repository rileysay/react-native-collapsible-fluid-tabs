// Shared pull-to-refresh math and release decisions. No native imports so the
// same state transitions can run in worklets and regression tests.

export const PULL_TRIGGER_DISTANCE = 72;
export const PULL_HOLD_OFFSET = 56;
export const PULL_RESISTANCE = 0.5;

export type RefreshTabState = {
  canRefresh: boolean;
  refreshing: boolean;
  pending: boolean;
};

/** Positive pull distance, preserving a partially settled or refreshing pull. */
export function getPullOffset(
  startOffset: number,
  translationY: number,
  startTranslationY: number
): number {
  'worklet';
  return Math.max(
    0,
    startOffset + (translationY - startTranslationY) * PULL_RESISTANCE
  );
}

/**
 * Decide what the releasing finger may do. An invalid pull belongs to a tab or
 * mode that is no longer active; its caller must preserve the new page's scroll
 * position instead of applying a release animation to it.
 */
export function resolvePullRelease({
  canceled,
  validPull,
  pulled,
  startedRefreshing,
  state,
}: {
  canceled: boolean;
  validPull: boolean;
  pulled: number;
  startedRefreshing: boolean;
  state?: RefreshTabState;
}): 'cancel' | 'hold' | 'refresh' | 'release' {
  'worklet';
  if (!validPull) return 'cancel';
  if (!state) return 'release';
  if (state.refreshing || state.pending) return 'hold';
  if (canceled || startedRefreshing || !state.canRefresh) return 'release';
  return pulled >= PULL_TRIGGER_DISTANCE ? 'refresh' : 'release';
}
