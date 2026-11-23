import { FONT_FAMILY } from '@/constants/typography';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, type ReactElement } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

/** Only allow viewing files we just wrote under the app cache directory. */
function isTrustedLocalDocumentUri(uri: string): boolean {
  if (!uri) return false;
  const cacheRoot = FileSystem.cacheDirectory;
  if (!cacheRoot) return false;

  // Expo cache URIs are typically file://…/Cache/… (Android) or file://…/Caches/…
  const normalized = uri.replace(/\\/g, '/');
  const normalizedRoot = cacheRoot.replace(/\\/g, '/');
  if (!normalized.startsWith(normalizedRoot) && !normalized.startsWith(normalizedRoot.replace(/^file:\/\//, ''))) {
    // Also accept when uri omits the file:// prefix that cacheDirectory includes, or vice versa.
    const strip = (value: string) => value.replace(/^file:\/\//i, '');
    if (!strip(normalized).startsWith(strip(normalizedRoot))) return false;
  }

  // Block path traversal and remote schemes.
  if (normalized.includes('..')) return false;
  if (/^(https?:|javascript:|data:)/i.test(normalized)) return false;
  return true;
}

export default function DocumentViewerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ uri?: string; mimeType?: string; title?: string }>();
  const uri = firstParam(params.uri);
  const mimeType = firstParam(params.mimeType).toLowerCase();
  const title = firstParam(params.title) || 'Document';

  const isImage = mimeType.startsWith('image/');
  const sourceUri = useMemo(() => (isTrustedLocalDocumentUri(uri) ? uri : ''), [uri]);

  const onShouldStartLoadWithRequest = (request: ShouldStartLoadRequest) => {
    // Stay on the single trusted local document — block navigations / injected links.
    if (!sourceUri) return false;
    if (request.url === sourceUri || request.url === 'about:blank') return true;
    return isTrustedLocalDocumentUri(request.url);
  };

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close document"
          onPress={() => router.back()}
          style={styles.closeButton}
          hitSlop={8}>
          <MaterialIcons name="close" size={24} color="#101828" />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <View style={styles.closeButton} />
      </View>

      {!sourceUri ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>This document is unavailable.</Text>
        </View>
      ) : isImage ? (
        <Image
          source={{ uri: sourceUri }}
          style={styles.flex}
          contentFit="contain"
          transition={150}
        />
      ) : (
        <WebView
          source={{ uri: sourceUri }}
          style={styles.flex}
          // Local cache files only — never allow arbitrary http(s)/custom schemes.
          originWhitelist={['file://*']}
          // Android needs file access to render the cached PDF; keep cross-file JS access off.
          allowFileAccess={Platform.OS === 'android'}
          allowFileAccessFromFileURLs={false}
          allowUniversalAccessFromFileURLs={false}
          allowingReadAccessToURL={sourceUri}
          javaScriptEnabled={false}
          domStorageEnabled={false}
          setSupportMultipleWindows={false}
          onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
          startInLoadingState
          renderLoading={(): ReactElement => (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color="#0b6bcb" />
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f172a' },
  header: {
    backgroundColor: '#ffffff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e4e7ec',
    paddingHorizontal: 12,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: {
    flex: 1,
    textAlign: 'center',
    fontFamily: FONT_FAMILY,
    fontSize: 16,
    fontWeight: '600',
    color: '#101828',
  },
  flex: { flex: 1, backgroundColor: '#0f172a' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: '#e4e7ec', fontFamily: FONT_FAMILY, fontSize: 15, textAlign: 'center' },
  loading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
  },
});
