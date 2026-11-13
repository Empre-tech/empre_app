import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { entitiesApi } from '@/api/endpoints';
import { Button } from '@/components/Button';
import { EmpreMark } from '@/components/EmpreButton';
import { colors, fonts, radius, spacing } from '@/theme';

const STEPS = [
  { t: 'Pon tu negocio en el mapa', d: 'Listo' },
  { t: 'Sube tu primer servicio', d: 'Con foto, en 1 min' },
  { t: 'Pon tus horas libres', d: 'Para que te reserven' },
  { t: 'Anota tu primera venta', d: 'Para ver tu plata del día' },
];

/**
 * Recién creado el negocio (tablero «Primera vez», teléfono 5): dónde quedó y un solo siguiente paso. El camino muestra
 * lo que viene, sin obligar a nada.
 */
export default function BusinessReadyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const entity = useQuery({ queryKey: ['entity', id], queryFn: () => entitiesApi.get(id ?? ''), enabled: Boolean(id) });
  const name = entity.data?.name ?? 'Tu negocio';
  const onMap = Boolean(entity.data?.latitude || entity.data?.longitude);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.body, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.lg }]}>
      <View style={styles.top}>
        <View style={styles.seal}>
          <EmpreMark size={44} color="#FFFFFF" />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {onMap ? `${name} ya está en el mapa` : `${name} ya está en Empre`}
        </Text>
        <Text style={styles.lead}>{onMap ? 'Quien busque lo que haces cerca ya te puede ver.' : 'Sin ubicación sale en las búsquedas; pon el punto en el mapa para salir cerca de la gente.'}</Text>
      </View>
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>Tu camino en Empre</Text>
          <Text style={styles.cardCount}>1 de 6</Text>
        </View>
        {STEPS.map((s, i) => (
          <View key={s.t} style={styles.step}>
            <View style={[styles.dot, i === 0 && styles.dotDone, i === 1 && styles.dotNow]}>
              {i === 0 ? <Ionicons name="checkmark" size={15} color="#FFFFFF" /> : <Text style={[styles.dotN, i === 1 && styles.dotNNow]}>{i + 1}</Text>}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.stepT, i === 1 && styles.stepTNow, i === 0 && styles.stepTDone]}>{s.t}</Text>
              <Text style={styles.stepD}>{s.d}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={{ gap: spacing.sm }}>
        <Button title="Subir mi primer servicio" onPress={() => router.replace({ pathname: '/business/products/item', params: { entityId: id ?? '' } })} />
        <Button title="Ver mi perfil" variant="ghost" onPress={() => router.replace({ pathname: '/business/[id]', params: { id: id ?? '' } })} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  body: { flexGrow: 1, paddingHorizontal: 20, gap: spacing.lg },
  top: { alignItems: 'center', gap: 10 },
  seal: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink },
  title: { fontSize: 28, lineHeight: 32, fontFamily: fonts.display.bold, color: colors.ink, textAlign: 'center', letterSpacing: -0.4 },
  lead: { fontSize: 15, lineHeight: 21, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center' },
  card: { padding: 14, gap: 4, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  cardTitle: { fontSize: 17, fontFamily: fonts.ui.bold, color: colors.ink },
  cardCount: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 },
  dot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.line },
  dotDone: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
  dotNow: { backgroundColor: colors.ink, borderColor: colors.ink },
  dotN: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.faint },
  dotNNow: { color: '#FFFFFF' },
  stepT: { fontSize: 15, fontFamily: fonts.ui.medium, color: colors.muted },
  stepTNow: { fontFamily: fonts.ui.bold, color: colors.ink },
  stepTDone: { color: colors.muted },
  stepD: { fontSize: 12, fontFamily: fonts.ui.medium, color: colors.muted },
});
