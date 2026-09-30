import { useCallback } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from 'react-native-gesture-handler';
import {
  Tabs as BetaTabs,
  type HeaderRenderProps,
} from 'react-native-collapsible-fluid-tabs';
import { Tabs as PublishedTabs } from 'react-native-collapsible-fluid-tabs-published';
import { Avatar, BackButton, Button, colors } from './components';
import {
  GALLERY,
  POSTS,
  keyById,
  photoItemType,
  useDemoRefresh,
  type Photo,
  type Post,
} from './demo';

export type CompareVersion = 'published' | 'passThrough' | 'beta';

// The same screen runs on the published npm package and on this branch.
const TABS: Record<CompareVersion, typeof BetaTabs> = {
  published: PublishedTabs as unknown as typeof BetaTabs,
  passThrough: PublishedTabs as unknown as typeof BetaTabs,
  beta: BetaTabs,
};

const COPY: Record<CompareVersion, { badge: string; note: string }> = {
  published: {
    badge: '1.5.1',
    note: 'Published 1.5.1. Drags that start on the header or tab bar are scrolled from JavaScript, so they stop dead at the top and bottom.',
  },
  passThrough: {
    badge: '1.5.1 + PE',
    note: 'Published 1.5.1 with headerScrollEnabled off and pointerEvents on the header. Drags on empty header areas fall through to the list. Drags on buttons and the tab bar do not scroll.',
  },
  beta: {
    badge: 'NATIVE',
    note: 'This branch. On iOS, drags from the header and tab bar use the list’s own scrolling: momentum, overscroll, bounce and refresh.',
  },
};

const noop = () => {};

// Development diagnostics for the native header scroll device checks: momentum
// begin/end per list, row presses and tab changes, logged to Metro.
function diag(...args: unknown[]) {
  if (__DEV__) console.log('[header-scroll]', ...args);
}

// Pass-through demo: only buttons take a touch. Everything else lets it fall
// to the list underneath, which then scrolls natively.
function pointerEventsFor(version: CompareVersion) {
  const passThrough = version === 'passThrough';
  return {
    container: passThrough ? ('box-none' as const) : ('auto' as const),
    decoration: passThrough ? ('none' as const) : ('auto' as const),
  };
}

function CompareHeader({ version }: { version: CompareVersion }) {
  const pe = pointerEventsFor(version);
  return (
    <View style={s.header} pointerEvents={pe.container}>
      <View style={s.identity} pointerEvents={pe.decoration}>
        <Avatar size={96} />
        <Text style={s.name}>Rowan Miles</Text>
        <Text style={s.handle}>@rowanmiles</Text>
      </View>
      <View style={s.stats} pointerEvents={pe.container}>
        {[
          ['60', 'Looks'],
          ['36', 'Posts'],
          ['60', 'Saved'],
        ].map(([count, label]) => (
          <Button
            key={label}
            label={`${count} ${label}`}
            onPress={noop}
            style={s.stat}
          >
            <Text style={s.statCount}>{count}</Text>
            <Text style={s.statLabel}>{label}</Text>
          </Button>
        ))}
      </View>
      <Button label="Edit profile" onPress={noop} dark style={s.action}>
        Edit profile
      </Button>
      <View style={s.noteWrap} pointerEvents={pe.decoration}>
        <Text style={s.note}>{COPY[version].note}</Text>
      </View>
    </View>
  );
}

function LookTile({ item }: { item: Photo }) {
  return (
    <Pressable
      style={s.lookTile}
      onPress={() => diag('row tap', 'looks', item.id)}
    >
      <Image source={item.source} style={s.fill} />
    </Pressable>
  );
}

function PostRow({ item }: { item: Post }) {
  return (
    <Pressable
      style={s.postRow}
      onPress={() => diag('row tap', 'posts', item.id)}
    >
      <Text style={s.postText}>{item.text}</Text>
      <Text style={s.postMeta}>
        {item.time} · {item.likes} likes
      </Text>
    </Pressable>
  );
}

function SavedTile({ item }: { item: Photo }) {
  return (
    <Pressable
      style={s.savedTile}
      onPress={() => diag('row tap', 'saved', item.id)}
    >
      <Image source={item.source} style={s.fill} />
    </Pressable>
  );
}

const renderLook = ({ item }: { item: Photo }) => <LookTile item={item} />;
const renderPost = ({ item }: { item: Post }) => <PostRow item={item} />;
const renderSaved = ({ item }: { item: Photo }) => <SavedTile item={item} />;

/**
 * A profile screen for comparing header drags. Each tab uses a different list
 * adapter: Looks is a LegendList, Posts a FlatList, Saved a FlashList and
 * About a ScrollView.
 */
export function NativeScrollCompareScreen({
  version,
  onBack,
}: {
  version: CompareVersion;
  onBack: () => void;
}) {
  const Tabs = TABS[version];
  const looks = useDemoRefresh();
  const posts = useDemoRefresh();
  const saved = useDemoRefresh();
  const about = useDemoRefresh();

  const renderHeader = useCallback(
    () => <CompareHeader version={version} />,
    [version]
  );
  const renderPinnedHeader = useCallback(
    ({ topInset }: HeaderRenderProps) => {
      const pe = pointerEventsFor(version);
      return (
        <View
          style={[s.pinned, { paddingTop: topInset }]}
          pointerEvents={pe.container}
        >
          <View style={s.pinnedRow} pointerEvents={pe.container}>
            <BackButton onPress={onBack} />
            <View style={s.pinnedTitleWrap} pointerEvents={pe.decoration}>
              <Text style={s.pinnedTitle}>Profile</Text>
            </View>
            <View
              style={[s.badge, version === 'beta' && s.betaBadge]}
              pointerEvents={pe.decoration}
            >
              <Text style={[s.badgeText, version === 'beta' && s.betaText]}>
                {COPY[version].badge}
              </Text>
            </View>
          </View>
        </View>
      );
    },
    [onBack, version]
  );

  const momentum = (tab: string) => ({
    onMomentumScrollBegin: () => diag(version, tab, 'momentum begin'),
    onMomentumScrollEnd: () => diag(version, tab, 'momentum end'),
  });

  return (
    <View style={s.screen}>
      <Tabs.Container
        renderHeader={renderHeader}
        renderPinnedHeader={renderPinnedHeader}
        pinnedHeaderHeight={56}
        estimatedHeaderHeight={360}
        pullDownBehavior="stretch"
        // The pass-through demo lets touches reach the list instead of the
        // library's JavaScript header drag, which claims header touches by position.
        headerScrollEnabled={version !== 'passThrough'}
        onIndexChange={(index) => diag(version, 'tab', index)}
        containerStyle={s.screen}
      >
        <Tabs.Tab name="looks" label="Looks">
          <Tabs.LegendList
            data={GALLERY}
            keyExtractor={keyById}
            renderItem={renderLook}
            numColumns={2}
            recycleItems
            getItemType={photoItemType}
            refreshControl={<RefreshControl {...looks} />}
            {...momentum('looks')}
          />
        </Tabs.Tab>
        <Tabs.Tab name="posts" label="Posts">
          <Tabs.FlatList
            data={POSTS}
            keyExtractor={keyById}
            renderItem={renderPost}
            refreshControl={<RefreshControl {...posts} />}
            {...momentum('posts')}
          />
        </Tabs.Tab>
        <Tabs.Tab name="saved" label="Saved">
          <Tabs.FlashList
            data={GALLERY}
            keyExtractor={keyById}
            renderItem={renderSaved}
            numColumns={3}
            refreshControl={<RefreshControl {...saved} />}
            {...momentum('saved')}
          />
        </Tabs.Tab>
        <Tabs.Tab name="about" label="About">
          <Tabs.ScrollView
            refreshControl={<RefreshControl {...about} />}
            {...momentum('about')}
          >
            <View style={s.about}>
              <Text style={s.aboutTitle}>What to try</Text>
              {[
                'Fling from the list, then the same fling from the avatar, the stats and the tab bar. Compare the stop at the top and bottom.',
                'Pull down slowly from the header until refresh starts, then let go.',
                'Tap a stat or Edit profile, then start a drag on the same button. A drag should not press it.',
                'Fling a list, then touch the header to catch it mid-scroll.',
                'Swipe between tabs and immediately drag the header.',
                'Looks is a LegendList, Posts a FlatList, Saved a FlashList and this tab a ScrollView.',
              ].map((line) => (
                <Text key={line} style={s.aboutLine}>
                  {line}
                </Text>
              ))}
            </View>
          </Tabs.ScrollView>
        </Tabs.Tab>
      </Tabs.Container>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  pinned: { backgroundColor: colors.paper },
  pinnedRow: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
  },
  pinnedTitleWrap: { flex: 1 },
  pinnedTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.line,
  },
  betaBadge: { backgroundColor: colors.lime },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.muted,
  },
  betaText: { color: colors.ink },
  header: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 20,
    backgroundColor: colors.paper,
  },
  identity: { alignItems: 'center' },
  noteWrap: { alignSelf: 'stretch' },
  name: {
    marginTop: 12,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -1,
    color: colors.ink,
  },
  handle: { marginTop: 2, fontSize: 14, color: colors.muted },
  stats: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    marginTop: 16,
    gap: 8,
  },
  stat: { flex: 1, minHeight: 56, borderRadius: 16 },
  statCount: { fontSize: 18, fontWeight: '700', color: colors.ink },
  statLabel: { fontSize: 12, color: colors.muted },
  action: { alignSelf: 'stretch', marginTop: 12, minHeight: 46 },
  note: {
    marginTop: 14,
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
    textAlign: 'center',
  },
  fill: { width: '100%', height: '100%' },
  lookTile: { flex: 1, aspectRatio: 0.8, padding: 1 },
  savedTile: { flex: 1, aspectRatio: 1, padding: 1 },
  postRow: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    gap: 6,
  },
  postText: { fontSize: 15, lineHeight: 21, color: colors.ink },
  postMeta: { fontSize: 12, color: colors.muted },
  about: { padding: 20, gap: 12 },
  aboutTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  aboutLine: { fontSize: 15, lineHeight: 22, color: colors.ink },
});
