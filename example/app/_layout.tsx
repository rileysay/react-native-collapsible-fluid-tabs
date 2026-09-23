import { Stack, usePathname } from 'expo-router';
import { Platform, StatusBar, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PhonePreviewSafeArea } from '../src/PhonePreviewSafeArea';

export default function Layout() {
  const pathname = usePathname();
  const isHome = pathname === '/';
  return (
    <GestureHandlerRootView style={styles.root}>
      <View style={styles.stage}>
        <View
          style={[
            styles.app,
            Platform.OS === 'web' &&
              (isHome ? styles.homeWidth : styles.demoWidth),
          ]}
        >
          <StatusBar barStyle="dark-content" />
          <PhonePreviewSafeArea>
            <Stack
              screenOptions={{
                headerShown: false,
                animation: 'fade',
                contentStyle: { backgroundColor: 'transparent' },
              }}
            />
          </PhonePreviewSafeArea>
        </View>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  stage: { flex: 1, alignItems: 'center', backgroundColor: '#e7ebe4' },
  app: { flex: 1, width: '100%' },
  homeWidth: { maxWidth: 720 },
  demoWidth: { maxWidth: 600 },
});
