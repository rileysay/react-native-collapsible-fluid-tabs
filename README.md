# react-native-collapsible-fluid-tabs

Smooth collapsible header + tabs for React Native, with synchronized scroll across pages, a custom gesture-driven pager, and a fluid pill tab bar.

## Features

- Collapsing header that hides as you scroll, reveals as you pull down
- Optional always-pinned header that floats on top (e.g. status-bar-aware nav)
- Custom horizontal pager built on `react-native-gesture-handler` (no `react-native-pager-view` required)
- Synchronized scroll positions across pages so tabs don't jump on swipe
- Animated pill tab indicator that tracks fractional swipe progress
- Drop-in `Tabs.FlatList`, `Tabs.ScrollView`, and `Tabs.LegendList` — pass any data, any `renderItem`
- Bring your own tab bar via `renderTabBar`, or use the styled default

## Install

```sh
npm install react-native-collapsible-fluid-tabs
```

You also need these peers (any RN/Expo project working with Reanimated 4 will already have them):

```sh
npm install react-native-reanimated react-native-gesture-handler react-native-safe-area-context
```

### Setup

1. Wrap your app in `GestureHandlerRootView` and `SafeAreaProvider`:

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

2. Reanimated 4 commit-pausing flags. Add this to your app's `package.json`:

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

   Without these, scroll synchronization across pages can flicker on tab swipes.

## Usage

```tsx
import { Tabs } from 'react-native-collapsible-fluid-tabs';

export function ProfileScreen() {
  return (
    <Tabs.Container
      renderHeader={() => <ProfileHeader />}
      renderPinnedHeader={() => <NavBar />}
      pinnedHeaderHeight={48}
      tabBarHeight={56}
    >
      <Tabs.Tab name="posts" label="Posts">
        <Tabs.FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => <PostCard post={item} />}
        />
      </Tabs.Tab>

      <Tabs.Tab name="gallery" label="Gallery">
        <Tabs.FlatList
          data={photos}
          numColumns={3}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => <Tile photo={item} />}
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

## API

### `<Tabs.Container>`

| Prop | Type | Default | Description |
|---|---|---|---|
| `children` | `ReactNode` | — | One or more `<Tabs.Tab>` children. **Tab count must be stable across renders.** |
| `renderHeader` | `() => ReactNode` | — | The collapsing header, rendered above the tabs. Its measured height drives the collapse animation. |
| `renderPinnedHeader` | `() => ReactNode` | — | Optional always-visible header pinned to the top. |
| `pinnedHeaderHeight` | `number` | `0` | Height of the pinned header (excluding the safe-area top inset, which is added automatically). |
| `tabBarHeight` | `number` | `56` | Height of the tab bar. |
| `initialIndex` | `number` | `0` | Tab index to start on. |
| `onIndexChange` | `(index: number) => void` | — | Fires after a tab change (tap or swipe). |
| `renderTabBar` | `(props: TabBarRenderProps) => ReactNode` | uses `Tabs.DefaultTabBar` | Override the tab bar entirely. |
| `containerStyle` | `StyleProp<ViewStyle>` | — | Style applied to the outermost view. |
| `swipeEnabled` | `boolean` | `true` | Enable horizontal swipe between tabs. |
| `swipeActivationDistance` | `number` | `15` | Pixels of horizontal movement before swipe activates. |
| `swipeFailDistance` | `number` | `10` | Vertical movement that cancels swipe in favor of vertical scroll. |
| `springConfig` | `SpringConfig` | `{ damping: 30, stiffness: 200, overshootClamping: true }` | Spring used when settling the pager after a swipe. |
| `minPageContentHeight` | `number` | `1.3 × screen height` | Minimum content height per page so short pages still collapse the header. |

### `<Tabs.Tab>`

| Prop | Type | Description |
|---|---|---|
| `name` | `string` | Stable identifier (used as key). |
| `label` | `string` | Optional label for the default tab bar. |
| `icon` | `ReactNode` | Optional icon for the default tab bar. |
| `children` | `ReactNode` | The tab's contents — typically a `Tabs.FlatList` or `Tabs.ScrollView`. |

### `<Tabs.FlatList>`

A drop-in replacement for `FlatList`. Props you can't override (managed by the container):

- `onScroll`, `scrollEventThrottle`, `ref`

Extras:

- `minContentHeight` — override the container's `minPageContentHeight` for this list.

Everything else (`data`, `renderItem`, `numColumns`, `keyExtractor`, `ListHeaderComponent`, `ListFooterComponent`, `contentContainerStyle`, `refreshControl`, …) works as expected. The container injects a header spacer (matching the collapsing + pinned + tab-bar heights) and a footer spacer (tab bar + bottom inset).

### `<Tabs.ScrollView>`

Same idea for non-list content. The container wraps your `children` between header and footer spacers.

### `<Tabs.LegendList>`

A drop-in for [`@legendapp/list`](https://github.com/LegendApp/legend-list) — a virtualized list that's significantly faster than `FlatList` once you have hundreds of items. Uses `AnimatedLegendList` from `@legendapp/list/reanimated` under the hood.

```tsx
<Tabs.Tab name="memories" label="Memories">
  <Tabs.LegendList
    data={memories}
    recycleItems
    keyExtractor={(item) => item.id}
    renderItem={({ item }) => <MemoryCard memory={item} />}
  />
</Tabs.Tab>
```

`@legendapp/list` is an **optional peer** — if you use `Tabs.LegendList`, install it in your app:

```sh
npm install @legendapp/list
```

Props you can't override (managed by the container): `onScroll`, `scrollEventThrottle`, `refScrollView`. The `recycleItems` prop is recommended for best performance.

### `<Tabs.DefaultTabBar>`

The styled default. Rendered automatically; you only need it if you're composing your own `renderTabBar`:

```tsx
renderTabBar={(props) => (
  <Tabs.DefaultTabBar
    {...props}
    colors={{
      floatingBackground: '#fff',
      pinnedBackground: '#fff',
      pillBackground: '#000',
      iconTint: '#000',
      labelColor: '#000',
      trackBackground: 'rgba(0,0,0,0.06)',
    }}
  />
)}
```

### Custom tab bar

`renderTabBar` receives the full set of animated values driving the tabs:

```ts
interface TabBarRenderProps {
  tabs: TabConfig[];
  scrollY: SharedValue<number>;       // active page's scroll position
  headerHeight: SharedValue<number>;  // measured collapsing header height
  activeIndex: SharedValue<number>;   // current tab index (snapped)
  pagerOffset: DerivedValue<number>;  // fractional page offset, 0..N-1
  pillWidth: SharedValue<number>;     // width of one tab slot (you set this on layout)
  pinnedHeaderHeight: number;
  tabBarHeight: number;
  topInset: number;
  onTabPress: (index: number) => void;
}
```

Use these inside `useAnimatedStyle` to build any tab bar you want.

### Hooks

For advanced cases (a sticky filter bar inside a tab, etc.), the same context is exposed:

```ts
import { useTabsContext, useTabIndex } from 'react-native-collapsible-fluid-tabs';
```

`useTabsContext()` works inside a `<Tabs.Container>`. `useTabIndex()` works inside a `<Tabs.Tab>` and returns that tab's index.

## Notes

- **Stable tab count.** Adding or removing tabs across renders is not supported — wrap conditional tabs around the whole `<Tabs.Container>` or include all of them and hide content per-tab.
- **iOS/Android first.** The pager and scroll-sync are tuned for native; web works but hasn't been QA'd yet.
- **`Tabs.FlatList` ref.** A forwarded ref hands you back the underlying `FlatList`. The container also keeps an internal animated ref it uses for `scrollTo` synchronization.

## License

MIT
