import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';

type Shared<T = unknown> = { value: T; _isReanimatedSharedValue: true };
type Style = { opacity?: number; transform: Record<string, number>[] };
type Worklet = (() => Style) & { __closure: Record<string, unknown> };
type Registration = {
  updater: Worklet;
  inputs: Shared[];
  runs: number;
  last: Style;
};
type Styles = Record<
  'pagerStyle' | 'pullIndicatorStyle' | 'collapsibleHeaderStyle',
  Registration
>;

const babel = jest.requireActual<{
  transformSync: (
    source: string,
    options: object
  ) => { code?: string | null } | null;
}>('@babel/core');
const sourceRoot = path.resolve(__dirname, '../..');
const compiled = new Map<string, string>();
const shared = <T>(value: T): Shared<T> => ({
  value,
  _isReanimatedSharedValue: true,
});

// Reanimated recursively extracts shared values from arrays/plain objects,
// including actual Babel closure metadata, but not captured functions.
function subscriptions(value: unknown): Shared[] {
  if (!value || typeof value !== 'object') return [];
  if ('_isReanimatedSharedValue' in value) return [value as Shared];
  return Object.values(value).flatMap(subscriptions);
}

function capture(platform: string, pullDownBehavior = 'stretch') {
  const inputs = {
    scrollY: shared(0),
    activeIndex: shared(0),
    perPageScrollY: [shared(0), shared(0)],
    scrollToTopIndex: shared(-1),
    scrollToTopOffset: shared(0),
    tabCount: 2,
    translateX: shared(0),
    usesCustomPullSV: shared(platform === 'android'),
    refreshStates: shared([
      { canRefresh: true, refreshing: false, pending: false },
      { canRefresh: true, refreshing: false, pending: false },
    ]),
    pullDownBehavior,
    headerHeight: shared(360),
  };
  const registrations: Registration[] = [];
  const reanimated = {
    interpolate: (value: number, input: number[], output: number[]) => {
      const fraction = Math.max(
        0,
        Math.min(1, (value - input[0]!) / (input[1]! - input[0]!))
      );
      return output[0]! + fraction * (output[1]! - output[0]!);
    },
    useAnimatedStyle: (updater: Worklet) => {
      expect(updater.__closure).toBeDefined();
      const registration = {
        updater,
        inputs: subscriptions(updater.__closure),
        runs: 1,
        last: updater(),
      };
      registrations.push(registration);
      return registration;
    },
  };
  const modules = new Map<string, { exports: Record<string, unknown> }>();
  function load(file: string): Record<string, unknown> {
    const cached = modules.get(file);
    if (cached) return cached.exports;
    if (!compiled.has(file)) {
      const result = babel.transformSync(readFileSync(file, 'utf8'), {
        filename: file,
        babelrc: false,
        configFile: false,
        presets: [require.resolve('@react-native/babel-preset')],
        plugins: [require.resolve('react-native-worklets/plugin')],
      });
      if (!result?.code)
        throw new Error('Worklets compilation produced no code');
      compiled.set(file, result.code);
    }
    const module = { exports: {} };
    modules.set(file, module);
    const context: Record<string, unknown> = {
      module,
      exports: module.exports,
      __DEV__: false,
      require: (name: string) => {
        if (name === 'react-native') return { Platform: { OS: platform } };
        if (name === 'react-native-reanimated') return reanimated;
        if (name === '../utils/paging' || name === '../utils/refresh') {
          return load(path.resolve(path.dirname(file), `${name}.ts`));
        }
        throw new Error(`Unexpected runtime import: ${name}`);
      },
    };
    context.global = context;
    runInNewContext(compiled.get(file)!, context, { filename: file });
    return module.exports;
  }
  const hook = load(
    path.join(sourceRoot, 'components/useContainerAnimatedStyles.ts')
  ).useContainerAnimatedStyles as (params: typeof inputs) => Styles;
  const styles = hook(inputs);
  expect(registrations).toHaveLength(3);
  function update<T>(value: Shared<T>, next: T) {
    value.value = next;
    for (const registration of registrations) {
      if (registration.inputs.includes(value)) {
        registration.runs++;
        registration.last = registration.updater();
      }
    }
  }
  return { inputs, styles, update };
}

describe('compiled container style worklets', () => {
  test.each(['ios', 'web'])('%s avoids unused vertical subscriptions', (os) => {
    const { inputs, styles, update } = capture(os);
    expect(Object.keys(styles.pagerStyle.updater.__closure)).toEqual([
      'translateX',
    ]);
    expect(styles.pagerStyle.inputs).toEqual([inputs.translateX]);
    expect(styles.pullIndicatorStyle.inputs).toEqual([]);
    for (let y = 1; y <= 100; y++) {
      update(inputs.scrollY, y);
      update(inputs.perPageScrollY[0]!, y);
    }
    expect(styles.pagerStyle.runs).toBe(1);
    expect(styles.pullIndicatorStyle.runs).toBe(1);
    expect(styles.collapsibleHeaderStyle.last.transform).toEqual([
      { translateY: -100 },
    ]);
    update(inputs.translateX, -390);
    expect(styles.pagerStyle.runs).toBe(2);
    expect(styles.pagerStyle.last.transform).toEqual([
      { translateX: -390 },
      { translateY: 0 },
    ]);
  });

  test('Android retains custom pull, refresh and programmatic offset inputs', () => {
    const { inputs, styles, update } = capture('android');
    for (const value of [
      inputs.scrollY,
      inputs.perPageScrollY[1]!,
      inputs.scrollToTopOffset,
    ]) {
      expect(styles.pagerStyle.inputs).toContain(value);
      expect(styles.pullIndicatorStyle.inputs).toContain(value);
    }
    expect(styles.pagerStyle.inputs).toContain(inputs.usesCustomPullSV);
    expect(styles.pullIndicatorStyle.inputs).toContain(inputs.refreshStates);
    update(inputs.scrollY, -28);
    expect(styles.pagerStyle.last.transform).toEqual([
      { translateX: 0 },
      { translateY: 28 },
    ]);
    expect(styles.pullIndicatorStyle.last.opacity).toBe(0.5);
    expect(styles.pullIndicatorStyle.last.transform).toEqual([{ scale: 0.8 }]);
    update(inputs.usesCustomPullSV, false);
    expect(styles.pagerStyle.last.transform[1]).toEqual({ translateY: 0 });
    update(
      inputs.refreshStates,
      inputs.refreshStates.value.map((s) => ({ ...s, canRefresh: false }))
    );
    expect(styles.pullIndicatorStyle.last.opacity).toBe(0);
    update(inputs.activeIndex, 1);
    update(inputs.perPageScrollY[1]!, 120);
    expect(styles.collapsibleHeaderStyle.last.transform).toEqual([
      { translateY: -120 },
    ]);
    update(inputs.scrollToTopIndex, 1);
    update(inputs.scrollToTopOffset, -40);
    expect(styles.collapsibleHeaderStyle.last.transform).toEqual([
      { translateY: 40 },
    ]);
  });

  test.each(['ios', 'web', 'android'])(
    '%s preserves stretch, static and unmeasured header behavior',
    (os) => {
      for (const behavior of ['stretch', 'static']) {
        const { inputs, styles, update } = capture(os, behavior);
        update(inputs.scrollY, -56);
        expect(styles.collapsibleHeaderStyle.last.transform).toEqual([
          { translateY: behavior === 'stretch' ? 56 : 0 },
        ]);
        update(inputs.perPageScrollY[0]!, 720);
        expect(styles.collapsibleHeaderStyle.last.transform).toEqual([
          { translateY: -360 },
        ]);
        update(inputs.headerHeight, 0);
        expect(styles.collapsibleHeaderStyle.last.transform).toEqual([
          { translateY: 0 },
        ]);
      }
    }
  );
});
