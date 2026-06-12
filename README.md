# react-native-collapsible-fluid-tabs

A collapsible header + swipeable tabs for React Native, with a fluid pill tab bar and scroll positions that stay in sync across pages.

- 📉 **Collapsing header** — hides as you scroll, reveals as you pull down
- 📌 **Optional pinned header** — a status-bar-aware bar that floats on top
- 👆 **Gesture-driven pager** — horizontal swipe between tabs, no `react-native-pager-view`
- ⚡ **Momentum grab** — touch a flinging list to stop it and page sideways in the same gesture, like the X app
- 🔄 **Synced scroll** — pages keep their scroll position, so tabs don't jump on swipe
- 💊 **Fluid pill tab bar** — tracks fractional swipe progress; goes scrollable when tabs get crowded
- 📜 **Drop-in lists** — `FlatList`, `ScrollView`, `LegendList`, and `FlashList`
- 🎨 **Bring your own tab bar** — or use the styled default
- 📱 **iOS, Android & web**

[**Install**](#installation) · [**Quick start**](#quick-start) · [**Which list?**](#which-list-should-i-use) · [**API**](#api) · [**Notes**](#notes) · [**Web**](#web)

---

## Installation

```sh
npm install react-native-collapsible-fluid-tabs
```

Install the peer dependencies (any Reanimated 4 project already has these):

```sh
npm install react-native-reanimated react-native-gesture-handler react-native-safe-area-context react-native-worklets
```

> **iOS:** the list backends include native code, so run `npx pod-install` after installing.

### Version requirements

This library uses the **Gesture Handler v3** hook API and **Reanimated 4**:

| Peer dependency | Minimum version |
|---|---|
| `react-native-gesture-handler` | `>= 3.0.0` |
| `react-native-reanimated` | `>= 4.0.0` |
| `react-native-worklets` | `>= 0.7.0` |
| `react-native-safe-area-context` | `>= 4.0.0` |

### Setup

**1.** Make sure your app is wrapped in `GestureHandlerRootView` and
`SafeAreaProvider` — Expo Router apps have both out of the box.

**2. Enable Reanimated's synchronous UI-prop updates** in your app's
`package.json` — and **only** these two flags:

```json
"reanimated": {
  "staticFeatureFlags": {
    "ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS": true,
    "IOS_SYNCHRONOUSLY_UPDATE_UI_PROPS": true
  }
}
```

With them, the header transform is applied in the same frame as the scroll
event; without them it can judder during fast drags. They're compile-time
flags — they take effect after a native rebuild, not a JS reload.

---

## Quick start

```tsx
import { Tabs } from 'react-native-collapsible-fluid-tabs';

export function ProfileScreen() {
  return (
    <Tabs.Container
      renderHeader={() => <ProfileHeader />}
      tabBarHeight={56}
    >
      <Tabs.Tab name="posts" label="Posts">
        <Tabs.FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => <PostCard post={item} />}
        />
      </Tabs.Tab>

      <Tabs.Tab name="about" label="About">
        <Tabs.ScrollView contentContainerStyle={{ padding: 16 }}>
          <AboutContent />
        </Tabs.ScrollView>
      </Tabs.Tab>
    </Tabs.Container>
  );
}
```

That's the whole idea: a `Tabs.Container` holds `Tabs.Tab`s, and each tab renders one scrollable. The container handles the header, the pager, and keeping scroll in sync — you just pass your data and `renderItem`.

---

## Which list should I use?

Every list is a drop-in for its underlying component and automatically gets header/footer spacers and scroll sync. Pick based on your content:

| Component | Best for | Virtualized |
|---|---|---|
| `Tabs.ScrollView` | Static or short content — about pages, forms, profiles | — |
| `Tabs.FlatList` | Simple lists with small/medium data | ✅ |
| `Tabs.LegendList` | Large lists where you want the best performance | ✅ |
| `Tabs.FlashList` | Large lists, or if you already use Shopify FlashList | ✅ |

`@legendapp/list` and `@shopify/flash-list` ship as dependencies, so `Tabs.LegendList` and `Tabs.FlashList` work out of the box — no extra install.

Each list manages a few props for you (`onScroll`, `scrollEventThrottle`, the scroll `ref`) and adds one extra:

- **`minContentHeight`** — minimum content height for this page so short pages still scroll enough to collapse the header. Defaults to the container's `minPageContentHeight`.

Everything else (`data`, `renderItem`, `numColumns`, `keyExtractor`, `ListHeaderComponent`, `refreshControl`, …) works exactly as it does on the underlying component.

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
| `pinnedHeaderHeight` | `number` | auto | Height of the pinned header, excluding the safe-area top inset (added for you). Omit it to auto-measure the rendered pinned header — give it intrinsic height (padding, not `flex: 1`). Passing a height just avoids a first-frame adjustment. |
| `estimatedHeaderHeight` | `number` | `0` | First-frame estimate for the collapsing header height, so list spacers don't start at 0 and jump after the first layout. The measured height always wins. |

**Tabs & navigation**

| Prop | Type | Default | Description |
|---|---|---|---|
| `children` | `ReactNode` | — | One or more `<Tabs.Tab>`. Changing the *number* of tabs remounts the pager — see [Notes](#notes). |
| `tabBarHeight` | `number` | `56` | Height of the tab bar (matches the default bar; set it to match a custom one). |
| `initialIndex` | `number` | `0` | Tab to start on (uncontrolled mode). |
| `index` | `number` | — | Controlled active tab: when it changes the pager animates there. Pair it with `onIndexChange` and commit reported changes back to your state. Omit for uncontrolled mode. |
| `onIndexChange` | `(index: number) => void` | — | Fires after a tab change (tap or swipe). |
| `scrollToTopOnTabPress` | `boolean` | `true` | Tapping the already-active tab scrolls its list back to the top, like X. |
| `renderTabBar` | `(props) => ReactNode` | `Tabs.DefaultTabBar` | Render your own tab bar. |

**Swipe & motion**

| Prop | Type | Default | Description |
|---|---|---|---|
| `swipeEnabled` | `boolean` | `true` | Enable horizontal swipe between tabs. |
| `swipeActivationDistance` | `number` | `15` | Horizontal travel (dp) before a swipe activates. |
| `swipeFailDistance` | `number` | `10` | Vertical travel (dp) that cancels a swipe in favor of scrolling. |
| `momentumSwipeFailDistance` | `number` | `40` | Replaces `swipeFailDistance` while the list is momentum-scrolling (and for the touch that grabs it). A finger catching a moving list drifts vertically far more than one starting at rest — the relaxed threshold is what makes mid-momentum page swipes land. |
| `swipeGestureTopInset` | `'auto' \| number` | `'auto'` | Top area where the pager swipe won't activate. `'auto'` excludes the header chrome so touches there keep behaving like scroll/refresh gestures; pass `0` to allow swipes from the full page height. |
| `springConfig` | `SpringConfig` | `damping 30, stiffness 200` | Spring used to settle the pager after a swipe. |
| `pullDownBehavior` | `'stretch' \| 'static'` | `'static'` | Pull-down at the top: `'static'` keeps the chrome put with the native refresh spinner between header and list. `'stretch'` pulls the whole page down — collapsible header and tab bar ride along, pinned header stays — revealing the refresh indicator near the top. On iOS stretch rides the native bounce; on Android (no native bounce) the Container drives the pull itself and shows a built-in indicator, still wired to your `refreshControl`'s `refreshing`/`onRefresh`. |

**Performance & layout**

| Prop | Type | Default | Description |
|---|---|---|---|
| `lazy` | `boolean` | `false` | Mount tabs on demand instead of all upfront. |
| `lazyPreloadDistance` | `number` | `1` | With `lazy`, how many neighboring tabs to pre-mount. |
| `minPageContentHeight` | `number` | screen + header height | Minimum content height per page, so short/empty pages can still scroll enough to collapse the header. The default is computed from the measured header. |
| `containerStyle` | `StyleProp<ViewStyle>` | — | Style for the outermost view. Set a `backgroundColor` — see [Notes](#notes). |

#### Imperative ref

Drive the active tab from outside — deep links, a "next" button, etc. (If you'd rather own the tab in state, use the controlled `index` prop instead; the ref suits one-off jumps.)

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
| `getIndex` | `() => number` | The current snapped tab index. |

### `<Tabs.Tab>`

| Prop | Type | Description |
|---|---|---|
| `name` | `string` | Stable identifier (used as the key). |
| `label` | `string` | Optional label for the default tab bar. |
| `icon` | `ReactNode` | Optional icon for the default tab bar. Any node — an `<Image>`, an SVG, a vector-icon. |
| `badge` | `string \| number \| boolean` | Optional badge: a string/number renders a count bubble, `true` a small dot. Custom tab bars receive it on `TabConfig`. |
| `children` | `ReactNode` | The tab's content — typically one of the list components. |

`icon` is just a React node, so image icons work out of the box (the default bar clones it with `tintColor`/`color`, which template/vector icons can pick up):

```tsx
<Tabs.Tab
  name="photos"
  label="Photos"
  icon={<Image source={require('./photos.png')} style={{ width: 20, height: 20 }} />}
>
  {/* ... */}
</Tabs.Tab>
```

### `<Tabs.DefaultTabBar>`

Rendered automatically. You only reference it when composing your own `renderTabBar`:

```tsx
renderTabBar={(props) => (
  <Tabs.DefaultTabBar
    {...props}
    colors={{
      background: '#fff',
      pillBackground: '#000',
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

The default bar is just one option — `renderTabBar` lets you replace it with **any** design: a top or bottom bar, an underline/segmented indicator, icon-only tabs, badges, whatever. It receives every animated value driving the tabs, so your bar can react to live swipe progress with `useAnimatedStyle`:

```ts
interface TabBarRenderProps {
  tabs: TabConfig[];
  scrollY: SharedValue<number>;       // active page's scroll position
  headerHeight: SharedValue<number>;  // measured collapsing header height
  activeIndex: SharedValue<number>;   // current tab index (snapped)
  pagerOffset: DerivedValue<number>;  // fractional page offset, 0..N-1
  pillWidth: SharedValue<number>;     // width of one tab slot
  pinnedHeaderHeight: number;
  tabBarHeight: number;
  topInset: number;
  pullDownBehavior: 'stretch' | 'static';
  onTabPress: (index: number) => void;
}
```

### Hooks

**`useCollapsibleHeader()`** — build a custom sticky element inside a tab (a filter bar, segmented control, …). Call it inside a `<Tabs.Container>`:

```tsx
import { useCollapsibleHeader } from 'react-native-collapsible-fluid-tabs';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

function FilterBar() {
  const { collapseProgress, contentTop } = useCollapsibleHeader();
  const style = useAnimatedStyle(() => ({ opacity: 1 - collapseProgress.value }));
  return <Animated.View style={[{ top: contentTop }, style]}>{/* … */}</Animated.View>;
}
```

Returns `{ scrollY, headerHeight, collapseProgress (0→1), pinnedHeaderHeight, tabBarHeight, topInset, contentTop }`, where `contentTop` is the height of the fixed chrome above the list.

For lower-level access, `useTabsContext()` (inside a `Container`) and `useTabIndex()` (inside a `Tab`) are also exported.

---

## Notes

- **Changing the tab count** remounts the pager (it's keyed on tab count), resetting per-tab scroll and returning to `initialIndex`. Keep the count stable where you can; hide content per-tab instead of adding/removing tabs.
- **Set a background.** During an overscroll bounce a brief sliver can open between the header and list. Set `containerStyle={{ backgroundColor: '…' }}` to your theme background so the OS window background (e.g. black in dark mode) doesn't show through.
- **RefreshControl on Android.** Import `RefreshControl` from **`react-native-gesture-handler`**, not `react-native`. Inside the pager each list is wrapped in a Native gesture; RN's RefreshControl doesn't participate, so pull-to-refresh would only commit on a second touch. In `'static'` mode the gesture-aware control auto-wires that relation and gets a `progressViewOffset` placing the spinner below the header chrome (pass your own to override). In `'stretch'` mode the native spinner is suppressed entirely — the Container drives the pull and shows its built-in indicator, still wired to your control's `refreshing`/`onRefresh`. (iOS needs neither.)
- **Android overscroll is off by default.** Every list wrapper sets `overScrollMode="never"`: Android's overscroll stretch effect moves the list's pixels without emitting scroll events, so the overlaid header can't follow and a visible seam opens between chrome and content. Pass your own `overScrollMode` to re-enable it.
- **Reduced motion.** With the OS "reduce motion" setting on, tab changes jump instantly instead of springing.
- **RTL.** The pager forces LTR internally so swipe math stays correct; tab *order* isn't mirrored.

---

## Web

Runs under `react-native-web`. A couple of things help:

- **Header tracking.** `Tabs.LegendList` tracks the collapsing header via Legend List's continuous `scrollOffset` (a plain `onScroll` only fires at scroll-settle on web). The other lists use native scroll and need nothing.
- **Lists with images.** Legend List sizes items from a running average after the first render, so `estimatedItemSize` is optional — passing it still improves the first paint on web, where layout corrections run on the single thread mid-animation. On recycled `expo-image`s, set `recyclingKey` so they don't flash the previous image and `draggable={false}` so the browser's image-drag doesn't swallow swipes.

---

## License

MIT
