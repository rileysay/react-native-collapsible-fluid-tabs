<p align="center">
  <img src="https://raw.githubusercontent.com/rileysay/react-native-collapsible-fluid-tabs/main/docs/readme-banner.png" width="100%" alt="Fluid Tabs — collapsible tabs for React Native, with X and Instagram profile demos." />
</p>

# Fluid Tabs

Collapsing headers, swipeable tabs, and synchronized scrolling for React Native.

**[Documentation](https://fluid-tabs.vercel.app/) · [Live examples](https://fluid-tabs.vercel.app/examples) · [npm](https://www.npmjs.com/package/react-native-collapsible-fluid-tabs)**

## Installation

```sh
npm install react-native-collapsible-fluid-tabs
```

See the [installation guide](https://fluid-tabs.vercel.app/docs/installation) for required dependencies and setup.

## Quick start

Wrap your app in `GestureHandlerRootView` and `SafeAreaProvider` (see [setup](./docs/REFERENCE.md#setup)), then render tabs with one list adapter each:

```tsx
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
```

The [reference](./docs/REFERENCE.md) covers every prop, list adapter and platform note.

**Beta:** this branch adds [iOS native header scroll](./docs/IOS-NATIVE-HEADER-SCROLL.md), where drags that start on the header get the same native momentum, overscroll and refresh as the list.

[MIT](./LICENSE)
