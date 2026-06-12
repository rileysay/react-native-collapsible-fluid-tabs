import React, { useRef, useState, type ReactNode } from 'react';
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
  type DerivedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { TabBarRenderProps, TabConfig } from '../types';

export interface DefaultTabBarColors {
  /** Background of the tab bar. */
  background?: string;
  /** Track color behind the pill. */
  trackBackground?: string;
  /** Color of the moving pill behind the active tab. */
  pillBackground?: string;
  /** Tint color applied to icons (when icons are images via tintColor). */
  iconTint?: string;
  /** Color used for label text. */
  labelColor?: string;
  /** Background of the tab badge bubble/dot. */
  badgeBackground?: string;
  /** Color of the badge count text. */
  badgeText?: string;
}

export interface DefaultTabBarProps extends TabBarRenderProps {
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
const TabGestureDetector =
  Platform.OS === 'web' ? GestureDetector : VirtualGestureDetector;

export function DefaultTabBar(props: DefaultTabBarProps) {
  const {
    tabs,
    scrollY,
    headerHeight,
    activeIndex,
    pagerOffset,
    pillWidth,
    tabBarHeight,
    topInset,
    pinnedHeaderHeight,
    pullDownBehavior,
    onTabPress,
    colors,
    sidePadding = 16,
    minTabWidth = 88,
    scrollable = 'auto',
  } = props;

  const { width: screenWidth } = useWindowDimensions();
  const c = { ...DEFAULT_COLORS, ...(colors ?? {}) };
  const topOffset = pinnedHeaderHeight + topInset;
  const stretch = pullDownBehavior === 'stretch';
  const containerWidth = screenWidth - sidePadding * 2;

  // 'auto': equal-width pill when tabs fit; scrollable content-width pill when
  // equal slices would be narrower than minTabWidth. true/false force the mode.
  const isScrollable =
    scrollable === 'auto'
      ? containerWidth / tabs.length < minTabWidth
      : scrollable;

  // Mirror the active page into JS state so each tab can report its
  // accessibilityState. Only fires on whole-page changes, not per frame.
  const [selectedIndex, setSelectedIndex] = useState(() =>
    Math.round(activeIndex.value)
  );
  useAnimatedReaction(
    () => Math.round(activeIndex.value),
    (curr, prev) => {
      if (curr !== prev) scheduleOnRN(setSelectedIndex, curr);
    }
  );

  const wrapStyle = useAnimatedStyle(() => {
    'worklet';
    const translateY =
      scrollY.value < 0
        ? stretch
          ? headerHeight.value + Math.abs(scrollY.value)
          : headerHeight.value
        : interpolate(
            scrollY.value,
            [0, headerHeight.value],
            [headerHeight.value, 0],
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
  };

  return (
    <Animated.View
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
          onPress={() => onTabPress(index)}
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
}: BarProps) {
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
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

  // Keep the active tab centred as it changes (tap or swipe settle).
  useAnimatedReaction(
    () => Math.round(activeIndex.value),
    (i) => {
      const layouts = tabLayouts.value;
      if (layouts.length < tabs.length) return;
      const tab = layouts[Math.max(0, Math.min(i, tabs.length - 1))]!;
      const target = tab.x + tab.width / 2 - containerWidth / 2;
      scrollTo(scrollRef, Math.max(0, target), 0, true);
    }
  );

  return (
    <Animated.ScrollView
      ref={scrollRef}
      horizontal
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
          onPress={() => onTabPress(index)}
          onMeasure={setLayout}
        />
      ))}
    </Animated.ScrollView>
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
  onPress: () => void;
  /** When provided, the button reports its layout and uses content width. */
  onMeasure?: (index: number, x: number, width: number) => void;
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
  onPress,
  onMeasure,
}: TabButtonProps) {
  const animStyle = useAnimatedStyle(() => {
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

  // A tap gesture (not RN's Pressable) keeps the tab button in RNGH's gesture
  // system alongside the pager pan. Mixing RN touch handlers with RNGH leaves
  // the touch responder stuck after some gestures (taps stop registering until
  // another gesture resets it). A Tap's onActivate fires only on a valid tap.
  const tap = useTapGesture({
    onActivate: () => {
      scheduleOnRN(onPress);
    },
  });

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
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        accessibilityLabel={tab.label ?? tab.name}
      >
        <Animated.View style={[styles.tabButtonInner, animStyle]}>
          {renderIcon(tab.icon, iconTint)}
          {tab.label ? (
            <Text
              style={[styles.label, { color: labelColor }]}
              numberOfLines={1}
            >
              {tab.label}
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
    paddingVertical: 8,
    alignItems: 'center',
  },
  tabButtonScroll: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    alignItems: 'center',
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
