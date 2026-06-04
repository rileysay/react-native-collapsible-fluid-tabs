# react-native-collapsible-fluid-tabs

A collapsible header + swipeable tabs for React Native, with a fluid pill tab bar and scroll positions that stay in sync across pages.

- 📉 **Collapsing header** — hides as you scroll, reveals as you pull down
- 📌 **Optional pinned header** — a status-bar-aware bar that floats on top
- 👆 **Gesture-driven pager** — horizontal swipe between tabs, no `react-native-pager-view`
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

**1. Wrap your app** in `GestureHandlerRootView` and `SafeAreaProvider`:

```tsx
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function App() {
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        {/* ... */}
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
```

**2. Enable the Reanimated 4 commit flags** in your app's `package.json` — without them, cross-page scroll sync can flicker on swipe:

```json
"reanimated": {
  "staticFeatureFlags": {
    "DISABLE_COMMIT_PAUSING_MECHANISM": true,
    "USE_COMMIT_HOOK_ONLY_FOR_REACT_COMMITS": true,
    "ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS": true,
    "IOS_SYNCHRONOUSLY_UPDATE_UI_PROPS": true
  }
}
```

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
| `renderHeader` | `() => ReactNode` | — | The collapsing header. Its measured height drives the collapse. |
| `renderPinnedHeader` | `() => ReactNode` | — | Optional header pinned to the top, always visible. |
| `pinnedHeaderHeight` | `number` | `0` | Height of the pinned header (the safe-area top inset is added for you). |

**Tabs & navigation**

| Prop | Type | Default | Description |
|---|---|---|---|
| `children` | `ReactNode` | — | One or more `<Tabs.Tab>`. Changing the *number* of tabs remounts the pager — see [Notes](#notes). |
| `tabBarHeight` | `number` | `56` | Height of the tab bar. |
| `initialIndex` | `number` | `0` | Tab to start on. |
| `onIndexChange` | `(index: number) => void` | — | Fires after a tab change (tap or swipe). |
| `renderTabBar` | `(props) => ReactNode` | `Tabs.DefaultTabBar` | Render your own tab bar. |

**Swipe & motion**

| Prop | Type | Default | Description |
|---|---|---|---|
| `swipeEnabled` | `boolean` | `true` | Enable horizontal swipe between tabs. |
| `swipeActivationDistance` | `number` | `15` | Horizontal travel (px) before a swipe activates. |
| `swipeFailDistance` | `number` | `10` | Vertical travel (px) that cancels a swipe in favor of scrolling. |
| `springConfig` | `SpringConfig` | `damping 30, stiffness 200` | Spring used to settle the pager after a swipe. |
| `pullDownBehavior` | `'stretch' \| 'static'` | `'static'` | Overscroll: `'static'` keeps the header put while the list bounces; `'stretch'` stretches the header with the pull. |

**Performance & layout**

| Prop | Type | Default | Description |
|---|---|---|---|
| `lazy` | `boolean` | `false` | Mount tabs on demand instead of all upfront. |
| `lazyPreloadDistance` | `number` | `1` | With `lazy`, how many neighboring tabs to pre-mount. |
| `minPageContentHeight` | `number` | `1.3 × screen height` | Default minimum content height per page. |
| `containerStyle` | `StyleProp<ViewStyle>` | — | Style for the outermost view. Set a `backgroundColor` — see [Notes](#notes). |

#### Imperative ref

Drive the active tab from outside — deep links, a "next" button, etc.:

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
| `colors` | `DefaultTabBarColors` | — | `background`, `pillBackground`, `trackBackground`, `iconTint`, `labelColor`. |
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
- **RefreshControl on Android.** Import `RefreshControl` from **`react-native-gesture-handler`**, not `react-native`. Inside the pager each list is wrapped in a Native gesture; RN's RefreshControl doesn't participate, so pull-to-refresh would only commit on a second touch. The gesture-aware one auto-wires the relation and gets a `progressViewOffset` so the spinner clears the header. (iOS needs neither.)
- **Reduced motion.** With the OS "reduce motion" setting on, tab changes jump instantly instead of springing.
- **RTL.** The pager forces LTR internally so swipe math stays correct; tab *order* isn't mirrored.

---

## Web

Runs under `react-native-web`. A couple of things help:

- **Header tracking.** `Tabs.LegendList` tracks the collapsing header via Legend List's continuous `scrollOffset` (a plain `onScroll` only fires at scroll-settle on web). The other lists use native scroll and need nothing.
- **Lists with images.** On `Tabs.LegendList`, set `estimatedItemSize` (no separate UI thread on web, so accurate sizing keeps virtualization from starving the animation). On recycled `expo-image`s, set `recyclingKey` so they don't flash the previous image and `draggable={false}` so the browser's image-drag doesn't swallow swipes.

---

## License

MIT
