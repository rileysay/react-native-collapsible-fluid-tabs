import { memo, useCallback, useState } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import {
  GestureHandlerRootView,
  RefreshControl,
} from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  Tabs,
  type PullDownBehavior,
} from 'react-native-collapsible-fluid-tabs';

// One tab per list wrapper so every integration ships: FlatList, LegendList,
// ScrollView, FlashList. Controlled mode, live pull/swipe toggles, badges,
// auto-measured pinned header, and scroll-to-top on re-tap.

const TILE_COLORS = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#22c55e',
  '#14b8a6',
  '#0ea5e9',
  '#6366f1',
  '#a855f7',
  '#ec4899',
];

const TILES = Array.from({ length: 60 }, (_, i) => ({
  id: String(i),
  n: i + 1,
  color: TILE_COLORS[i % TILE_COLORS.length]!,
}));

const TAB_NAMES = ['feed', 'grid', 'about', 'flash'];

function ProfileHeader() {
  return (
    <View style={styles.header} pointerEvents="box-none">
      <View style={styles.avatar} />
      <Text style={styles.name}>Jane Doe</Text>
      <Text style={styles.bio}>
        Collapsible header — scroll up to collapse me.
      </Text>
      <View style={styles.stats} pointerEvents="box-none">
        <Stat label="Posts" value="128" />
        <Stat label="Followers" value="4.2K" />
        <Stat label="Following" value="310" />
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

interface PinnedBarProps {
  topInset: number;
  activeName: string;
  pullDown: PullDownBehavior;
  swipeEnabled: boolean;
  onJump: (index: number) => void;
  onTogglePullDown: () => void;
  onToggleSwipe: () => void;
}

function PinnedBar({
  topInset,
  activeName,
  pullDown,
  swipeEnabled,
  onJump,
  onTogglePullDown,
  onToggleSwipe,
}: PinnedBarProps) {
  return (
    <View style={[styles.pinned, { paddingTop: topInset }]}>
      <Text style={styles.pinnedTitle}>Profile · {activeName}</Text>
      <View style={styles.controlRow}>
        <ControlButton label="First" onPress={() => onJump(0)} />
        <ControlButton
          label="Last"
          onPress={() => onJump(TAB_NAMES.length - 1)}
        />
        <ControlButton label={`Pull: ${pullDown}`} onPress={onTogglePullDown} />
        <ControlButton
          label={`Swipe: ${swipeEnabled ? 'on' : 'off'}`}
          onPress={onToggleSwipe}
        />
      </View>
    </View>
  );
}

function ControlButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
    >
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

const Tile = memo(function Tile({
  tile,
  variant = 'grid',
}: {
  tile: (typeof TILES)[0];
  variant?: 'grid' | 'row';
}) {
  return (
    <View
      style={[
        variant === 'row' ? styles.tileRow : styles.tileWrap,
        { backgroundColor: tile.color },
      ]}
    >
      <Text style={styles.tileLabel}>{tile.n}</Text>
    </View>
  );
});

function ScrollViewContent() {
  return (
    <View style={styles.about}>
      <Text style={styles.cardTitle}>About (ScrollView tab)</Text>
      <Text style={styles.cardBody}>
        This tab uses Tabs.ScrollView instead of a list. Scroll it to confirm
        the collapsible header collapses here too, and that swiping back keeps
        the header position in sync across tabs.
      </Text>
      {Array.from({ length: 12 }, (_, i) => (
        <View key={i} style={styles.aboutBlock}>
          <Text style={styles.cardTitle}>Section {i + 1}</Text>
          <Text style={styles.cardBody}>
            Filler text so the ScrollView is tall enough to scroll and collapse
            the header.
          </Text>
        </View>
      ))}
    </View>
  );
}

export default function App() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [pullDown, setPullDown] = useState<PullDownBehavior>('static');
  const [swipeEnabled, setSwipeEnabled] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1500);
  }, []);

  const makeRefreshControl = useCallback(
    () => <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />,
    [refreshing, onRefresh]
  );

  const renderGridTile = useCallback(
    ({ item }: { item: (typeof TILES)[0] }) => <Tile tile={item} />,
    []
  );
  const renderRowTile = useCallback(
    ({ item }: { item: (typeof TILES)[0] }) => (
      <Tile tile={item} variant="row" />
    ),
    []
  );

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={styles.flex}>
        <StatusBar barStyle="dark-content" />
        <Tabs.Container
          renderHeader={ProfileHeader}
          renderPinnedHeader={({ topInset }) => (
            <PinnedBar
              topInset={topInset}
              activeName={TAB_NAMES[activeIndex] ?? `#${activeIndex}`}
              pullDown={pullDown}
              swipeEnabled={swipeEnabled}
              onJump={setActiveIndex}
              onTogglePullDown={() =>
                setPullDown((p) => (p === 'static' ? 'stretch' : 'static'))
              }
              onToggleSwipe={() => setSwipeEnabled((s) => !s)}
            />
          )}
          tabBarHeight={56}
          estimatedHeaderHeight={250}
          index={activeIndex}
          onIndexChange={setActiveIndex}
          pullDownBehavior={pullDown}
          swipeEnabled={swipeEnabled}
          containerStyle={styles.container}
        >
          <Tabs.Tab name="feed" label="Feed">
            <Tabs.FlatList
              data={TILES}
              keyExtractor={(item) => item.id}
              renderItem={renderRowTile}
              refreshControl={makeRefreshControl()}
            />
          </Tabs.Tab>

          <Tabs.Tab name="grid" label="Grid">
            <Tabs.LegendList
              data={TILES}
              numColumns={3}
              recycleItems
              getItemType={() => 'tile'}
              keyExtractor={(item) => item.id}
              renderItem={renderGridTile}
              refreshControl={makeRefreshControl()}
            />
          </Tabs.Tab>

          <Tabs.Tab name="about" label="About">
            <Tabs.ScrollView refreshControl={makeRefreshControl()}>
              <ScrollViewContent />
            </Tabs.ScrollView>
          </Tabs.Tab>

          <Tabs.Tab name="flash" label="Flash" badge={3}>
            <Tabs.FlashList
              data={TILES}
              keyExtractor={(item) => `f-${item.id}`}
              renderItem={renderRowTile}
              refreshControl={makeRefreshControl()}
            />
          </Tabs.Tab>
        </Tabs.Container>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { backgroundColor: '#ffffff' },
  header: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    gap: 8,
    backgroundColor: '#ffffff',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#d0d0d8',
  },
  name: { fontSize: 20, fontWeight: '700', color: '#1c1c1e' },
  bio: { fontSize: 14, color: '#6c6c70', textAlign: 'center' },
  stats: { flexDirection: 'row', gap: 32, marginTop: 8 },
  stat: { alignItems: 'center', gap: 2 },
  statValue: { fontSize: 16, fontWeight: '700', color: '#1c1c1e' },
  statLabel: { fontSize: 12, color: '#8e8e93' },
  pinned: {
    backgroundColor: '#ffffff',
    gap: 6,
    paddingHorizontal: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e5ea',
  },
  pinnedTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1c1c1e',
    textAlign: 'center',
  },
  controlRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
  },
  btn: {
    backgroundColor: '#1c1c1e',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  btnPressed: { opacity: 0.6 },
  btnText: { color: '#ffffff', fontSize: 12, fontWeight: '600' },
  tileWrap: { flex: 1 / 3, aspectRatio: 1, margin: 1 },
  tileRow: { width: '100%', aspectRatio: 1, marginBottom: 1 },
  tileLabel: {
    position: 'absolute',
    bottom: 4,
    right: 6,
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 3,
  },
  cardTitle: { fontSize: 17, fontWeight: '600', color: '#1c1c1e' },
  cardBody: { marginTop: 6, fontSize: 15, lineHeight: 21, color: '#3c3c43' },
  about: { padding: 20, gap: 8 },
  aboutBlock: { gap: 4, marginTop: 8 },
});
