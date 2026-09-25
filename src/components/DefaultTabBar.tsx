import React, {
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import {
  GestureDetector,
  ScrollView,
  VirtualGestureDetector,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  useReducedMotion,
  type DerivedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { TabsContext } from '../context';
import {
  getHeaderCollapseRange,
  getHeaderScrollOffset,
} from '../utils/paging';
import type { TabBarRenderProps, TabConfig } from '../types';

/** Color overrides for {@link DefaultTabBarProps.colors}. */
export interface DefaultTabBarColors {
  /** Background of the tab bar. */
  background?: string;
  /** Track color behind the pill. */
  trackBackground?: string;
  /** Color of the moving pill behind the active tab. */
  pillBackground?: string;
  /** Tint supplied to icon elements through both `color` and `tintColor`. */
  iconTint?: string;
  /** Color used for label text. */
  labelColor?: string;
  /** Background of the tab badge bubble/dot. */
  badgeBackground?: string;
  /** Color of the badge count text. */
  badgeText?: string;
}

/** Props for {@link DefaultTabBar}, including state supplied by the container. */
export interface DefaultTabBarProps extends TabBarRenderProps {
  /** Overrides for the default light tab-bar palette. */
  colors?: DefaultTabBarColors;
  /** Side padding inside the pill container. Default 16. */
  sidePadding?: number;
  /**
   * Minimum width an equal-width tab may shrink to before the bar switches to
   * its horizontally scrollable, content-width layout. Default 88.
   * Only consulted when `scrollable` is `'auto'`.
   */
  minTabWidth?: number;
  /**
   * Layout mode. `'auto'` (default) uses an equal-width pill when the tabs fit
   * and a scrollable content-width pill when they'd be narrower than
   * `minTabWidth`. `true` forces the scrollable layout; `false` forces
   * equal-width (tabs may get cramped).
   */
  scrollable?: 'auto' | boolean;
}

const DEFAULT_COLORS: Required<DefaultTabBarColors> = {
  background: '#ffffff',
  trackBackground: 'rgba(120, 120, 128, 0.16)',
  pillBackground: '#ffffff',
  iconTint: '#1c1c1e',
  labelColor: '#1c1c1e',
  badgeBackground: '#ff3b30',
  badgeText: '#ffffff',
};

// Inner padding of the pill track (px). The moving pill is offset by this and
// each tab slot's width subtracts it from both sides — derive both from this one
// constant so the pill stays aligned if the padding ever changes.
const PILL_PADDING = 3;

// Tab labels fade from fully opaque (active) to TAB_INACTIVE_OPACITY as the page
// moves TAB_FADE_DISTANCE (in fractional pages) away from that tab.
const TAB_INACTIVE_OPACITY = 0.4;
const TAB_FADE_DISTANCE = 0.5;
const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);
const TabGestureDetector =
  Platform.OS === 'web' ? GestureDetector : VirtualGestureDetector;

/** Pill tab bar that follows paging and header collapse; accepts the container's renderTabBar props. */
export function DefaultTabBar(props: DefaultTabBarProps) {
  const {
    tabs,
    scrollY,
    perPageScrollY,
    scrollToTopIndex,
    scrollToTopOffset,
    tabCount,
    headerHeight,
    activeIndex,
    pagerOffset,
    pillWidth,
    tabBarHeight,
    topInset,
    pinnedHeaderHeight,
    minHeaderHeight,
    pullDownBehavior,
    onTabPress,
    colors,
    sidePadding = 16,
    minTabWidth = 88,
    scrollable = 'auto',
  } = props;

  const { width: screenWidth } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState<number>();
  // Nullable on purpose: the default bar can be rendered through a custom
  // renderTabBar wrapper, but the pull relation only exists inside a
  // Tabs.Container.
  const pullPanGesture = useContext(TabsContext)?.pullPanGesture;
  const c = { ...DEFAULT_COLORS, ...(colors ?? {}) };
  const topOffset = pinnedHeaderHeight + topInset;
  const stretch = pullDownBehavior === 'stretch';
  const containerWidth = Math.max(
    0,
    (measuredWidth ?? screenWidth) - sidePadding * 2
  );
  const fallbackScrollToTopIndex = useSharedValue(-1);
  const fallbackScrollToTopOffset = useSharedValue(0);
  const headerScrollToTopIndex = scrollToTopIndex ?? fallbackScrollToTopIndex;
  const headerScrollToTopOffset =
    scrollToTopOffset ?? fallbackScrollToTopOffset;

  // 'auto': equal-width pill when tabs fit; scrollable content-width pill when
  // equal slices would be narrower than minTabWidth. true/false force the mode.
  const isScrollable =
    scrollable === 'auto'
      ? containerWidth / tabs.length < minTabWidth
      : scrollable;

  // Mirror the active page into JS state so each tab can report its
  // accessibilityState. Only fires on whole-page changes, not per frame.
  const [selectedIndex, setSelectedIndex] = useState(0);
  useAnimatedReaction(
    () => {
      'worklet';
      return Math.round(activeIndex.value);
    },
    (curr, prev) => {
      'worklet';
      if (curr !== prev) scheduleOnRN(setSelectedIndex, curr);
    }
  );

  const wrapStyle = useAnimatedStyle(() => {
    'worklet';
    const offset = getHeaderScrollOffset(
      activeIndex.value,
      tabCount,
      perPageScrollY,
      scrollY,
      headerScrollToTopIndex.value,
      headerScrollToTopOffset.value
    );
    const h = headerHeight.value;
    const range = getHeaderCollapseRange(h, minHeaderHeight);
    const translateY =
      offset < 0
        ? stretch
          ? h + Math.abs(offset)
          : h
        : range <= 0
          ? h
          : interpolate(
              offset,
              [0, range],
              [h, minHeaderHeight],
              Extrapolation.CLAMP
            );

    return { transform: [{ translateY }] };
  });

  const shared = {
    tabs,
    pagerOffset,
    activeIndex,
    selectedIndex,
    onTabPress,
    colors: c,
    pullPanGesture,
  };

  return (
    <Animated.View
      onLayout={(event) => setMeasuredWidth(event.nativeEvent.layout.width)}
      style={[
        styles.wrap,
        {
          top: topOffset,
          height: tabBarHeight,
          backgroundColor: c.background,
        },
        wrapStyle,
      ]}
    >
      {isScrollable ? (
        <ScrollableBar {...shared} containerWidth={containerWidth} />
      ) : (
        <FitBar
          {...shared}
          containerWidth={containerWidth}
          pillWidth={pillWidth}
        />
      )}
    </Animated.View>
  );
}

interface BarProps {
  tabs: TabConfig[];
  pagerOffset: DerivedValue<number>;
  activeIndex: SharedValue<number>;
  selectedIndex: number;
  onTabPress: (index: number) => void;
  colors: Required<DefaultTabBarColors>;
  containerWidth: number;
  pullPanGesture?: object;
}

/** Equal-width pill bar, used when all tabs fit at `minTabWidth` or wider. */
function FitBar({
  tabs,
  pagerOffset,
  selectedIndex,
  onTabPress,
  colors: c,
  containerWidth,
  pillWidth,
  pullPanGesture,
}: BarProps & { pillWidth: SharedValue<number> }) {
  const pillStyle = useAnimatedStyle(() => {
    'worklet';
    const maxOffset = (tabs.length - 1) * pillWidth.value;
    const clampedX = Math.max(
      0,
      Math.min(pagerOffset.value * pillWidth.value, maxOffset)
    );
    return {
      width: pillWidth.value,
      transform: [{ translateX: PILL_PADDING + clampedX }],
      backgroundColor: c.pillBackground,
    };
  });

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.pillContainer,
        { width: containerWidth, backgroundColor: c.trackBackground },
      ]}
      onLayout={(e) => {
        pillWidth.value =
          (e.nativeEvent.layout.width - PILL_PADDING * 2) / tabs.length;
      }}
    >
      <Animated.View style={[styles.pill, pillStyle]} />
      {tabs.map((tab, index) => (
        <TabButton
          key={tab.name}
          index={index}
          tab={tab}
          pagerOffset={pagerOffset}
          iconTint={c.iconTint}
          labelColor={c.labelColor}
          badgeBackground={c.badgeBackground}
          badgeText={c.badgeText}
          selected={index === selectedIndex}
          onTabPress={onTabPress}
          pullPanGesture={pullPanGesture}
        />
      ))}
    </View>
  );
}

/** Content-width, horizontally scrollable pill bar for many/long tabs. */
function ScrollableBar({
  tabs,
  pagerOffset,
  activeIndex,
  selectedIndex,
  onTabPress,
  colors: c,
  containerWidth,
  pullPanGesture,
}: BarProps) {
  const scrollRef = useAnimatedRef<ScrollView>();
  const reduceMotion = useReducedMotion();
  // Measured { x, width } for each tab, in content coordinates — drives the
  // variable-width pill and the auto-scroll centering.
  const tabLayouts = useSharedValue<{ x: number; width: number }[]>([]);
  const layoutsRef = useRef<{ x: number; width: number }[]>([]);

  const setLayout = (index: number, x: number, width: number) => {
    layoutsRef.current[index] = { x, width };
    // Reassign so the worklet sees a new reference once all tabs are in.
    if (layoutsRef.current.filter(Boolean).length === tabs.length) {
      tabLayouts.value = layoutsRef.current.slice();
    }
  };

  const pillStyle = useAnimatedStyle(() => {
    'worklet';
    const layouts = tabLayouts.value;
    if (layouts.length < tabs.length) {
      return { opacity: 0, width: 0, transform: [{ translateX: 0 }] };
    }
    const offset = Math.max(0, Math.min(pagerOffset.value, tabs.length - 1));
    const i = Math.floor(offset);
    const f = offset - i;
    const a = layouts[i]!;
    const b = layouts[Math.min(i + 1, tabs.length - 1)]!;
    return {
      opacity: 1,
      width: a.width + (b.width - a.width) * f,
      transform: [{ translateX: a.x + (b.x - a.x) * f }],
      backgroundColor: c.pillBackground,
    };
  });

  // Centre the tab when navigation selects a target, before the pager settles.
  useAnimatedReaction(
    () => {
      'worklet';
      return {
        index: Math.round(activeIndex.value),
        layouts: tabLayouts.value,
      };
    },
    ({ index: i, layouts }, previous) => {
      'worklet';
      if (layouts.length < tabs.length) return;
      const tab = layouts[Math.max(0, Math.min(i, tabs.length - 1))]!;
      const target = tab.x + tab.width / 2 - containerWidth / 2;
      scrollTo(
        scrollRef,
        Math.max(0, target),
        0,
        !reduceMotion && previous !== null
      );
    }
  );

  return (
    <AnimatedScrollView
      ref={scrollRef}
      horizontal
      requireToFail={pullPanGesture as never}
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      style={[
        styles.scrollBar,
        { maxWidth: containerWidth, backgroundColor: c.trackBackground },
      ]}
      contentContainerStyle={styles.scrollContent}
    >
      <Animated.View style={[styles.pill, pillStyle]} />
      {tabs.map((tab, index) => (
        <TabButton
          key={tab.name}
          index={index}
          tab={tab}
          pagerOffset={pagerOffset}
          iconTint={c.iconTint}
          labelColor={c.labelColor}
          badgeBackground={c.badgeBackground}
          badgeText={c.badgeText}
          selected={index === selectedIndex}
          onTabPress={onTabPress}
          onMeasure={setLayout}
          pullPanGesture={pullPanGesture}
        />
      ))}
    </AnimatedScrollView>
  );
}

interface TabButtonProps {
  index: number;
  tab: TabConfig;
  pagerOffset: DerivedValue<number> | SharedValue<number>;
  iconTint: string;
  labelColor: string;
  badgeBackground: string;
  badgeText: string;
  selected: boolean;
  onTabPress: (index: number) => void;
  /** When provided, the button reports its layout and uses content width. */
  onMeasure?: (index: number, x: number, width: number) => void;
  pullPanGesture?: object;
}

function TabButton({
  index,
  tab,
  pagerOffset,
  iconTint,
  labelColor,
  badgeBackground,
  badgeText,
  selected,
  onTabPress,
  onMeasure,
  pullPanGesture,
}: TabButtonProps) {
  const onPress = useCallback(() => onTabPress(index), [index, onTabPress]);
  const label = tab.label || (tab.icon == null ? tab.name : undefined);
  const animStyle = useAnimatedStyle(() => {
    'worklet';
    const distance = Math.abs(pagerOffset.value - index);
    const opacity =
      distance < TAB_FADE_DISTANCE
        ? interpolate(
            distance,
            [0, TAB_FADE_DISTANCE],
            [1, TAB_INACTIVE_OPACITY],
            Extrapolation.CLAMP
          )
        : TAB_INACTIVE_OPACITY;
    return { opacity };
  });

  // A stationary release selects the tab. A vertical drag owns the entire
  // touch once it activates, including reversals; it must not also tap a tab.
  const tap = useTapGesture(
    useMemo(
      () => ({
        requireToFail: pullPanGesture ? [pullPanGesture as never] : undefined,
        onActivate: () => {
          'worklet';
          scheduleOnRN(onPress);
        },
      }),
      [onPress, pullPanGesture]
    )
  );

  const handleLayout = onMeasure
    ? (e: LayoutChangeEvent) => {
        const { x, width } = e.nativeEvent.layout;
        onMeasure(index, x, width);
      }
    : undefined;

  return (
    <TabGestureDetector gesture={tap}>
      <View
        style={onMeasure ? styles.tabButtonScroll : styles.tabButton}
        onLayout={handleLayout}
        accessible
        focusable={Platform.OS === 'web'}
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        aria-selected={selected}
        accessibilityLabel={tab.label || tab.name}
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityTap={onPress}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'activate') onPress();
        }}
      >
        <Animated.View style={[styles.tabButtonInner, animStyle]}>
          {renderIcon(tab.icon, iconTint)}
          {label ? (
            <Text
              style={[styles.label, { color: labelColor }]}
              numberOfLines={1}
            >
              {label}
            </Text>
          ) : null}
          {tab.badge != null && tab.badge !== false ? (
            tab.badge === true ? (
              <View
                style={[styles.badgeDot, { backgroundColor: badgeBackground }]}
              />
            ) : (
              <View
                style={[styles.badge, { backgroundColor: badgeBackground }]}
              >
                <Text style={[styles.badgeLabel, { color: badgeText }]}>
                  {String(tab.badge)}
                </Text>
              </View>
            )
          ) : null}
        </Animated.View>
      </View>
    </TabGestureDetector>
  );
}

function renderIcon(icon: ReactNode, tintColor: string): ReactNode {
  if (icon == null) return null;
  if (React.isValidElement(icon)) {
    // Pass tintColor down for consumers who want it via cloneElement.
    return React.cloneElement(
      icon as React.ReactElement<{ tintColor?: string; color?: string }>,
      { tintColor, color: tintColor }
    );
  }
  return icon;
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillContainer: {
    flexDirection: 'row',
    borderRadius: 100,
    padding: PILL_PADDING,
  },
  scrollBar: {
    borderRadius: 100,
    flexGrow: 0,
  },
  scrollContent: {
    flexDirection: 'row',
    padding: PILL_PADDING,
  },
  pill: {
    position: 'absolute',
    top: PILL_PADDING,
    bottom: PILL_PADDING,
    left: 0,
    borderRadius: 100,
    // CSS box shadow (new-architecture RN + react-native-web) renders on both
    // platforms — the old shadow* keys were iOS-only, leaving Android flat.
    boxShadow: '0 1px 4px rgba(0, 0, 0, 0.1)',
  },
  tabButton: {
    flex: 1,
    minHeight: 48,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonScroll: {
    minHeight: 48,
    paddingVertical: 8,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonInner: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
  },
  badge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
  badgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
