import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

/**
 * 탭이 없다. 이 앱에는 대등한 화면이 없고 잔 하나가 전부다 —
 * 음료 고르기는 화면 위에 떠 있는 유리 바가 맡는다.
 */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#000' },
        }}
      />
    </GestureHandlerRootView>
  );
}
