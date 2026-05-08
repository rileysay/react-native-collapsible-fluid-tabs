import {
  StatusBar,
  StyleSheet,
  Text,
  View,
  Pressable,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Tabs } from 'react-native-collapsible-fluid-tabs';

const POSTS = Array.from({ length: 30 }, (_, i) => ({
  id: `p${i}`,
  title: `Post ${i + 1}`,
  body: `This is the body of post ${i + 1}.`,
}));

const PHOTOS = Array.from({ length: 60 }, (_, i) => ({
  id: `g${i}`,
  hue: (i * 37) % 360,
}));

const AUDIOS = Array.from({ length: 12 }, (_, i) => ({
  id: `a${i}`,
  label: `Voice memo ${i + 1}`,
}));

function Header() {
  return (
    <View style={styles.header}>
      <View style={styles.avatar} />
      <View style={{ marginTop: 12 }}>
        <Text style={styles.name}>Jane Doe</Text>
        <Text style={styles.bio}>
          Building things people don't forget.
        </Text>
      </View>
    </View>
  );
}

function PinnedBar() {
  return (
    <View style={styles.pinned}>
      <Text style={styles.pinnedTitle}>Profile</Text>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar barStyle="dark-content" />
        <Tabs.Container
          renderPinnedHeader={() => <PinnedBar />}
          pinnedHeaderHeight={48}
          renderHeader={() => <Header />}
          tabBarHeight={56}
        >
          <Tabs.Tab name="posts" label="Posts">
            <Tabs.FlatList
              data={POSTS}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardBody}>{item.body}</Text>
                </View>
              )}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
            />
          </Tabs.Tab>

          <Tabs.Tab name="gallery" label="Gallery">
            <Tabs.FlatList
              data={PHOTOS}
              numColumns={3}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View
                  style={[
                    styles.tile,
                    { backgroundColor: `hsl(${item.hue}, 60%, 70%)` },
                  ]}
                />
              )}
              contentContainerStyle={{ paddingHorizontal: 8 }}
            />
          </Tabs.Tab>

          <Tabs.Tab name="audio" label="Audio">
            <Tabs.LegendList
              data={AUDIOS}
              recycleItems
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable style={styles.audioRow}>
                  <Text style={styles.audioLabel}>{item.label}</Text>
                </Pressable>
              )}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
            />
          </Tabs.Tab>

          <Tabs.Tab name="about" label="About">
            <Tabs.ScrollView contentContainerStyle={{ padding: 16 }}>
              <Text style={styles.cardTitle}>About</Text>
              <Text style={styles.cardBody}>
                This tab uses Tabs.ScrollView instead of Tabs.FlatList. It
                still participates in the same scroll synchronization and
                shares the same collapsing header behavior.
              </Text>
            </Tabs.ScrollView>
          </Tabs.Tab>
        </Tabs.Container>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    backgroundColor: '#ffffff',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#d0d0d8',
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1c1c1e',
  },
  bio: {
    marginTop: 6,
    fontSize: 15,
    color: '#6c6c70',
  },
  pinned: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  pinnedTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1c1c1e',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1c1c1e',
  },
  cardBody: {
    marginTop: 6,
    fontSize: 15,
    lineHeight: 21,
    color: '#3c3c43',
  },
  tile: {
    flex: 1,
    aspectRatio: 1,
    margin: 2,
    borderRadius: 8,
  },
  audioRow: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 16,
  },
  audioLabel: {
    color: '#fff',
    fontSize: 15,
  },
});
