# Fluid Tabs native header scroll (iOS, experimental)

A local Expo module that gives `Tabs.Container` native header scrolling on
iOS. Drags that start on the header, tab bar or list all drive the active
list's own `UIScrollView`, so momentum, overscroll, bounce and pull-to-refresh
behave the same everywhere.

It uses a UIKit technique Apple demonstrated in WWDC 2014 session 235: attach
a scroll view's existing `panGestureRecognizer` to an ancestor view. UIKit
keeps driving the original scroll view; nothing is re-implemented in
JavaScript and no scroll offsets are written frame by frame.

## Pieces

- `FluidTabsNativeScrollHost` is the container root, the common ancestor of
  the header, tab bar and pager. It receives `activePageIndex` and `paging`
  together from the UI thread.
- `FluidTabsNativeScrollPage` wraps exactly one list's native scroll view.
  Custom renderers must contain one outer scroll view; nested horizontal
  scrollers inside it are ignored, and ambiguous pages are rejected.
- `FTNSScrollCoordinator` moves the active list's pan recognizer and its
  Gesture Handler Native handler onto the host while no finger is down, and
  restores them on page changes, unmount, backgrounding and handler unbind.
  While a horizontal page change is still settling, header drags are held so
  the right list scrolls.

## Requirements

- iOS only. Android and web keep the library's existing behavior.
- react-native-gesture-handler 3.2.1 with the external scroll patch in
  `.yarn/patches`. Without it Gesture Handler loses track of the moved pan.
- A new development build. Metro reloads cannot add native code.

## Usage

```ts
import { registerNativeHeaderScroll } from 'react-native-collapsible-fluid-tabs';
import { nativeHeaderScrollViews } from './modules/fluid-tabs-native-scroll';

// Once, before any Tabs.Container renders. null keeps the JavaScript header drag.
registerNativeHeaderScroll(nativeHeaderScrollViews);
```

## Verification

Compiled and tested on device inside a consumer app (ScrollView and
LegendList). FlatList and FlashList are wired the same way but still need a
device check. Worth checking on each change: top and bottom bounce and
refresh from the header, tab bar and list; touch-down during momentum; taps
versus drags on header buttons; rapid tab switches; two fingers;
backgrounding; short and empty lists.
