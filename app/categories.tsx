import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { categoriesApi } from '@/api/endpoints';
import { FigureTile } from '@/components/figures/Figure';
import { cardShadow, colors, fonts, spacing } from '@/theme';

/** Todas las categorías con su figura (lienzo B7). Tocar una pregunta por ella en «Pregúntale a Empre». */
export default function CategoriesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const categories = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list, staleTime: 10 * 60_000 });
  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} style={styles.round}>
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          Elige y te lo muestro cerca
        </Text>
      </View>
      {categories.isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} /> : null}
      <View style={styles.grid}>
        {(categories.data ?? []).map((c) => (
          <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={c.name} onPress={() => router.push({ pathname: '/ask', params: { q: c.name } })} style={({ pressed }) => [styles.cell, pressed && { opacity: 0.7 }]}>
            <FigureTile name={c.name} fallbackIcon={c.icon} size={56} style={styles.tile} />
            <Text style={styles.cellText} numberOfLines={2}>
              {c.name}
            </Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...cardShadow },
  title: { flex: 1, fontSize: 20, fontFamily: fonts.display.bold, color: colors.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: { width: '31.5%', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  tile: { width: '100%', aspectRatio: 1 },
  cellText: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.ink, textAlign: 'center' },
});
