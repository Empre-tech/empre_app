import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmpreSymbol, type EmpreProduct } from '@/components/EmpreSymbol';
import { colors, fonts, spacing } from '@/theme';

/** Cabecera de las pantallas internas: botón circular elevado de volver, título y subtítulo o símbolo opcional. */
export function SubScreenHeader({
  title,
  subtitle,
  product,
}: {
  title: string;
  subtitle?: string;
  product?: EmpreProduct;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + spacing.sm }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Volver"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
        style={styles.back}
      >
        <Ionicons name="chevron-back" size={20} color={colors.ink} />
      </Pressable>
      <View style={styles.titleWrap}>
        {subtitle ? (
          <View style={styles.subRow}>
            {product ? <EmpreSymbol product={product} size={13} /> : null}
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
        ) : null}
        <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 6, backgroundColor: colors.bg },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', shadowColor: colors.ink, shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  titleWrap: { flex: 1, minWidth: 0 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  subtitle: { fontSize: 11, letterSpacing: 1.1, fontFamily: fonts.ui.extrabold, color: colors.faint, textTransform: 'uppercase' },
  title: { fontSize: 22, lineHeight: 27, fontFamily: fonts.display.bold, color: colors.ink },
});
