import { useRouter } from 'expo-router';
import { deleteStorageItem } from '@/utils/storage';
import useAuthStore from '@/store/authStore';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing } from '@/constants/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const onLogout = async () => {
    await deleteStorageItem('access_token');
    await deleteStorageItem('refresh_token');
    useAuthStore.getState().logout();
    router.replace('/index');
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.container}>
        <Text style={[styles.title, { color: colors.text }]}>Profile</Text>
        <Pressable
          style={[styles.button, { backgroundColor: colors.backgroundElement }]}
          onPress={onLogout}>
          <Text style={{ color: colors.text }}>Log out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  title: { fontSize: 22, fontWeight: '600' },
  button: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.two, borderRadius: Spacing.two },
});
