import { memo, useCallback, useState } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import {
  GestureHandlerRootView,
  // Gesture-aware RefreshControl — RN's own RefreshControl needs a second
  // touch to commit inside the pager's gesture detector on Android.
  RefreshControl,
} from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  Tabs,
  type PullDownBehavior,
} from 'react-native-collapsible-fluid-tabs';

// One tab per list wrapper, named after it, so every integration the library
// ships is exercised: FlatList / LegendList / FlashList / ScrollView. The
// pager runs in controlled mode (`index` + `onIndexChange`), the pinned bar
// height is auto-measured (no pinnedHeaderHeight prop), tab badges are shown,
// and pullDownBehavior / swipeEnabled are live toggles. Tapping the active
// tab again scrolls its list back to the top (on by default).

const POSTS = Array.from({ length: 30 }, (_, i) => ({
  id: `p${i}`,
  title: `Post ${i + 1}`,
  body: 'Exploring new ideas and sharing them with the world. Building things that matter.',
}));

const TILES = Array.from({ length: 60 }, (_, i) => ({
  id: `t${i}`,
  n: i + 1,
  color: `hsl(${(i * 37) % 360}, 60%, 70%)`,
}));

const TAB_NAMES = ['flatlist', 'legendlist', 'flashlist', 'scrollview'];

// ---------------------------------------------------------------------------
// Collapsible + pinned headers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Row components (module scope + memo so list rows don't rebuild per render)
// ---------------------------------------------------------------------------

const PostCard = memo(function PostCard({ post }: { post: (typeof POSTS)[0] }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{post.title}</Text>
      <Text style={styles.cardBody}>{post.body}</Text>
    </View>
  );
});

const HueTile = memo(function HueTile({
  color,
  n,
}: {
  color: string;
  n: number;
}) {
  return (
    <View style={[styles.tile, { backgroundColor: color }]}>
      <Text style={styles.tileLabel}>{n}</Text>
    </View>
  );
});

function ScrollViewContent() {
  return (
    <View style={styles.about}>
      <Text style={styles.cardTitle}>ScrollView tab</Text>
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

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  // Controlled mode: this state owns the active tab. Swipes and tab taps
  // report through onIndexChange and we commit them back; the jump buttons
  // just set state. (Uncontrolled mode — initialIndex + the imperative ref —
  // works too; see the README.)
  const [activeIndex, setActiveIndex] = useState(0);
  const [pullDown, setPullDown] = useState<PullDownBehavior>('static');
  const [swipeEnabled, setSwipeEnabled] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1500);
  }, []);

  // Each list needs its own element instance (the library clones it to inject
  // the Android progressViewOffset and gesture relation).
  const makeRefreshControl = useCallback(
    () => <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />,
    [refreshing, onRefresh]
  );

  const renderPost = useCallback(
    ({ item }: { item: (typeof POSTS)[0] }) => <PostCard post={item} />,
    []
  );
  const renderTile = useCallback(
    ({ item }: { item: (typeof TILES)[0] }) => (
      <HueTile color={item.color} n={item.n} />
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
          // No pinnedHeaderHeight: the pinned bar's height is auto-measured.
          tabBarHeight={56}
          index={activeIndex}
          onIndexChange={setActiveIndex}
          pullDownBehavior={pullDown}
          swipeEnabled={swipeEnabled}
          containerStyle={styles.container}
        >
          <Tabs.Tab name="flatlist" label="FlatList">
            <Tabs.FlatList
              data={POSTS}
              keyExtractor={(item) => item.id}
              renderItem={renderPost}
              refreshControl={makeRefreshControl()}
              contentContainerStyle={styles.listContent}
            />
          </Tabs.Tab>

          <Tabs.Tab name="legendlist" label="LegendList">
            <Tabs.LegendList
              data={TILES}
              numColumns={3}
              recycleItems
              estimatedItemSize={120}
              keyExtractor={(item) => item.id}
              renderItem={renderTile}
              refreshControl={makeRefreshControl()}
            />
          </Tabs.Tab>

          <Tabs.Tab name="flashlist" label="FlashList" badge={3}>
            <Tabs.FlashList
              data={POSTS}
              keyExtractor={(item) => `f-${item.id}`}
              renderItem={renderPost}
              refreshControl={makeRefreshControl()}
              contentContainerStyle={styles.listContent}
            />
          </Tabs.Tab>

          <Tabs.Tab name="scrollview" label="ScrollView" badge>
            <Tabs.ScrollView refreshControl={makeRefreshControl()}>
              <ScrollViewContent />
            </Tabs.ScrollView>
          </Tabs.Tab>
        </Tabs.Container>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { backgroundColor: '#f2f2f7' },
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
  // No fixed height — the container auto-measures the pinned bar, so it must
  // size itself from its content (padding, not flex).
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
  listContent: { paddingHorizontal: 12, gap: 10 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
  },
  cardTitle: { fontSize: 17, fontWeight: '600', color: '#1c1c1e' },
  cardBody: { marginTop: 6, fontSize: 15, lineHeight: 21, color: '#3c3c43' },
  tile: {
    flex: 1,
    aspectRatio: 1,
    margin: 2,
    borderRadius: 8,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    padding: 6,
  },
  tileLabel: { color: '#ffffff', fontWeight: '700', fontSize: 12 },
  about: { padding: 20, gap: 8 },
  aboutBlock: { gap: 4, marginTop: 8 },
});
