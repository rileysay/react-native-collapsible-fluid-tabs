import {
  getPullOffset,
  PULL_HOLD_OFFSET,
  PULL_TRIGGER_DISTANCE,
  resolvePullRelease,
  type RefreshTabState,
} from '../refresh';

const idle: RefreshTabState = {
  canRefresh: true,
  refreshing: false,
  pending: false,
};

describe('getPullOffset', () => {
  it('applies resistance only to movement after activation', () => {
    expect(getPullOffset(0, 6, 6)).toBe(0);
    expect(getPullOffset(0, 106, 6)).toBe(50);
  });

  it('keeps an existing refresh hold when another finger starts pulling', () => {
    expect(getPullOffset(PULL_HOLD_OFFSET, 6, 6)).toBe(PULL_HOLD_OFFSET);
    expect(getPullOffset(PULL_HOLD_OFFSET, 26, 6)).toBe(66);
  });

  it('preserves a pull caught midway through its settling animation', () => {
    expect(getPullOffset(23, 8, 8)).toBe(23);
    expect(getPullOffset(23, 18, 8)).toBe(28);
  });

  it('allows retracting the baseline upward without negative pull distances', () => {
    expect(getPullOffset(PULL_HOLD_OFFSET, -14, 6)).toBe(46);
    expect(getPullOffset(PULL_HOLD_OFFSET, -200, 6)).toBe(0);
  });
});

describe('resolvePullRelease', () => {
  const release = (
    overrides: Partial<Parameters<typeof resolvePullRelease>[0]> = {}
  ) =>
    resolvePullRelease({
      canceled: false,
      validPull: true,
      pulled: PULL_TRIGGER_DISTANCE,
      startedRefreshing: false,
      state: idle,
      ...overrides,
    });

  it('requests refresh only when an idle enabled pull reaches the threshold', () => {
    expect(release({ pulled: PULL_TRIGGER_DISTANCE - 0.1 })).toBe('release');
    expect(release()).toBe('refresh');
    expect(release({ pulled: PULL_TRIGGER_DISTANCE + 100 })).toBe('refresh');
  });

  it('does not refresh after the OS cancels a long pull', () => {
    expect(release({ canceled: true, pulled: 200 })).toBe('release');
  });

  it('releases decorative pulls and pulls whose callback was removed', () => {
    expect(release({ state: { ...idle, canRefresh: false } })).toBe('release');
  });

  it('releases when the originating tab no longer has registered refresh state', () => {
    expect(release({ state: undefined })).toBe('release');
  });

  it.each([
    { refreshing: true, pending: false },
    { refreshing: false, pending: true },
    { refreshing: true, pending: true },
  ])('holds an existing request without submitting another: %o', (busy) => {
    expect(release({ state: { ...idle, ...busy }, pulled: 200 })).toBe('hold');
  });

  it('keeps a live refresh visible after its finger gesture is canceled', () => {
    expect(
      release({ canceled: true, state: { ...idle, refreshing: true } })
    ).toBe('hold');
  });

  it('does not restart a refresh that finishes while the same finger is down', () => {
    expect(release({ startedRefreshing: true, pulled: 200 })).toBe('release');
  });

  it('holds a programmatic refresh that starts during an initially idle pull', () => {
    expect(release({ pulled: 10, state: { ...idle, refreshing: true } })).toBe(
      'hold'
    );
  });

  it.each([idle, { ...idle, refreshing: true }, { ...idle, pending: true }])(
    'cancels an obsolete tab or mode gesture before it can move the new page: %o',
    (state) => {
      expect(release({ validPull: false, state, pulled: 200 })).toBe('cancel');
    }
  );

  it('releases after a no-op request is acknowledged with refreshing still false', () => {
    expect(release({ state: { ...idle, pending: true }, pulled: 20 })).toBe(
      'hold'
    );
    expect(release({ state: idle, pulled: 20 })).toBe('release');
  });
});
