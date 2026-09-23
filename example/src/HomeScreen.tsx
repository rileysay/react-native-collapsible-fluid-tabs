import { useRouter } from 'expo-router';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Pressable, ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Rect } from 'react-native-svg';
import { ArrowUpRight } from 'reicon-react-native/icons/ArrowUpRight';
import { InstagramBrandIcon, XBrandIcon } from './brand-icons';
import { PHOTOS } from './demo';

export function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={s.page}
      contentContainerStyle={[
        s.content,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <View style={s.masthead}>
        <View style={s.wordmark}>
          <Svg
            width={30}
            height={30}
            viewBox="0 0 30 30"
            accessible={false}
            aria-hidden
          >
            <Rect x={2} y={4} width={7} height={17} rx={3.5} fill="#171717" />
            <Rect
              x={11.5}
              y={9}
              width={7}
              height={17}
              rx={3.5}
              fill="#171717"
            />
            <Rect x={21} y={4} width={7} height={17} rx={3.5} fill="#171717" />
          </Svg>
          <Text style={s.brand}>
            fluid<Text style={s.brandLight}>tabs</Text>.
          </Text>
        </View>
      </View>
      <View style={s.intro}>
        <Text accessibilityRole="header" style={s.title}>
          Examples
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open X demo"
        onPress={() => router.push('/x')}
        style={({ pressed }) => [s.card, s.xCard, pressed && s.pressed]}
      >
        <View style={s.cardCopy}>
          <View style={s.cardTop}>
            <Text style={s.number}>01 / FEED</Text>
            <ArrowUpRight
              size={20}
              color="#171717"
              accessible={false}
              aria-hidden
            />
          </View>
          <View style={s.cardTitleRow}>
            <XBrandIcon />
          </View>
          <Text style={s.cardDescription}>
            Collapsing profile header{'\n'}with a tabbed feed.
          </Text>
        </View>
        <View style={s.xPreview} pointerEvents="none">
          <View style={s.xLogo}>
            <XBrandIcon size={31} />
          </View>
          <View style={s.previewPost}>
            <View style={s.previewAvatar} />
            <View style={s.previewLines}>
              <View style={s.line} />
              <View style={s.lineShort} />
            </View>
          </View>
          <View style={s.previewPhoto}>
            <Image source={PHOTOS[2]!.source} style={s.fillImage} />
          </View>
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open Instagram demo"
        onPress={() => router.push('/instagram')}
        style={({ pressed }) => [s.card, s.instagramCard, pressed && s.pressed]}
      >
        <View style={s.cardCopy}>
          <View style={s.cardTop}>
            <Text style={s.number}>02 / GRID</Text>
            <ArrowUpRight
              size={20}
              color="#171717"
              accessible={false}
              aria-hidden
            />
          </View>
          <View style={s.cardTitleRow}>
            <InstagramBrandIcon />
            <Text style={s.cardTitle}>Instagram</Text>
          </View>
          <Text style={s.cardDescription}>
            Photo grid with{'\n'}custom tabs.
          </Text>
        </View>
        <View style={s.photoStack} pointerEvents="none">
          <Image source={PHOTOS[1]!.source} style={s.stackedBack} />
          <Image source={PHOTOS[0]!.source} style={s.stackedFront} />
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open Lab"
        onPress={() => router.push('/lab')}
        style={({ pressed }) => [s.card, s.labCard, pressed && s.pressed]}
      >
        <View style={s.cardCopy}>
          <View style={s.cardTop}>
            <Text style={[s.number, s.labMuted]}>03 / LISTS</Text>
            <ArrowUpRight
              size={20}
              color="#ededed"
              accessible={false}
              aria-hidden
            />
          </View>
          <Text style={[s.cardTitle, s.labText]}>Lab</Text>
          <Text style={[s.cardDescription, s.labMuted]}>
            Compare list adapters{'\n'}and header settings.
          </Text>
        </View>
        <View style={s.sliders} pointerEvents="none">
          {[0, 1, 2].map((i) => (
            <View key={i} style={s.sliderTrack}>
              <View style={[s.sliderKnob, { left: [40, 12, 60][i] }]} />
            </View>
          ))}
        </View>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fafafa' },
  content: {
    paddingHorizontal: 24,
    gap: 12,
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
  },
  masthead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brand: {
    fontSize: 25,
    fontWeight: '600',
    letterSpacing: -1.3,
    color: '#171717',
  },
  brandLight: { fontWeight: '400' },
  intro: { paddingVertical: 12, gap: 10 },
  title: {
    fontSize: 40,
    lineHeight: 43,
    letterSpacing: -2.4,
    fontWeight: '700',
    color: '#171717',
  },
  card: {
    borderRadius: 24,
    overflow: 'hidden',
    flexDirection: 'row',
    minHeight: 140,
    padding: 18,
    borderWidth: 1,
  },
  xCard: { backgroundColor: '#fff', borderColor: '#e5e5e5' },
  instagramCard: {
    backgroundColor: '#f5f5f5',
    borderColor: '#e5e5e5',
  },
  labCard: { backgroundColor: '#171717', borderColor: '#171717' },
  cardCopy: { flex: 1, zIndex: 1 },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  number: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: '#737373',
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: {
    fontSize: 24,
    lineHeight: 27,
    letterSpacing: -1,
    fontWeight: '700',
    color: '#171717',
  },
  cardDescription: {
    fontSize: 12,
    lineHeight: 18,
    color: '#737373',
    marginTop: 8,
  },
  pressed: { opacity: 0.75 },
  xPreview: {
    position: 'absolute',
    width: 116,
    right: -5,
    top: 33,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 17,
    backgroundColor: '#fff',
    transform: [{ rotate: '-7deg' }],
  },
  xLogo: { paddingBottom: 6 },
  previewPost: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  previewAvatar: {
    width: 18,
    height: 18,
    backgroundColor: '#b7b7b7',
    borderRadius: 9,
  },
  previewLines: { gap: 4, flex: 1 },
  line: { height: 4, backgroundColor: '#d8d8d8', borderRadius: 2 },
  lineShort: {
    height: 4,
    width: '65%',
    backgroundColor: '#ebebeb',
    borderRadius: 2,
  },
  previewPhoto: {
    height: 61,
    marginTop: 8,
    borderRadius: 7,
    overflow: 'hidden',
  },
  fillImage: { width: '100%', height: '100%' },
  photoStack: {
    position: 'absolute',
    right: -20,
    bottom: -27,
    width: 145,
    height: 142,
  },
  stackedBack: {
    position: 'absolute',
    width: 97,
    height: 125,
    right: 5,
    top: -19,
    borderRadius: 9,
    borderWidth: 5,
    borderColor: '#fff',
    transform: [{ rotate: '12deg' }],
  },
  stackedFront: {
    width: 100,
    height: 132,
    borderRadius: 9,
    borderWidth: 5,
    borderColor: '#fff',
    transform: [{ rotate: '-9deg' }],
  },
  labText: { color: '#ededed' },
  labMuted: { color: '#a3a3a3' },
  sliders: {
    position: 'absolute',
    right: -5,
    bottom: 39,
    width: 108,
    gap: 19,
    transform: [{ rotate: '-14deg' }],
  },
  sliderTrack: { height: 6, borderRadius: 3, backgroundColor: '#525252' },
  sliderKnob: {
    position: 'absolute',
    top: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#ededed',
    borderWidth: 4,
    borderColor: '#171717',
  },
});
