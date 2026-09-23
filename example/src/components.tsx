import { useMemo, useState, type ReactNode } from 'react';
import {
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
  type ViewProps,
} from 'react-native';
import {
  GestureDetector,
  Touchable,
  VirtualGestureDetector,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import {
  useCollapsibleHeader,
  useTabsContext,
  type TabBarRenderProps,
} from 'react-native-collapsible-fluid-tabs';
import ArrowLeft from 'reicon-react-native/icons/ArrowLeft';
import ClapperboardPlay from 'reicon-react-native/icons/ClapperboardPlay';
import Grid from 'reicon-react-native/icons/Grid';
import UserSquare from 'reicon-react-native/icons/UserSquare';
import { PHOTOS } from './demo';

export const colors = {
  ink: '#172321',
  muted: '#67736e',
  paper: '#f5f4ef',
  line: '#e4e8e5',
  lime: '#deeead',
};

export function Button({
  children,
  label,
  onPress,
  style,
  dark = false,
  disabled = false,
  selected,
}: {
  children: ReactNode;
  label?: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  dark?: boolean;
  disabled?: boolean;
  selected?: boolean;
}) {
  return (
    <Touchable
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected }}
      aria-pressed={selected}
      disabled={disabled}
      onPress={onPress}
      onAccessibilityTap={disabled ? undefined : onPress}
      {...(Platform.OS === 'web'
        ? {
            onKeyDown: ((event) => {
              if (
                !disabled &&
                (event.nativeEvent.key === 'Enter' ||
                  event.nativeEvent.key === ' ')
              ) {
                event.preventDefault();
                onPress();
              }
            }) satisfies NonNullable<ViewProps['onKeyDown']>,
          }
        : {})}
      activeOpacity={0.65}
      style={[s.button, dark && s.darkButton, style, disabled && s.disabled]}
    >
      {typeof children === 'string' ? (
        <Text style={[s.buttonText, dark && s.lightText]}>{children}</Text>
      ) : (
        children
      )}
    </Touchable>
  );
}

export function BackButton({
  onPress,
  light = false,
}: {
  onPress: () => void;
  light?: boolean;
}) {
  return (
    <Button label="Back to examples" onPress={onPress} style={s.back}>
      <ArrowLeft
        size={24}
        color={light ? '#fff' : colors.ink}
        accessible={false}
        aria-hidden
      />
    </Button>
  );
}

export function Avatar({
  size = 44,
  ring = false,
}: {
  size?: number;
  ring?: boolean;
}) {
  return (
    <View
      style={[
        s.avatarBorder,
        { width: size, height: size, borderRadius: size / 2 },
        ring && s.storyRing,
      ]}
    >
      <Image
        source={PHOTOS[0]!.source}
        style={[s.avatarImage, { borderRadius: size / 2 }]}
        accessibilityLabel="Rowan’s ocean profile photo"
      />
    </View>
  );
}

const iconStyle = { opacity: 0.45 };

export function GridIcon({ active = true }: { active?: boolean }) {
  return (
    <Grid
      accessible={false}
      aria-hidden
      size={24}
      color={colors.ink}
      weight={active ? 'Filled' : 'Outline'}
      style={active ? undefined : iconStyle}
    />
  );
}

export function ReelsIcon({ active = true }: { active?: boolean }) {
  return (
    <ClapperboardPlay
      accessible={false}
      aria-hidden
      size={24}
      color={colors.ink}
      weight={active ? 'Filled' : 'Outline'}
      style={active ? undefined : iconStyle}
    />
  );
}

export function TaggedIcon({ active = true }: { active?: boolean }) {
  return (
    <UserSquare
      accessible={false}
      aria-hidden
      size={24}
      color={colors.ink}
      weight={active ? 'Filled' : 'Outline'}
      style={active ? undefined : iconStyle}
    />
  );
}

const TapDetector =
  Platform.OS === 'web' ? GestureDetector : VirtualGestureDetector;

function ProfileTab({
  index,
  selected,
  label,
  icon,
  onTabPress,
}: {
  index: number;
  selected: boolean;
  label: string;
  icon?: ReactNode;
  onTabPress: (index: number) => void;
}) {
  const { pullPanGesture } = useTabsContext();
  const tap = useTapGesture(
    useMemo(
      () => ({
        requireToFail: pullPanGesture,
        onActivate: () => {
          'worklet';
          scheduleOnRN(onTabPress, index);
        },
      }),
      [index, onTabPress, pullPanGesture]
    )
  );
  return (
    <TapDetector gesture={tap} touchAction="pan-y">
      <View
        accessible
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        aria-selected={selected}
        onAccessibilityTap={() => onTabPress(index)}
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'activate') onTabPress(index);
        }}
        {...(Platform.OS === 'web'
          ? {
              tabIndex: 0,
              onKeyDown: ((event) => {
                const key = event.nativeEvent.key;
                if (key === 'Enter' || key === ' ') {
                  event.preventDefault();
                  onTabPress(index);
                }
              }) satisfies NonNullable<ViewProps['onKeyDown']>,
            }
          : {})}
        style={s.profileTab}
      >
        {icon ?? (
          <Text style={[s.tabText, selected && s.tabTextSelected]}>
            {label}
          </Text>
        )}
      </View>
    </TapDetector>
  );
}

export function ProfileTabBar({
  selectedIndex,
  variant,
  ...props
}: TabBarRenderProps & { selectedIndex: number; variant: 'x' | 'instagram' }) {
  const { headerHeight, collapseProgress, scrollY } = useCollapsibleHeader();
  const {
    pinnedHeaderHeight,
    topInset,
    tabBarHeight,
    pagerOffset,
    tabs,
    onTabPress,
    pullDownBehavior,
  } = props;
  const [width, setWidth] = useState(0);
  const wrap = useAnimatedStyle(() => ({
    transform: [
      {
        translateY:
          headerHeight.value * (1 - collapseProgress.value) +
          (pullDownBehavior === 'stretch' ? Math.max(0, -scrollY.value) : 0),
      },
    ],
  }));
  const marker = useAnimatedStyle(() => ({
    transform: [
      {
        translateX:
          (Math.max(0, Math.min(tabs.length - 1, pagerOffset.value)) * width) /
          tabs.length,
      },
    ],
  }));
  const icons =
    variant === 'instagram' ? [GridIcon, ReelsIcon, TaggedIcon] : undefined;
  return (
    <Animated.View
      testID="profile-tab-bar"
      accessibilityRole="tablist"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={[
        s.tabBar,
        { top: pinnedHeaderHeight + topInset, height: tabBarHeight },
        wrap,
      ]}
    >
      {tabs.map((tab, i) => {
        const Icon = icons?.[i];
        return (
          <ProfileTab
            key={tab.name}
            index={i}
            label={tab.label ?? tab.name}
            selected={selectedIndex === i}
            icon={Icon ? <Icon active={selectedIndex === i} /> : undefined}
            onTabPress={onTabPress}
          />
        );
      })}
      <Animated.View
        pointerEvents="none"
        style={[s.markerSlot, { width: `${100 / tabs.length}%` }, marker]}
      >
        <View
          style={[s.marker, variant === 'instagram' && s.instagramMarker]}
        />
      </Animated.View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  button: {
    minHeight: 48,
    minWidth: 48,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 24,
    backgroundColor: '#eef1ee',
  },
  darkButton: { backgroundColor: colors.ink },
  buttonText: { color: colors.ink, fontWeight: '700', fontSize: 14 },
  lightText: { color: '#fff' },
  disabled: { opacity: 0.4 },
  back: { paddingHorizontal: 0, backgroundColor: 'transparent' },
  avatarBorder: {
    borderWidth: 3,
    borderColor: '#fff',
    overflow: 'hidden',
    backgroundColor: '#b4c9c6',
  },
  avatarImage: { width: '100%', height: '100%' },
  storyRing: { borderColor: '#c46269', padding: 3 },
  tabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#d9dfdc',
  },
  profileTab: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: { color: '#6c767c', fontSize: 15, fontWeight: '600' },
  tabTextSelected: { color: '#172321', fontWeight: '800' },
  markerSlot: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    height: 4,
    alignItems: 'center',
  },
  marker: { width: 38, height: 4, borderRadius: 2, backgroundColor: '#1d9bf0' },
  instagramMarker: {
    backgroundColor: colors.ink,
    width: '100%',
    height: 2,
    borderRadius: 0,
    marginTop: 2,
  },
});
