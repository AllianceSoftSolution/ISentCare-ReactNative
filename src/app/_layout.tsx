import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import { DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { FONT_FAMILY } from '@/constants/typography';
import { applyAppFont } from '@/utils/applyAppFont';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const appTheme: Theme = {
  ...DefaultTheme,
  fonts: {
    regular: {
      fontFamily: FONT_FAMILY,
      fontWeight: '400',
    },
    medium: {
      fontFamily: FONT_FAMILY,
      fontWeight: '500',
    },
    bold: {
      fontFamily: FONT_FAMILY,
      fontWeight: '600',
    },
    heavy: {
      fontFamily: FONT_FAMILY,
      fontWeight: '700',
    },
  },
};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts([
    {
      fontFamily: FONT_FAMILY,
      fontDefinitions: [
        { path: require('../../assets/fonts/Poppins-Light.ttf'), weight: 300 },
        { path: require('../../assets/fonts/Poppins-Regular.ttf'), weight: 400 },
        { path: require('../../assets/fonts/Poppins-Medium.ttf'), weight: 500 },
        { path: require('../../assets/fonts/Poppins-SemiBold.ttf'), weight: 600 },
      ],
    },
  ]);

  useEffect(() => {
    if (!fontsLoaded && !fontError) return;
    applyAppFont();
    SplashScreen.hideAsync().catch(() => undefined);
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <ThemeProvider value={appTheme}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#ffffff' } }}>
        <Stack.Screen
          name="document-viewer"
          options={{
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
            contentStyle: { backgroundColor: '#0f172a' },
          }}
        />
      </Stack>
    </ThemeProvider>
  );
}
