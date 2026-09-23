import { memo, useCallback, useState } from 'react';
import { Image, Modal, StyleSheet, Text, View } from 'react-native';
import {
  GestureHandlerRootView,
  RefreshControl,
  Touchable,
} from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Calendar from 'reicon-react-native/icons/Calendar';
import ChartBar from 'reicon-react-native/icons/ChartBar';
import Heart from 'reicon-react-native/icons/Heart';
import Location from 'reicon-react-native/icons/Location';
import MessageCircle from 'reicon-react-native/icons/MessageCircle';
import Play from 'reicon-react-native/icons/Play';
import Repeat from 'reicon-react-native/icons/Repeat';
import Sun from 'reicon-react-native/icons/Sun';
import Verified from 'reicon-react-native/icons/Verified';
import X from 'reicon-react-native/icons/X';
import {
  Tabs,
  type HeaderRenderProps,
  type TabBarRenderProps,
} from 'react-native-collapsible-fluid-tabs';
import {
  Avatar,
  BackButton,
  Button,
  ProfileTabBar,
  colors,
} from './components';
import {
  GALLERY,
  LIKED_POSTS,
  PHOTOS,
  POSTS,
  REPLIES,
  TAGGED_PHOTOS,
  keyById,
  photoItemType,
  postItemType,
  useDemoRefresh,
  type Photo,
  type Post,
} from './demo';

const PostCard = memo(function PostCard({
  item,
  reply = false,
}: {
  item: Post;
  reply?: boolean;
}) {
  return (
    <View style={s.post}>
      <Avatar size={42} />
      <View style={s.postBody}>
        <View style={s.postByline}>
          <Text style={s.postName}>Rowan Miles</Text>
          <Text style={s.postMeta} numberOfLines={1}>
            @rowanmiles · {item.time}
          </Text>
        </View>
        {reply ? (
          <Text style={s.replyTo}>
            Replying to <Text style={s.blue}>@thegreatoutdoors</Text>
          </Text>
        ) : null}
        <Text style={s.postText}>{item.text}</Text>
        {item.photo ? (
          <View style={[s.postPhoto, { backgroundColor: item.photo.color }]}>
            <Image
              source={item.photo.source}
              accessibilityLabel={item.photo.title}
              style={s.fill}
            />
          </View>
        ) : null}
        <View
          style={s.postCounts}
          accessible
          accessibilityLabel={`${item.likes} likes, 12 replies, 24 reposts, 2.4K views`}
        >
          <View style={s.postCountItem}>
            <MessageCircle
              size={16}
              color="#718079"
              accessible={false}
              aria-hidden
            />
            <Text style={s.postCount}>12</Text>
          </View>
          <View style={s.postCountItem}>
            <Repeat size={16} color="#718079" accessible={false} aria-hidden />
            <Text style={s.postCount}>24</Text>
          </View>
          <View style={s.postCountItem}>
            <Heart size={16} color="#718079" accessible={false} aria-hidden />
            <Text style={s.postCount}>{item.likes}</Text>
          </View>
          <View style={s.postCountItem}>
            <ChartBar
              size={16}
              color="#718079"
              accessible={false}
              aria-hidden
            />
            <Text style={s.postCount}>2.4K</Text>
          </View>
        </View>
      </View>
    </View>
  );
});
const renderPost = ({ item }: { item: Post }) => <PostCard item={item} />;
const renderReply = ({ item }: { item: Post }) => (
  <PostCard item={item} reply />
);

export const PhotoTile = memo(function PhotoTile({
  item,
  onOpen,
  reels = false,
}: {
  item: Photo;
  onOpen?: (photo: Photo) => void;
  reels?: boolean;
}) {
  const photo = (
    <View
      style={[s.tile, reels && s.reelTile, { backgroundColor: item.color }]}
    >
      <Image
        source={item.source}
        style={s.fill}
        accessibilityLabel={item.title}
      />
      {reels ? (
        <View style={s.reelCaption}>
          <View style={s.reelTitle}>
            <Play size={15} color="#fff" accessible={false} aria-hidden />
            <Text style={s.reelPlay}>{item.title}</Text>
          </View>
          <Text style={s.reelViews}>12.4K views · photo preview</Text>
        </View>
      ) : null}
    </View>
  );
  return onOpen ? (
    <Touchable
      onPress={() => onOpen(item)}
      activeOpacity={0.85}
      style={s.tileTouch}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.title}`}
    >
      {photo}
    </Touchable>
  ) : (
    photo
  );
});

function ProfileHeader({
  variant,
  onOpen,
}: {
  variant: 'x' | 'instagram';
  onOpen: (photo: Photo) => void;
}) {
  const [following, setFollowing] = useState(false);
  const [about, setAbout] = useState(false);
  const isX = variant === 'x';
  return (
    <View style={s.header}>
      {isX ? (
        <>
          <Image
            source={PHOTOS[2]!.source}
            accessibilityLabel="Mountain lake profile cover"
            style={s.cover}
          />
          <View style={s.xProfileTop}>
            <Avatar size={86} />
            <Button
              onPress={() => setFollowing((value) => !value)}
              selected={following}
              dark={!following}
              style={s.follow}
            >
              {following ? 'Following' : 'Follow'}
            </Button>
          </View>
          <View style={s.xBio}>
            <View style={s.profileNameRow}>
              <Text
                style={s.profileName}
                accessibilityLabel="Rowan Miles, verified"
              >
                Rowan Miles
              </Text>
              <Verified
                size={20}
                color="#1d9bf0"
                weight="Filled"
                accessible={false}
                aria-hidden
              />
            </View>
            <Text style={s.handle}>@rowanmiles</Text>
            <Text style={s.bio}>
              Taking the long way home.{'\n'}Photos, field notes, and a little
              fresh air.
            </Text>
            <View style={s.profileDetails}>
              <View style={s.profileDetail}>
                <Location
                  size={14}
                  color={colors.muted}
                  accessible={false}
                  aria-hidden
                />
                <Text style={s.location}>Brisbane, Australia</Text>
              </View>
              <View style={s.profileDetail}>
                <Calendar
                  size={14}
                  color={colors.muted}
                  accessible={false}
                  aria-hidden
                />
                <Text style={s.location}>Joined March 2018</Text>
              </View>
            </View>
            <View style={s.xStats}>
              <Text style={s.statText}>
                <Text style={s.bold}>284</Text> Following
              </Text>
              <Text style={s.statText}>
                <Text style={s.bold}>12.8K</Text> Followers
              </Text>
            </View>
          </View>
        </>
      ) : (
        <View style={s.instagramBio}>
          <View style={s.igProfileTop}>
            <Avatar size={88} ring />
            <View style={s.igStats}>
              {[
                ['128', 'posts'],
                ['12.8K', 'followers'],
                ['284', 'following'],
              ].map(([value, label]) => (
                <View key={label} style={s.igStat}>
                  <Text style={s.igStatValue}>{value}</Text>
                  <Text style={s.igStatLabel}>{label}</Text>
                </View>
              ))}
            </View>
          </View>
          <Text style={s.igName}>Rowan Miles</Text>
          <Text style={s.creator}>Photographer</Text>
          <View style={s.igBio}>
            <Text style={s.igBioText}>Taking the long way home.</Text>
            <View style={s.igBioLine}>
              <Text style={s.igBioText}>A visual diary of the in-between.</Text>
              <Sun
                size={14}
                color={colors.ink}
                accessible={false}
                aria-hidden
              />
            </View>
          </View>
          <Text style={s.igLocation}>Brisbane, Australia</Text>
          <View style={s.igButtons}>
            <Button
              style={s.igButton}
              dark={!following}
              selected={following}
              onPress={() => setFollowing((value) => !value)}
            >
              {following ? 'Following' : 'Follow'}
            </Button>
            <Button
              style={s.igButton}
              selected={about}
              onPress={() => setAbout((value) => !value)}
            >
              {about ? 'Close bio' : 'About'}
            </Button>
          </View>
          {about ? (
            <Text style={s.aboutBio}>
              A fictional profile for exploring Fluid Tabs. The photos are
              bundled, so you can take this demo offline.
            </Text>
          ) : null}
          <View style={s.stories}>
            {PHOTOS.slice(0, 4).map((photo, i) => (
              <Touchable
                key={photo.id}
                accessible
                accessibilityRole="button"
                accessibilityLabel={`Open ${photo.title} highlight`}
                onPress={() => onOpen(photo)}
                activeOpacity={0.75}
                style={s.story}
              >
                <View style={s.storyPhotoRing}>
                  <Image source={photo.source} style={s.storyPhoto} />
                </View>
                <Text style={s.storyLabel}>
                  {['Coast', 'Out there', 'Slow days', 'Wandering'][i]}
                </Text>
              </Touchable>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

export function PhotoViewer({
  photo,
  onClose,
}: {
  photo: Photo | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  if (!photo) return null;
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <GestureHandlerRootView style={s.viewerStage}>
        <View style={s.viewer}>
          <View style={[s.viewerBar, { paddingTop: insets.top + 8 }]}>
            <Text style={s.viewerTitle}>{photo.title}</Text>
            <Button label="Close photo" onPress={onClose} style={s.viewerClose}>
              <X size={24} color="#fff" accessible={false} aria-hidden />
            </Button>
          </View>
          <View style={s.viewerPhoto}>
            <Image
              source={photo.source}
              resizeMode="contain"
              style={s.fill}
              accessibilityLabel={photo.title}
            />
          </View>
          <Text
            style={[s.viewerCaption, { paddingBottom: insets.bottom + 24 }]}
          >
            {photo.caption}
          </Text>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

export function ProfileScreen({
  variant,
  onBack,
}: {
  variant: 'x' | 'instagram';
  onBack: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const refresh0 = useDemoRefresh();
  const refresh1 = useDemoRefresh();
  const refresh2 = useDemoRefresh();
  const refresh3 = useDemoRefresh();
  const isX = variant === 'x';
  const renderHeader = useCallback(
    () => <ProfileHeader variant={variant} onOpen={setPhoto} />,
    [variant]
  );
  const renderPinnedHeader = useCallback(
    ({ topInset }: HeaderRenderProps) => (
      <View style={[s.pinned, { paddingTop: topInset }]}>
        <View style={s.pinnedRow}>
          <BackButton onPress={onBack} />
          <View style={s.pinnedName}>
            <Text style={s.pinnedTitle}>
              {isX ? 'Rowan Miles' : 'rowanmiles'}
            </Text>
            {isX ? <Text style={s.pinnedSubtitle}>128 posts</Text> : null}
          </View>
          <View style={s.demoBadge}>
            <Text style={s.demoBadgeText}>{isX ? 'X' : 'IG'} DEMO</Text>
          </View>
        </View>
      </View>
    ),
    [isX, onBack]
  );
  const renderTabBar = useCallback(
    (props: TabBarRenderProps) => (
      <ProfileTabBar {...props} variant={variant} selectedIndex={index} />
    ),
    [index, variant]
  );
  const renderPhoto = useCallback(
    ({ item }: { item: Photo }) => <PhotoTile item={item} onOpen={setPhoto} />,
    []
  );
  const renderReel = useCallback(
    ({ item }: { item: Photo }) => (
      <PhotoTile item={item} onOpen={setPhoto} reels />
    ),
    []
  );
  return (
    <View style={s.screen}>
      <Tabs.Container
        index={index}
        onIndexChange={setIndex}
        renderHeader={renderHeader}
        renderPinnedHeader={renderPinnedHeader}
        pinnedHeaderHeight={56}
        renderTabBar={renderTabBar}
        tabBarHeight={52}
        estimatedHeaderHeight={355}
        pullDownBehavior={isX ? 'static' : 'stretch'}
        containerStyle={s.container}
      >
        {isX ? (
          <>
            <Tabs.Tab name="posts" label="Posts">
              <Tabs.LegendList
                data={POSTS}
                renderItem={renderPost}
                keyExtractor={keyById}
                recycleItems
                getItemType={postItemType}
                refreshControl={<RefreshControl {...refresh0} />}
              />
            </Tabs.Tab>
            <Tabs.Tab name="replies" label="Replies">
              <Tabs.LegendList
                data={REPLIES}
                renderItem={renderReply}
                keyExtractor={keyById}
                recycleItems
                getItemType={postItemType}
                refreshControl={<RefreshControl {...refresh1} />}
              />
            </Tabs.Tab>
            <Tabs.Tab name="media" label="Media">
              <Tabs.LegendList
                data={GALLERY}
                renderItem={renderPhoto}
                keyExtractor={keyById}
                numColumns={3}
                recycleItems
                getItemType={photoItemType}
                refreshControl={<RefreshControl {...refresh2} />}
              />
            </Tabs.Tab>
            <Tabs.Tab name="likes" label="Likes">
              <Tabs.LegendList
                data={LIKED_POSTS}
                renderItem={renderPost}
                keyExtractor={keyById}
                recycleItems
                getItemType={postItemType}
                refreshControl={<RefreshControl {...refresh3} />}
              />
            </Tabs.Tab>
          </>
        ) : (
          <>
            <Tabs.Tab name="grid" label="Posts">
              <Tabs.LegendList
                data={GALLERY}
                renderItem={renderPhoto}
                keyExtractor={keyById}
                numColumns={3}
                recycleItems
                getItemType={photoItemType}
                refreshControl={<RefreshControl {...refresh0} />}
              />
            </Tabs.Tab>
            <Tabs.Tab name="reels" label="Reels">
              <Tabs.LegendList
                data={GALLERY}
                renderItem={renderReel}
                keyExtractor={keyById}
                numColumns={2}
                recycleItems
                getItemType={photoItemType}
                refreshControl={<RefreshControl {...refresh1} />}
              />
            </Tabs.Tab>
            <Tabs.Tab name="tagged" label="Tagged">
              <Tabs.LegendList
                data={TAGGED_PHOTOS}
                renderItem={renderPhoto}
                keyExtractor={keyById}
                numColumns={3}
                recycleItems
                getItemType={photoItemType}
                refreshControl={<RefreshControl {...refresh2} />}
              />
            </Tabs.Tab>
          </>
        )}
      </Tabs.Container>
      <PhotoViewer photo={photo} onClose={() => setPhoto(null)} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  container: { backgroundColor: '#fff' },
  header: { backgroundColor: '#fff' },
  pinned: { backgroundColor: '#fff' },
  pinnedRow: {
    height: 56,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pinnedName: { flex: 1 },
  pinnedTitle: {
    fontSize: 19,
    letterSpacing: -0.4,
    fontWeight: '800',
    color: colors.ink,
  },
  pinnedSubtitle: { fontSize: 12, color: colors.muted, marginTop: 2 },
  demoBadge: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 4,
    marginRight: 8,
  },
  demoBadgeText: {
    fontSize: 9,
    letterSpacing: 0.8,
    color: colors.muted,
    fontWeight: '700',
  },
  cover: { width: '100%', height: 132 },
  xProfileTop: {
    marginTop: -31,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  follow: { marginBottom: 2, minWidth: 98 },
  xBio: { paddingHorizontal: 16, paddingTop: 9, paddingBottom: 16 },
  profileNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  profileName: {
    fontSize: 23,
    fontWeight: '800',
    letterSpacing: -0.6,
    color: colors.ink,
  },
  handle: { fontSize: 14, color: '#697980', marginTop: 2 },
  bio: { fontSize: 15, lineHeight: 21, color: colors.ink, marginTop: 12 },
  profileDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 12,
    rowGap: 4,
    marginTop: 10,
  },
  profileDetail: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  location: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.muted,
  },
  xStats: { flexDirection: 'row', gap: 18, marginTop: 11 },
  statText: { fontSize: 13, color: colors.muted },
  bold: { fontWeight: '700', color: colors.ink },
  instagramBio: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16 },
  igProfileTop: {
    flexDirection: 'row',
    gap: 22,
    alignItems: 'center',
    marginBottom: 14,
  },
  igStats: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  igStat: { alignItems: 'center' },
  igStatValue: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: colors.ink,
  },
  igStatLabel: { fontSize: 12, color: colors.ink, marginTop: 3 },
  igName: { fontSize: 14, fontWeight: '700', color: colors.ink },
  creator: { fontSize: 13, color: colors.muted, marginTop: 2 },
  igBio: { marginTop: 4 },
  igBioLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  igBioText: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink,
  },
  igLocation: { fontSize: 13, color: '#3b6278', marginTop: 4 },
  igButtons: { flexDirection: 'row', gap: 8, marginTop: 14 },
  igButton: { flex: 1, borderRadius: 9 },
  aboutBio: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
    paddingVertical: 12,
  },
  stories: { flexDirection: 'row', gap: 18, paddingTop: 20 },
  story: { alignItems: 'center', gap: 5 },
  storyPhotoRing: {
    width: 61,
    height: 61,
    borderRadius: 31,
    borderWidth: 1,
    borderColor: '#d8ddda',
    padding: 3,
  },
  storyPhoto: { width: '100%', height: '100%', borderRadius: 29 },
  storyLabel: { fontSize: 10, color: colors.ink },
  post: {
    padding: 14,
    flexDirection: 'row',
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#dce2de',
  },
  postBody: { flex: 1, minWidth: 0 },
  postByline: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  postName: { fontSize: 14, fontWeight: '800', color: colors.ink },
  postMeta: { flex: 1, fontSize: 12, color: '#718079' },
  postText: { fontSize: 15, lineHeight: 21, color: colors.ink, marginTop: 4 },
  replyTo: { fontSize: 12, color: colors.muted, marginTop: 4 },
  blue: { color: '#1d9bf0' },
  postPhoto: {
    width: '100%',
    aspectRatio: 1.35,
    marginTop: 11,
    borderRadius: 14,
    overflow: 'hidden',
  },
  postCounts: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    paddingRight: 10,
  },
  postCount: { color: '#718079', fontSize: 12 },
  postCountItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tileTouch: { flex: 1 },
  tile: {
    width: '100%',
    aspectRatio: 0.8,
    borderWidth: 1,
    borderColor: '#fff',
    overflow: 'hidden',
  },
  reelTile: { aspectRatio: 0.65 },
  fill: { width: '100%', height: '100%' },
  reelCaption: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 10,
    backgroundColor: '#00000055',
  },
  reelTitle: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  reelPlay: {
    flexShrink: 1,
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  reelViews: { color: '#eee', fontSize: 9, marginTop: 3 },
  viewerStage: { flex: 1, backgroundColor: '#e7ebe4', alignItems: 'center' },
  viewer: { flex: 1, width: '100%', maxWidth: 600, backgroundColor: '#14201c' },
  viewerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  viewerTitle: { flex: 1, color: '#fff', fontSize: 19, fontWeight: '700' },
  viewerClose: { backgroundColor: '#ffffff15', paddingHorizontal: 0 },
  viewerPhoto: { flex: 1, width: '100%', marginVertical: 18 },
  viewerCaption: {
    color: '#ccd8d0',
    fontSize: 16,
    lineHeight: 24,
    paddingHorizontal: 24,
  },
});
