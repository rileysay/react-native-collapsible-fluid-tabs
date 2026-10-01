# iOS native header scroll (beta)

Experimental, on the `beta/ios-native-scroll` branch. Not published.

## Why

Header and tab-bar touches land outside the active list's native scroll view.
In 1.5.1 a JavaScript pan therefore drives that view with `scrollTo` calls (see
[header scroll momentum](./HEADER-SCROLL-MOMENTUM.md)). That can approximate a
glide, but not UIKit's own physics: a drag or fling that starts on the header
stops dead at the top and bottom, with no rubber-band overscroll or bounce, and
cannot pull the native refresh control the way a list drag does.

## How it works

UIKit lets you attach a scroll view's existing `panGestureRecognizer` to an
ancestor view. The recognizer keeps driving its own scroll view; Apple showed
this in WWDC 2014 session 235, "Advanced Scrollviews and Touch Handling
Techniques". A native host at the container root does this for the active list
while no finger is down, so drags from the header, tab bar and list all go
through the same `UIScrollView`. Nothing is simulated and no offsets are
written frame by frame.

- `registerNativeHeaderScroll(views)` opts in. iOS only; call it once before
  any container renders. Other platforms ignore it.
- The host wraps the collapsible header, tab bar and pager. It receives the
  active page index and a paging flag from the UI thread, and changes ownership
  only when no pointer is down and a page change has settled.
- The pinned area sits outside the host, so drags there never scroll the list,
  as without native scrolling. That includes blank parts of the pinned header
  and the reserved safe-area inset when there is no pinned header: a view
  behind the pinned header takes those touches, so taps there don't reach the
  collapsed header behind it either.
- The container still lays out its own `containerStyle`, padding included,
  around an empty view where the pager used to be. The pager is placed at that
  view's measured frame. With padding, or a layout other than a plain column,
  the pages appear once that frame is measured and the pages' width matches it.
- `headerScrollEnabled={false}` hands the pan back to the active list once no
  finger is down, without cancelling a touch in progress or remounting pages.
- Each adapter (ScrollView, FlatList, LegendList, FlashList) wraps its one
  outer native scroll view in a page registration. For FlatList and LegendList
  the Native gesture detector moves onto that scroll view instead of wrapping
  the list, so the gesture is never attached to two detectors.
- A touch that starts on the header or tab bar while the list is still coasting
  stops the coast first, so the tap reaches the control instead of only
  catching the fling. iOS 17.4 and later use `stopScrollingAndZooming`; older
  versions reset the current offset, which is undocumented and untested.
- While registered, the JavaScript header drag is disabled on iOS.
- Without registration, containers keep the JavaScript header drag.

## Requirements

- The native views. For now they live in the example as a local Expo module,
  [`example/modules/fluid-tabs-native-scroll`](../example/modules/fluid-tabs-native-scroll).
  The library itself contains no native code.
- react-native-gesture-handler 3.2.1 with the external scroll ownership patch
  in `.yarn/patches/react-native-gesture-handler-npm-3.2.1-ios-external-scroll-owner.patch`,
  taken from `rileysay/react-native-gesture-handler@ios-external-scroll-owner`.
  Gesture Handler otherwise identifies a scroll view's pan by the view it is
  attached to and loses track of it after the move. An upstream proposal is
  drafted but not yet opened.
- React Native's `RCTScrollViewComponentView` hit-test fix (`efcab2090`,
  checked in 0.87.1), or a backport of it. Without it, a touch that hit-tests
  to the scroll view's wrapper view instead of the scroll view is treated as a
  header touch. The example backports the fix in its React Native patch.
- A new development build. Metro reloads cannot add native code.

## Comparing

The example home screen has three cards that open the same profile screen:

- **04 / Before** runs on the published 1.5.1 package from npm, installed as
  `react-native-collapsible-fluid-tabs-published`.
- **04B / Before + pointer events** runs 1.5.1 with the header passing touches
  on empty areas through to the list.
- **05 / After** runs on this branch with native header scroll registered.

Each tab uses a different adapter (Looks: LegendList, Posts: FlatList, Saved:
FlashList, About: ScrollView) and has pull-to-refresh. Chips in the header
switch the pull mode, the refresh style (Gesture Handler element, shorthand or
React Native element), the start tab and an inline list renderer; **Re-render**
updates the screen without remounting the lists. Development builds log
momentum, row taps and tab changes to Metro with a `[header-scroll]` prefix.
Start Metro with `EXPO_PUBLIC_NATIVE_HEADER_SCROLL=off` to run this branch's
JavaScript header drag in the same build. Build the example with
`yarn example ios` on a Mac, or with an EAS development build.

## Status

- **Build `58843ed9`:** the earlier prototype of the Gesture Handler patch.
  Ran on an iPhone, where header drags got native momentum, overscroll, bounce
  and refresh, and where the first tab-bar tap during a fling only stopped the
  list.
- **Build `ec3329f8`** (commit `f8ea8db`): the current Gesture Handler patch
  and the coasting stop. Compiled; device checks are pending.
- **Not yet in a build:** the `headerScrollEnabled` host prop and the React
  Native hit-test backport. Both need a new development build.
- Unverified on device: the measured pager placement, including right-to-left
  layouts and `containerStyle` other than a plain column (a row direction,
  wrapping, or a container sized by its content); whether React Native reports
  the end of momentum after the coasting stop (without it, the next row tap can
  be captured); both release orders of two-finger drags; and FlatList and
  FlashList behavior.
- iOS list refresh shorthand creates React Native's `RefreshControl` instead
  of Gesture Handler's. This is experimental and applies with or without
  native header scroll.
- Android and web keep the JavaScript header drag; only iOS moves the list's
  pan. A horizontal swipe that starts on the header does not change tabs, as
  in 1.5.1. A vertical header drag that starts while a page change is still
  animating is held until the page settles.
