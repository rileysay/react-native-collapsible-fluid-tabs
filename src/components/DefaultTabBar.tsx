import React, { type ReactNode } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type DerivedValue,
  type SharedValue,
} from 'react-native-reanimated';

import type { TabBarRenderProps, TabConfig } from '../types';

const SCREEN_WIDTH = Dimensions.get('window').width;

export interface DefaultTabBarColors {
  /** Background of the tab bar when floating (above the collapsing header). */
  floatingBackground?: string;
  /** Background of the tab bar when pinned to the top of the viewport. */
  pinnedBackground?: string;
  /** Track color behind the pill. */
  trackBackground?: string;
  /** Color of the moving pill behind the active tab. */
  pillBackground?: string;
  /** Tint color applied to icons (when icons are images via tintColor). */
  iconTint?: string;
  /** Color used for label text. */
  labelColor?: string;
}

export interface DefaultTabBarProps extends TabBarRenderProps {
  colors?: DefaultTabBarColors;
  /** Horizontal margin when the bar is floating. Default 8. */
  floatingMargin?: number;
  /** Side padding inside the floating bar's pill container. Default 16. */
  sidePadding?: number;
}

const DEFAULT_COLORS: Required<DefaultTabBarColors> = {
  floatingBackground: '#ffffff',
  pinnedBackground: '#ffffff',
  trackBackground: 'rgba(120, 120, 128, 0.16)',
  pillBackground: '#ffffff',
  iconTint: '#1c1c1e',
  labelColor: '#1c1c1e',
};

export function DefaultTabBar(props: DefaultTabBarProps) {
  const {
    tabs,
    scrollY,
    headerHeight,
    pagerOffset,
    pillWidth,
    tabBarHeight,
    topInset,
    pinnedHeaderHeight,
    onTabPress,
    colors,
    floatingMargin = 8,
    sidePadding = 16,
  } = props;

  const c = { ...DEFAULT_COLORS, ...(colors ?? {}) };
  const topOffset = pinnedHeaderHeight + topInset;

  const wrapStyle = useAnimatedStyle(() => {
    'worklet';
    const translateY =
      scrollY.value < 0
        ? headerHeight.value + Math.abs(scrollY.value)
        : interpolate(
            scrollY.value,
            [0, headerHeight.value],
            [headerHeight.value, 0],
            Extrapolation.CLAMP
          );

    const isPinned = translateY === 0;

    return {
      transform: [{ translateY }],
      marginHorizontal: isPinned ? 0 : floatingMargin,
      borderBottomLeftRadius: isPinned ? 0 : 28,
      borderBottomRightRadius: isPinned ? 0 : 28,
      backgroundColor: isPinned ? c.pinnedBackground : c.floatingBackground,
    };
  });

  const pillStyle = useAnimatedStyle(() => {
    'worklet';
    const maxOffset = (tabs.length - 1) * pillWidth.value;
    const clampedX = Math.max(
      0,
      Math.min(pagerOffset.value * pillWidth.value, maxOffset)
    );
    return {
      width: pillWidth.value,
      transform: [{ translateX: 3 + clampedX }],
      backgroundColor: c.pillBackground,
    };
  });

  return (
    <Animated.View
      style={[styles.wrap, { top: topOffset, height: tabBarHeight }, wrapStyle]}
    >
      <View
        style={[
          styles.pillContainer,
          {
            width: SCREEN_WIDTH - sidePadding * 2,
            backgroundColor: c.trackBackground,
          },
        ]}
        onLayout={(e) => {
          pillWidth.value = (e.nativeEvent.layout.width - 6) / tabs.length;
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
            onPress={() => onTabPress(index)}
          />
        ))}
      </View>
    </Animated.View>
  );
}

interface TabButtonProps {
  index: number;
  tab: TabConfig;
  pagerOffset: DerivedValue<number> | SharedValue<number>;
  iconTint: string;
  labelColor: string;
  onPress: () => void;
}

function TabButton({
  index,
  tab,
  pagerOffset,
  iconTint,
  labelColor,
  onPress,
}: TabButtonProps) {
  const animStyle = useAnimatedStyle(() => {
    const distance = Math.abs(pagerOffset.value - index);
    const opacity =
      distance < 0.5
        ? interpolate(distance, [0, 0.5], [1, 0.4], Extrapolation.CLAMP)
        : 0.4;
    return { opacity };
  });

  return (
    <Pressable style={styles.tabButton} onPress={onPress}>
      <Animated.View style={[styles.tabButtonInner, animStyle]}>
        {renderIcon(tab.icon, iconTint)}
        {tab.label ? (
          <Text style={[styles.label, { color: labelColor }]} numberOfLines={1}>
            {tab.label}
          </Text>
        ) : null}
      </Animated.View>
    </Pressable>
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
    paddingBottom: 8,
  },
  pillContainer: {
    flexDirection: 'row',
    borderRadius: 100,
    padding: 3,
  },
  pill: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 0,
    borderRadius: 100,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
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
});
