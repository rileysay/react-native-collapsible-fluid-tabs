# Fluid Tabs local reference

Detailed setup, API, and platform notes. Start with the [README quick start](../README.md#quick-start).

## Installation

```sh
npm install react-native-collapsible-fluid-tabs
```

Install the peer dependencies (see [version requirements](#version-requirements) for minimums):

```sh
npm install react-native-reanimated react-native-gesture-handler react-native-safe-area-context react-native-worklets
```

`Tabs.LegendList` and `Tabs.FlashList` need their list package installed too. These are optional peers; install only the ones you need. Installed list packages may still be included in the bundle because the main entry point exports all adapters:

```sh
npm install @legendapp/list        # for Tabs.LegendList
npm install @shopify/flash-list    # for Tabs.FlashList
```

> **iOS:** install pods and rebuild after adding the native peer dependencies. In an existing bare iOS project, run `npx pod-install`; Expo development builds handle native setup through prebuild/build. LegendList and FlashList v2 are JavaScript-only.

Expo and React Native's standard Metro configurations support these optional imports. If you build a custom Metro configuration from scratch, preserve `transformer.allowOptionalDependencies: true`; otherwise Metro may fail to bundle when an optional list package is absent.

For apps without both optional peers, use the separate entry points to avoid loading unused adapters or their TypeScript declarations:

```tsx
import { Tabs } from 'react-native-collapsible-fluid-tabs/core';
// Add only the adapters you install, as needed:
import { LegendList } from 'react-native-collapsible-fluid-tabs/legend-list';
import { FlashList } from 'react-native-collapsible-fluid-tabs/flash-list';
```

The `core` entry exports Container, Tab, FlatList, ScrollView, DefaultTabBar, the hooks, and their types. Render a separately imported adapter inside `Tabs.Tab`. The original main entry keeps all exports for compatibility; with `skipLibCheck: false`, that entry still requires both optional peers to resolve their declarations.

### Version requirements

This library targets **Gesture Handler 3**, **Reanimated 4.4+**, and React Native's **New Architecture (Fabric)**. Choose compatible React Native, Reanimated, and Worklets versions together; the minimums below do not mean that every newer combination is supported. Check the [Reanimated compatibility table](https://docs.swmansion.com/react-native-reanimated/docs/guides/compatibility/) and [Gesture Handler requirements](https://docs.swmansion.com/react-native-gesture-handler/docs/fundamentals/getting-started/).

| Peer dependency | Minimum version |
|---|---|
| `react` | `>= 19.2.0` |
| `react-native` | `>= 0.83.0` (New Architecture) |
| `react-native-gesture-handler` | `>= 3.0.0` |
| `react-native-reanimated` | `>= 4.4.0` |
| `react-native-worklets` | `>= 0.9.1` |
| `react-native-safe-area-context` | `>= 5.0.0` |
| `@legendapp/list` (optional) | `>= 3.2.0` |
| `@shopify/flash-list` (optional) | `>= 2.0.0` |

The example uses Expo 57, React Native 0.86.3, Gesture Handler 3.2.1, Reanimated 4.6.0, and Worklets 0.12.1. Reanimated 4.4 supports the Worklets 0.9 and 0.10 families; 4.6 requires the 0.12 family. Do not pair the minimum Worklets version with Reanimated 4.6.

### Setup

**1.** Make sure your app is wrapped in `GestureHandlerRootView` and `SafeAreaProvider`:

```tsx
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ProfileScreen />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
```

With Expo Router, add `GestureHandlerRootView` around your root layout's `Stack` or `Slot`; Router supplies safe-area context, but does not supply the gesture root for you. Android modal content also needs its own gesture root. See [Gesture Handler setup](https://docs.swmansion.com/react-native-gesture-handler/docs/fundamentals/getting-started/).

**2. Configure Worklets.** Expo's `babel-preset-expo` configures the plugin. In a bare React Native app, add `react-native-worklets/plugin` **last** in your Babel plugins, then clear Metro's cache and rebuild. See [Reanimated installation](https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/getting-started/).

```js
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: ['react-native-worklets/plugin'],
};
```

**3. Optional performance flags.** The example enables Reanimated's synchronous UI-prop updates in its app `package.json`:

```json
"reanimated": {
  "staticFeatureFlags": {
    "ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS": true,
    "IOS_SYNCHRONOUSLY_UPDATE_UI_PROPS": true
  }
}
```

Both flags remain supported and default to `false` in Reanimated 4.6. They provide a faster path for transforms and other non-layout styles. Run pods on iOS and rebuild native after changing them. They can affect hit testing on transformed views; use Gesture Handler's `Pressable` or gestures for interactive header content, and verify scrolling and taps on your target devices. See the [feature flag documentation](https://docs.swmansion.com/react-native-reanimated/docs/guides/feature-flags/).

The example leaves other flags at their installed defaults. Check your exact Reanimated release before applying older performance recipes; the [4.6.0 flag definitions](https://github.com/software-mansion/react-native-reanimated/blob/4.6.0/packages/react-native-reanimated/src/featureFlags/staticFlags.json) are the reference for this example. Static flags cannot be changed in **Expo Go**.

**Expo:** use a development build when your Expo Go client does not bundle Gesture Handler 3 and the matching Reanimated/Worklets versions. The example uses this workflow (`yarn example android` / `yarn example ios`); changing native dependencies requires rebuilding that client.

---

## Quick start

See the [complete, core-only example in the README](../README.md#quick-start).

## Example playground

The [example app](../example/README.md) opens from a home screen into X and Instagram profile demos (LegendList in every tab), or a Lab with one tab per list adapter. The Lab includes live header, safe-area, gesture, and refresh controls.

## Which list should I use?

Each wrapper adds header/footer spacers and scroll sync to its underlying component. These adapters target vertical, non-inverted content.

| Component | Best for | Virtualized |
|---|---|---|
| `Tabs.LegendList` | Feeds and grids using LegendList's Reanimated integration | ✅ |
| `Tabs.ScrollView` | Static or short content — about pages, forms, profiles | — |
| `Tabs.FlashList` | Feeds and grids using FlashList v2 | ✅ |
| `Tabs.FlatList` | React Native's built-in virtualized list, without an extra list dependency | ✅ |

Choose based on your data, item complexity, and profiling on target devices; this package does not establish a universal performance ranking.

`Tabs.ScrollView` and `Tabs.FlatList` work with zero extra installs. `Tabs.LegendList` and `Tabs.FlashList` need their (optional-peer) list package — see [Installation](#installation).

Each list manages a few props for you (`onScroll`, `scrollEventThrottle`, the scroll `ref`) and adds one extra:

- **`minContentHeight`** — minimum content height for this page so short pages still scroll enough to collapse the header. Defaults to the container's `minPageContentHeight`.

Common props such as `data`, `renderItem`, `numColumns`, `keyExtractor`, `ListHeaderComponent`, and `refreshControl` are forwarded. The wrappers reserve the scroll event handler, scroll throttle, and internal scroll ref; FlashList also reserves `renderScrollComponent`, and LegendList reserves `refScrollView` and `sharedValues.scrollOffset`. Public refs still expose the underlying list's imperative API, and other LegendList shared-value outputs remain available. Header/footer components may be elements, functions, or memoized components. Use one vertical adapter per tab; LegendList's `useWindowScroll` does not apply to this contained adapter.

The injected spacer changes content coordinates. Account for it when using `getItemLayout`, `initialScrollIndex`, list sticky headers, or imperative scroll offsets. `Tabs.ScrollView` adjusts `stickyHeaderIndices` for its extra first child automatically. Consumer `contentContainerStyle` can override the injected `minHeight`.

---

## API

[`Tabs.Container`](#tabscontainer) · [imperative ref](#imperative-ref) · [`Tabs.Tab`](#tabstab) · [`Tabs.DefaultTabBar`](#tabsdefaulttabbar) · [custom tab bar](#custom-tab-bar) · [hooks](#hooks)

### `<Tabs.Container>`

The only required prop is `children` (your tabs). Everything else is optional — props are grouped below by what they affect.

**Headers**

| Prop | Type | Default | Description |
|---|---|---|---|
| `renderHeader` | `(props: HeaderRenderProps) => ReactNode` | — | The collapsing header. Its measured height drives the collapse. Receives `{ scrollY, headerHeight, topInset, pinnedHeaderHeight }` for header-internal animations. |
| `renderPinnedHeader` | `(props: HeaderRenderProps) => ReactNode` | — | Optional header pinned to the top, always visible. Same render props. |
| `pinnedHeaderHeight` | `number` | auto | Pinned header height excluding safe-area inset (added automatically). Omit to auto-measure from layout. |
| `topInset` | `number` | device safe-area top | Override the top inset reserved by the container. Set `0` for content and chrome to reach behind the status bar/notch, or if an ancestor already handles the inset. Negative values clamp to zero; non-finite values use the device inset. |
| `minHeaderHeight` | `number` | `0` | Minimum height of the collapsing header left visible after scrolling. The tab bar then rests at `topInset + minHeaderHeight` instead of on the top inset alone. Clamped to the measured header height. `0` collapses the header fully. |
| `estimatedHeaderHeight` | `number` | `0` | Optional first-frame estimate for the collapsing header so list spacers don't jump on mount. Measured height always wins. |

For a custom pinned header, apply the supplied `topInset` as padding inside your header content (as the example does). The container reserves the total height; it does not pad the rendered content for you.

Omitting `renderPinnedHeader` removes the fixed header, but still reserves the top safe-area inset. Combine it with `topInset={0}` to scroll behind the notch. If the expanded header needs safe padding initially, put that padding inside `renderHeader` so it scrolls away with the header. With `minHeaderHeight` at `0`, the collapsed tab bar also reaches the top, so avoid placing essential controls beneath the cutout. Set `minHeaderHeight` when a strip of that same header (a title, for example) should stay visible above the collapsed tab bar. The header can still travel up into the notch while it is collapsing; only the resting position changes. This is not a pinned header: `renderPinnedHeader` reserves space from the first frame and pushes the expanded header down. Omitting `renderHeader` instead removes the collapsing header and its spacer.

**Tabs & navigation**

| Prop | Type | Default | Description |
|---|---|---|---|
| `children` | `ReactNode` | — | One or more `<Tabs.Tab>`, optionally inside fragments. Changing tab names, order, or count remounts the pager — see [Notes](#notes). |
| `tabBarHeight` | `number` | `56` | Height of the tab bar (matches the default bar; set it to match a custom one). |
| `initialIndex` | `number` | `0` | Tab to start on (uncontrolled mode). |
| `index` | `number` | — | A new external value navigates to that tab. Pair with `onIndexChange` and commit reported values back to state; these acknowledgements do not restart navigation or undo a newer swipe. Omit for uncontrolled mode. |
| `onIndexChange` | `(index: number) => void` | — | Reports the selected target from a tap, swipe, or imperative call without waiting for animation completion. Gesture notifications reach React asynchronously and may be coalesced during rapid navigation. |
| `scrollToTopOnTabPress` | `boolean` | `true` | Tapping the already-active tab scrolls its list back to the top. A new vertical drag interrupts that animation. |
| `renderTabBar` | `(props) => ReactNode` | `Tabs.DefaultTabBar` | Render your own tab bar. |

**Swipe & motion**

| Prop | Type | Default | Description |
|---|---|---|---|
| `swipeEnabled` | `boolean` | `true` | Enable horizontal swipe between tabs. |
| `swipeActivationDistance` | `number` | `15` | Minimum horizontal travel (dp) before the direction rule can select paging. |
| `swipeFailDistance` | `number` | `10` | Minimum vertical travel (dp) before a clearly vertical drag yields to scrolling. |
| `swipeDirectionRatio` | `number` | `1.4` | Required dominance of one axis over the other; values below `1` are clamped to `1`. Ambiguous diagonals yield to scrolling after twice the larger activation distance. |
| `momentumSwipeFailDistance` | `number` | — | Deprecated and ignored. Direction recognition uses the same distances and ratio during momentum as at rest. |
| `headerScrollEnabled` | `boolean` | `true` | Allow vertical list scrolling from the collapsible header and tab bar. Honors the active list's `scrollEnabled`; excludes the pinned header. |
| `swipeGestureTopInset` | `'auto' \| number` | `'auto'` | Top area where the pager swipe won't activate. `'auto'` follows the currently visible chrome as the header collapses or stretches. A number reserves a fixed area; pass `0` for full-height swipes. |
| `springConfig` | `SpringConfig` | `damping 30, stiffness 200` | Spring used to settle the pager after a swipe. |
| `pullDownBehavior` | `'stretch' \| 'static'` | `'static'` | `'static'`: chrome stays put, native refresh between header and list. `'stretch'`: page pulls down with the refresh indicator near the top (Android uses a built-in indicator — see [Notes](#notes)). |

**Performance & layout**

| Prop | Type | Default | Description |
|---|---|---|---|
| `lazy` | `boolean` | `false` | Mount visited tabs and their configured neighbors on demand; mounted pages stay mounted. |
| `lazyPreloadDistance` | `number` | `1` | With `lazy`, how many neighboring tabs to pre-mount. |
| `minPageContentHeight` | `number` | container + header height | Minimum content height per page, so short/empty pages can still scroll enough to collapse the header. Uses the measured container and header. |
| `containerStyle` | `StyleProp<ViewStyle>` | — | Style for the outermost view. Set a `backgroundColor` — see [Notes](#notes). |

When a newly visited lazy page mounts, its list aligns to the intended header offset once its ref and layout/content measurements are ready. The applied offset is clamped to that list's scrollable range.

#### Gesture recognition and header dragging

The pager and vertical gesture use the same direction rule on UI. Once selected, the axis stays locked until release, so a curved thumb movement cannot change a scroll into a page swipe. Native lists and Android native refresh controls wait for the pager to yield. On web, browser `touch-action` rules also participate in deciding which gesture receives pointer events.

Dragging vertically on the collapsible header or tab bar scrolls the actual active list, including when the finger reverses direction. Scrolling begins from the gesture's activation position. The default tab buttons wait for that gesture to fail before selecting a tab. Bounds come from each adapter's layout/content measurements; release momentum follows an elapsed-time trajectory using the list's `decelerationRate`, with separate iOS and Android models. Another drag or navigation interrupts it. These programmatic movements emit scroll updates; native `onScrollBeginDrag` and momentum callbacks remain tied to native list gestures. See [header momentum](./HEADER-SCROLL-MOMENTUM.md) for the model and its limits.

In Android `stretch` mode, a drag from the header/tab bar can cross the list's top into a custom pull and return to normal scrolling in the same touch. In native refresh modes, a chrome drag stops at the top: start pull-to-refresh on the list itself to use its native refresh control and haptics. Setting `headerScrollEnabled={false}` disables normal list scrolling from chrome; Android's existing stretched pull from chrome remains available.

#### Imperative ref

Drive the active tab from outside (deep links, etc.). Use the controlled `index` prop if you prefer state over a ref.

```tsx
import { useRef } from 'react';
import { Tabs, type TabsRef } from 'react-native-collapsible-fluid-tabs';

const tabsRef = useRef<TabsRef>(null);

tabsRef.current?.setIndex(2);         // animate to the third tab
tabsRef.current?.setIndex(2, false);  // jump instantly
const index = tabsRef.current?.getIndex();

<Tabs.Container ref={tabsRef}>{/* ... */}</Tabs.Container>;
```

| Method | Signature | Description |
|---|---|---|
| `setIndex` | `(index, animated?) => void` | Move to a tab (clamped). `animated` defaults to `true`. |
| `getIndex` | `() => number` | The current active target index, which updates before a navigation animation finishes. |

### `<Tabs.Tab>`

| Prop | Type | Description |
|---|---|---|
| `name` | `string` | Unique, stable identifier (used as the key). Duplicate names throw an error. |
| `label` | `string` | Optional label for the default tab bar. |
| `icon` | `ReactNode` | Optional icon for the default tab bar. Any node — an `<Image>`, an SVG, a vector-icon. |
| `badge` | `string \| number \| boolean` | Optional badge: a string/number renders a count bubble, `true` a small dot. Custom tab bars receive it on `TabConfig`. |
| `children` | `ReactNode` | The tab's content — typically one of the list components. |

### `<Tabs.DefaultTabBar>`

Rendered automatically. You only reference it when composing your own `renderTabBar`:

```tsx
renderTabBar={(props) => (
  <Tabs.DefaultTabBar
    {...props}
    colors={{
      background: '#fff',
      pillBackground: '#f0f0f0',
      labelColor: '#000',
      iconTint: '#000',
      trackBackground: 'rgba(0,0,0,0.06)',
    }}
  />
)}
```

It's **adaptive**: equal-width pills when tabs fit, and a horizontally scrollable, content-width pill (auto-scrolling the active tab into view) once tabs would get cramped.

| Prop | Type | Default | Description |
|---|---|---|---|
| `colors` | `DefaultTabBarColors` | — | `background`, `pillBackground`, `trackBackground`, `iconTint`, `labelColor`, `badgeBackground`, `badgeText`. |
| `scrollable` | `'auto' \| boolean` | `'auto'` | `'auto'` chooses equal-width vs. scrollable; `true`/`false` force it. |
| `minTabWidth` | `number` | `88` | In `'auto'`, switch to scrollable once equal tabs would be narrower than this. |
| `sidePadding` | `number` | `16` | Horizontal padding around the pill. |

### Custom tab bar

`renderTabBar` receives **`TabBarRenderProps`** (exported from the package): tab configs, `activeIndex`, `pagerOffset`, `headerHeight`, `perPageScrollY`, `onTabPress`, and the rest. Use it with `useAnimatedStyle` for a bar that tracks live swipe progress.

For collapse motion in a worklet, start with `perPageScrollY[activeIndex.value]?.value`. During a same-tab scroll-to-top, use `scrollToTopOffset.value` when `scrollToTopIndex.value` matches the active index. Android's custom stretch pull is represented by a negative `scrollY.value`, while the native list remains at zero. See `Tabs.DefaultTabBar` for the full offset selection and positioning logic.

Keep a custom bar glued under the collapsing header. `collapseProgress` reaches 1 when the collapsible range is finished, so travel only `(headerHeight - minHeaderHeight) * collapseProgress`, not the full `headerHeight`. The bar's `translateY` then rests at `minHeaderHeight`. Multiplying progress by the full header height makes the bar outrun the header whenever `minHeaderHeight` is greater than 0.

### Hooks

**`useCollapsibleHeader()`** — build a custom sticky element inside a tab (a filter bar, segmented control, …). Call it inside a `<Tabs.Container>`:

```tsx
import { useCollapsibleHeader } from 'react-native-collapsible-fluid-tabs';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

function FilterBar() {
  const { collapseProgress, contentTop } = useCollapsibleHeader();
  const style = useAnimatedStyle(() => ({ opacity: 1 - collapseProgress.value }));
  return (
    <Animated.View
      style={[{ position: 'absolute', top: contentTop, left: 0, right: 0 }, style]}
    >
      {/* Your overlay content */}
    </Animated.View>
  );
}
```

Returns `{ scrollY, headerHeight, collapseProgress (0→1), pinnedHeaderHeight, tabBarHeight, topInset, minHeaderHeight, contentTop }`.

Render an overlay like this as a sibling of the list inside a tab. `contentTop` is the fixed chrome height when the header has finished collapsing: pinned header + top inset + `minHeaderHeight` + tab bar. It excludes the part of the header that scrolled away. `collapseProgress` reaches 1 at that shorter range, not at the full header height. The hook provides values, not automatic sticky positioning or list spacing.

`useTabsContext()` and `useTabIndex()` are also exported for lower-level use.

---

## Notes

- **Changing tab names, order, or count** remounts the pager and resets scroll positions and mounted pages. Keep tab identity and order stable when preserving scroll matters. Changing labels, icons, badges, or content does not remount it.
- **Set a background** on `containerStyle` so nothing flashes through during overscroll.
- **RefreshControl on Android** — import from **`react-native-gesture-handler`** so the adapter can connect its refresh gesture to the list. RN's control often needs a second pull inside the pager. List `onRefresh` / `refreshing` shorthand creates the gesture-aware control automatically.
- **Android overscroll** — lists default to `overScrollMode="never"`: Android 12+'s stretch overscroll moves the list's pixels without emitting scroll events, so the header can't follow it and a seam opens under the chrome. Override it per-list if you accept that trade-off.
- **Reduced motion** — tab changes jump instantly when the OS setting is on.

### Pull to refresh

FlatList, FlashList, and LegendList accept `onRefresh` / `refreshing` shorthand. All four adapters accept an explicit `refreshControl`, which takes precedence over shorthand. ScrollView uses the explicit control.

`refreshing` is controlled: set it to `true` synchronously in `onRefresh`, before awaiting your request, and back to `false` in a `finally` block when the request finishes. Leaving it `false` dismisses the indicator. Keep state per tab when tabs refresh independently. Android's custom stretch mode honors `enabled={false}` for new refresh requests while retaining controlled refreshing state; static mode forwards `enabled` to the native control.

Native indicators receive a default `progressViewOffset` below the fixed chrome: the full header and tab bar in static mode, or just the pinned header and top inset for iOS stretch mode. An explicit offset, including `0`, overrides the default.

iOS uses the native `UIRefreshControl` in both modes, with a default system tint for visibility; an explicit `tintColor` takes precedence. An [upstream report links explicit tint to missing native pull haptics](https://github.com/react/react-native/issues/43388). This repository includes an experimental React Native 0.86.3 Yarn patch for its example that delays initial tint until native attachment. The patch requires rebuilding the iOS client and is not installed automatically in apps consuming this package. Its physical-device result has not been verified; see [the native refresh notes](./IOS_REFRESH_CONTROL.md).

Android stretch mode replaces the native control with a built-in indicator. It reads `refreshing`, `onRefresh`, and `enabled`; native indicator styling props such as `colors`, `title`, `size`, and `progressViewOffset` do not customize it. Programmatic refreshes reveal it when the active list is at the top. Paging dismisses the indicator while the request continues; pulling again during that request shows it without issuing another refresh. Switching tabs or modes during a pull cancels that pull.

---

## Web

Supported on `react-native-web`. Web scroll handlers run in the browser. The default tab bar supports pointer and keyboard activation. Inactive pages stay mounted but are hidden from accessibility; web pages also use `inert` to exclude their controls from keyboard focus. Verify touch scrolling, horizontal swiping, and focus behavior in the browsers you support. Native frame pacing requires separate device profiling.

The stock Gesture Handler `RefreshControl` has no refresh UI on web and its gesture wrapper can intercept pager drags, so the adapters omit it there. Custom web refresh controls are forwarded; their gesture relationships remain the caller's responsibility.

---

## License

MIT
