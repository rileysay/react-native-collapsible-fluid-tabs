import { Text, View } from 'react-native';
import { Tabs } from 'react-native-collapsible-fluid-tabs';

const posts = Array.from({ length: 30 }, (_, index) => ({
  id: String(index),
  title: `Post ${index + 1}`,
}));

export function ProfileScreen() {
  return (
    <Tabs.Container
      renderHeader={() => (
        <View
          style={{
            height: 200,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text>Profile</Text>
        </View>
      )}
      containerStyle={{ backgroundColor: '#fff' }}
    >
      <Tabs.Tab name="posts" label="Posts">
        <Tabs.FlatList
          data={posts}
          keyExtractor={(post) => post.id}
          renderItem={({ item }) => (
            <Text style={{ padding: 16 }}>{item.title}</Text>
          )}
        />
      </Tabs.Tab>
      <Tabs.Tab name="about" label="About">
        <Tabs.ScrollView>
          <Text style={{ padding: 16 }}>About this profile.</Text>
        </Tabs.ScrollView>
      </Tabs.Tab>
    </Tabs.Container>
  );
}
