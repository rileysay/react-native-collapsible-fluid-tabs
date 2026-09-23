import { memo, useCallback, useState } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import {
  RefreshControl,
  ScrollView,
  Switch,
} from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ArrowLeft from 'reicon-react-native/icons/ArrowLeft';
import ArrowUp from 'reicon-react-native/icons/ArrowUp';
import ArrowUpRight from 'reicon-react-native/icons/ArrowUpRight';
import X from 'reicon-react-native/icons/X';
import {
  Tabs,
  type HeaderRenderProps,
  type PullDownBehavior,
  type TabBarRenderProps,
} from 'react-native-collapsible-fluid-tabs';
import { BackButton, Button, colors } from './components';
import { ControlsSheet } from './ControlsSheet';
import {
  GALLERY,
  keyById,
  photoItemType,
  useDemoRefresh,
  type Photo,
} from './demo';
import { PhotoTile } from './ProfileScreens';

const TAB_NAMES = ['FlatList', 'LegendList', 'ScrollView', 'FlashList'];
const DEFAULT_PINNED_HEADER = Platform.OS === 'web';
const LAB_TAB_COLORS = {
  background: '#fafafa',
  trackBackground: '#ebebeb',
  pillBackground: '#fff',
  labelColor: '#262626',
};
const renderLabTabBar = (props: TabBarRenderProps) => (
  <Tabs.DefaultTabBar
    {...props}
    sidePadding={10}
    minTabWidth={94}
    colors={LAB_TAB_COLORS}
  />
);

const LabRow = memo(function LabRow({ item }: { item: Photo }) {
  return (
    <View style={s.photoRow}>
      <View style={[s.rowPhoto, { backgroundColor: item.color }]}>
        <Image
          source={item.source}
          style={s.fillPhoto}
          accessibilityLabel={item.title}
        />
      </View>
      <View style={s.rowCaption}>
        <View>
          <Text style={s.rowTitle}>{item.title}</Text>
          <Text style={s.rowSubtitle}>
            FIELD NOTES /{' '}
            {String(Number(item.id.split('-')[1]) + 1).padStart(2, '0')}
          </Text>
        </View>
        <ArrowUpRight
          size={22}
          color={colors.muted}
          accessible={false}
          aria-hidden
        />
      </View>
    </View>
  );
});
const renderRow = ({ item }: { item: Photo }) => <LabRow item={item} />;
const renderGrid = ({ item }: { item: Photo }) => <PhotoTile item={item} />;

const NOTES = [
  [
    'Start on the header',
    'Put your finger on the header or tab bar and move vertically. The active list should follow your finger. A tap on a tab should still change pages.',
  ],
  [
    'Try a diagonal',
    'Scroll naturally with one thumb, then swipe across to another tab. Try the same movement while the list is slowing down.',
  ],
  [
    'Reverse direction',
    'Swipe quickly through multiple tabs, reverse direction, and tap a tab before the movement finishes. Watch the page and header settle together.',
  ],
  [
    'Pull, then switch',
    'Pull to refresh at the top. Switch tabs while refreshing, then return. Compare Static and Stretch in Controls.',
  ],
  [
    'Remove the fixed header',
    'Turn Pinned header off. With Scroll behind notch on, the collapsing header moves right up into the status-bar area. Controls stay at the bottom.',
  ],
  [
    'Remove the collapsing header',
    'Turn Collapsing header off. Its space should disappear too. Turn it back on and check the spacing on every tab.',
  ],
  [
    'Go back to the top',
    'Scroll down and tap the selected tab again. It should scroll to the top. Start dragging before it finishes to take control.',
  ],
  [
    'Compare the lists',
    'FlatList, LegendList, and FlashList show the same photos in different layouts. This page is a ScrollView with plain content.',
  ],
];

function Notes() {
  return (
    <View style={s.notes}>
      <Text style={s.notesEyebrow}>GESTURE CHECKS</Text>
      {NOTES.map(([title, body], i) => (
        <View key={title} style={s.note}>
          <Text style={s.noteNumber}>{String(i + 1).padStart(2, '0')}</Text>
          <View style={s.noteBody}>
            <Text style={s.noteTitle}>{title}</Text>
            <Text style={s.noteText}>{body}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function Toggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={s.toggleRow}>
      <View style={s.toggleCopy}>
        <Text style={s.toggleLabel}>{label}</Text>
        <Text style={s.toggleDescription}>{description}</Text>
      </View>
      <View style={s.toggleTarget}>
        <Switch
          value={value}
          onValueChange={onChange}
          accessibilityLabel={label}
          accessibilityHint={description}
          hitSlop={10}
          trackColor={{ false: '#d4ddd0', true: '#395d40' }}
          thumbColor="#fff"
          ios_backgroundColor="#d4ddd0"
        />
      </View>
    </View>
  );
}

export function LabScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(0);
  const [pinned, setPinned] = useState(DEFAULT_PINNED_HEADER);
  const [header, setHeader] = useState(true);
  const [behindNotch, setBehindNotch] = useState(true);
  const [pullDown, setPullDown] = useState<PullDownBehavior>('static');
  const [swipeEnabled, setSwipeEnabled] = useState(true);
  const [headerScrollEnabled, setHeaderScrollEnabled] = useState(true);
  const [ratio, setRatio] = useState(1.4);
  const [controlsOpen, setControlsOpen] = useState(false);
  const flatRefresh = useDemoRefresh();
  const legendRefresh = useDemoRefresh();
  const scrollRefresh = useDemoRefresh();
  const flashRefresh = useDemoRefresh();
  const activeRefresh =
    [flatRefresh, legendRefresh, scrollRefresh, flashRefresh][activeIndex] ??
    flatRefresh;
  const closeControls = useCallback(() => setControlsOpen(false), []);

  // This padding belongs to the collapsing content, so it scrolls away too.
  // The bottom toolbar remains reachable even when topInset is explicitly zero.
  const headerPadding = !pinned && behindNotch ? insets.top : 0;
  const renderHeader = useCallback(
    () => (
      <View style={[s.labHeader, { paddingTop: headerPadding + 28 }]}>
        <Text style={s.headerLabel}>FLUID TABS</Text>
        <Text style={s.headerTitle}>Lab</Text>
        <Text style={s.headerSubtitle}>
          Compare list adapters and configure headers, gestures, and refresh
          behavior.
        </Text>
        <View style={s.headerFooter}>
          <Text style={s.headerFootnote}>
            {pinned ? 'Pinned header on' : 'No pinned header'} ·{' '}
            {behindNotch ? 'Behind the notch' : 'Safe-area inset'}
          </Text>
          <ArrowUp size={24} color="#d4d4d4" accessible={false} aria-hidden />
        </View>
      </View>
    ),
    [behindNotch, headerPadding, pinned]
  );
  const renderPinnedHeader = useCallback(
    ({ topInset }: HeaderRenderProps) => (
      <View style={[s.pinned, { paddingTop: topInset }]}>
        <View style={s.pinnedRow}>
          <BackButton onPress={onBack} />
          <Text style={s.pinnedTitle}>The Lab</Text>
          <Text style={s.pinnedMeta}>PINNED</Text>
        </View>
      </View>
    ),
    [onBack]
  );

  const reset = () => {
    setPinned(DEFAULT_PINNED_HEADER);
    setHeader(true);
    setBehindNotch(true);
    setPullDown('static');
    setSwipeEnabled(true);
    setHeaderScrollEnabled(true);
    setRatio(1.4);
    setActiveIndex(0);
  };

  return (
    <View style={s.screen}>
      <Tabs.Container
        renderHeader={header ? renderHeader : undefined}
        renderPinnedHeader={pinned ? renderPinnedHeader : undefined}
        pinnedHeaderHeight={pinned ? 56 : undefined}
        topInset={
          behindNotch && !(Platform.OS === 'web' && pinned) ? 0 : undefined
        }
        renderTabBar={renderLabTabBar}
        tabBarHeight={64}
        estimatedHeaderHeight={310 + headerPadding}
        index={activeIndex}
        onIndexChange={setActiveIndex}
        pullDownBehavior={pullDown}
        swipeEnabled={swipeEnabled}
        headerScrollEnabled={headerScrollEnabled}
        swipeDirectionRatio={ratio}
        containerStyle={s.container}
      >
        <Tabs.Tab name="flatlist" label="FlatList">
          <Tabs.FlatList
            data={GALLERY}
            keyExtractor={keyById}
            renderItem={renderRow}
            refreshControl={<RefreshControl {...flatRefresh} />}
          />
        </Tabs.Tab>
        <Tabs.Tab name="legendlist" label="LegendList">
          <Tabs.LegendList
            data={GALLERY}
            keyExtractor={keyById}
            renderItem={renderGrid}
            numColumns={3}
            recycleItems
            getItemType={photoItemType}
            refreshControl={<RefreshControl {...legendRefresh} />}
          />
        </Tabs.Tab>
        <Tabs.Tab name="scrollview" label="ScrollView">
          <Tabs.ScrollView
            refreshControl={<RefreshControl {...scrollRefresh} />}
          >
            <Notes />
          </Tabs.ScrollView>
        </Tabs.Tab>
        <Tabs.Tab name="flashlist" label="FlashList">
          <Tabs.FlashList
            data={GALLERY}
            keyExtractor={keyById}
            renderItem={renderRow}
            refreshControl={<RefreshControl {...flashRefresh} />}
          />
        </Tabs.Tab>
      </Tabs.Container>
      <View style={[s.toolbar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <Button label="Back to examples" onPress={onBack} style={s.homeButton}>
          <View style={s.homeContent}>
            <ArrowLeft
              size={18}
              color="#38503c"
              accessible={false}
              aria-hidden
            />
            <Text style={s.homeLabel}>Home</Text>
          </View>
        </Button>
        <View style={s.toolbarStatus} accessibilityLiveRegion="polite">
          <Text style={s.toolbarList}>{TAB_NAMES[activeIndex]}</Text>
          <Text style={s.toolbarDetail}>
            {activeRefresh.refreshing
              ? 'Refreshing…'
              : `${pullDown} pull · ${ratio.toFixed(1)}×`}
          </Text>
        </View>
        <Button
          onPress={() => setControlsOpen(true)}
          dark
          style={s.controlsButton}
        >
          Controls
        </Button>
      </View>

      <ControlsSheet open={controlsOpen} onClose={closeControls}>
        <View style={s.sheetHandle} />
        <View style={s.sheetHeading}>
          <View>
            <Text style={s.sheetTitle}>Controls</Text>
          </View>
          <Button
            onPress={closeControls}
            label="Close controls"
            style={s.closeButton}
          >
            <X size={22} color={colors.ink} accessible={false} aria-hidden />
          </Button>
        </View>
        <ScrollView
          contentContainerStyle={[
            s.sheetContent,
            { paddingBottom: insets.bottom + 24 },
          ]}
        >
          <Text style={s.groupLabel}>HEADER & LAYOUT</Text>
          <Toggle
            label="Pinned header"
            description="Keep a fixed bar above the tabs."
            value={pinned}
            onChange={setPinned}
          />
          <Toggle
            label="Collapsing header"
            description="Show the big header that scrolls away."
            value={header}
            onChange={setHeader}
          />
          <Toggle
            label="Scroll behind notch"
            description={
              Platform.OS === 'web'
                ? pinned
                  ? 'Pinned controls stay below the status bar.'
                  : 'Let scrolling content move behind the status bar and notch.'
                : 'Remove the reserved top inset, including under the tabs.'
            }
            value={behindNotch}
            onChange={setBehindNotch}
          />
          <Text style={s.groupLabel}>GESTURES</Text>
          <Toggle
            label="Swipe between tabs"
            description="Allow horizontal paging from the list."
            value={swipeEnabled}
            onChange={setSwipeEnabled}
          />
          <Toggle
            label="Drag header & tab bar"
            description="Move the active list from the top chrome."
            value={headerScrollEnabled}
            onChange={setHeaderScrollEnabled}
          />
          <Text style={s.settingTitle}>Direction ratio</Text>
          <Text style={s.settingDescription}>
            Higher values need a more clearly horizontal swipe.
          </Text>
          <View style={s.segmentRow}>
            {[1.2, 1.4, 1.8].map((value) => (
              <Button
                key={value}
                style={s.segment}
                dark={ratio === value}
                selected={ratio === value}
                onPress={() => setRatio(value)}
              >{`${value.toFixed(1)}×${value === 1.4 ? ' · default' : ''}`}</Button>
            ))}
          </View>
          <Text style={s.groupLabel}>PULL TO REFRESH</Text>
          <View style={s.segmentRow}>
            {(['static', 'stretch'] as const).map((value) => (
              <Button
                key={value}
                style={s.segment}
                dark={pullDown === value}
                selected={pullDown === value}
                onPress={() => setPullDown(value)}
              >
                {value === 'static' ? 'Static' : 'Stretch'}
              </Button>
            ))}
          </View>
          <Text style={s.settingDescription}>
            Static keeps the header in place. Stretch lets it move with the
            pull. Refresh takes 1.5 seconds.
          </Text>
          <View style={s.refreshRow}>
            <Text style={s.activeList}>
              {TAB_NAMES[activeIndex]}
              {activeRefresh.refreshing ? ' · refreshing' : ' · ready'}
            </Text>
            <Button
              disabled={activeRefresh.refreshing}
              onPress={() => {
                activeRefresh.onRefresh();
                closeControls();
              }}
            >
              Refresh
            </Button>
          </View>
          <Text style={s.groupLabel}>JUMP TO A TAB</Text>
          <View style={s.segmentRow}>
            <Button
              style={s.segment}
              onPress={() => {
                setActiveIndex(0);
                closeControls();
              }}
            >
              First · FlatList
            </Button>
            <Button
              style={s.segment}
              onPress={() => {
                setActiveIndex(3);
                closeControls();
              }}
            >
              Last · FlashList
            </Button>
          </View>
          <Button style={s.resetButton} onPress={reset}>
            Reset to defaults
          </Button>
        </ScrollView>
      </ControlsSheet>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8faf7' },
  container: { backgroundColor: '#f8faf7' },
  labHeader: {
    backgroundColor: '#171717',
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  headerLabel: {
    fontSize: 10,
    color: '#a3a3a3',
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  headerTitle: {
    fontSize: 46,
    lineHeight: 49,
    fontWeight: '700',
    letterSpacing: -2.3,
    color: '#fafafa',
    marginTop: 25,
  },
  headerSubtitle: {
    color: '#b0b0b0',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
  },
  headerFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 21,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#404040',
    paddingTop: 12,
  },
  headerFootnote: { fontSize: 10, color: '#a3a3a3' },
  pinned: { backgroundColor: '#f8faf7' },
  pinnedRow: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 8,
  },
  pinnedTitle: { flex: 1, fontSize: 19, fontWeight: '700', color: colors.ink },
  pinnedMeta: {
    fontSize: 9,
    color: colors.muted,
    letterSpacing: 1.3,
    paddingRight: 12,
  },
  photoRow: { backgroundColor: '#fff', marginBottom: 12 },
  rowPhoto: { width: '100%', aspectRatio: 1.35, overflow: 'hidden' },
  fillPhoto: { width: '100%', height: '100%' },
  rowCaption: {
    padding: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: -0.4,
  },
  rowSubtitle: {
    fontSize: 9,
    color: colors.muted,
    marginTop: 5,
    letterSpacing: 1.4,
  },
  notes: { padding: 22 },
  notesEyebrow: {
    fontSize: 10,
    color: '#76826d',
    letterSpacing: 1.5,
    fontWeight: '700',
    paddingBottom: 8,
  },
  note: {
    flexDirection: 'row',
    gap: 16,
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e9df',
  },
  noteNumber: { fontSize: 12, color: '#7f916e', paddingTop: 4 },
  noteBody: { flex: 1, gap: 8 },
  noteTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.ink,
    letterSpacing: -0.5,
  },
  noteText: { fontSize: 15, lineHeight: 23, color: '#61715d' },
  toolbar: {
    paddingTop: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f8faf7',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#d8e2d3',
  },
  homeButton: { backgroundColor: 'transparent', paddingHorizontal: 8 },
  homeContent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  homeLabel: { color: '#38503c', fontSize: 13, fontWeight: '600' },
  toolbarStatus: { flex: 1, alignItems: 'center', gap: 3 },
  toolbarList: { fontSize: 12, color: '#233f32', fontWeight: '700' },
  toolbarDetail: { fontSize: 10, color: '#76826d' },
  controlsButton: { borderRadius: 14 },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cad4c5',
    marginTop: 10,
    alignSelf: 'center',
  },
  sheetHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 22,
    paddingTop: 17,
  },
  sheetTitle: {
    fontSize: 29,
    fontWeight: '700',
    color: colors.ink,
    marginTop: 4,
    letterSpacing: -0.8,
  },
  closeButton: { paddingHorizontal: 0 },
  sheetContent: { paddingHorizontal: 22 },
  groupLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: '#7d8b73',
    paddingTop: 18,
    paddingBottom: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    paddingVertical: 16,
    minHeight: 70,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#dce5d7',
  },
  toggleCopy: { flex: 1, gap: 4 },
  toggleLabel: { fontSize: 15, color: colors.ink, fontWeight: '600' },
  toggleDescription: { fontSize: 12, lineHeight: 18, color: colors.muted },
  toggleTarget: {
    minHeight: 48,
    minWidth: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
    paddingTop: 18,
  },
  settingDescription: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 18,
    marginTop: 8,
    marginBottom: 12,
  },
  segmentRow: { flexDirection: 'row', gap: 8 },
  segment: { flex: 1, borderRadius: 12, paddingHorizontal: 8 },
  refreshRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  activeList: { fontSize: 13, color: colors.muted },
  resetButton: { backgroundColor: '#e7edde', marginTop: 24 },
});
