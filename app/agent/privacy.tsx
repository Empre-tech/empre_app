import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmpreSymbol } from '@/components/EmpreSymbol';
import { colors, fonts } from '@/theme';

const NEVER = [
  { t: 'Tus notas de voz', d: 'El teléfono las vuelve texto; a Empre no llega el audio.' },
  { t: 'Dónde estás exactamente', d: 'Solo usa tu ubicación para buscar cerca de ti, y Agent no la guarda.' },
  { t: 'Nada para anuncios', d: 'No se vende ni se usa para mostrarte publicidad.' },
];

/**
 * Tablero «Lo que Agent sabe de ti». Hoy Agent no guarda preferencias: lo dice tal cual, sin una lista de ejemplo.
 * Cuando exista esa memoria, aquí van lo recordado, el botón de borrar y el interruptor por negocio del tablero.
 */
export default function AgentPrivacyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={20} color={colors.ink} />
        </Pressable>
        <EmpreSymbol product="agent" size={30} />
        <View style={styles.headText}>
          <Text style={styles.eyebrow}>PERFIL</Text>
          <Text style={styles.title} accessibilityRole="header">
            Lo que Agent sabe de ti
          </Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 20 }]}>
        <Text style={styles.lead}>Solo usa lo que ya hiciste en Empre, y cada negocio ve solo lo suyo.</Text>

        <Text style={styles.eyebrow}>RECORDADO</Text>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Agent no recuerda nada de ti</Text>
          <Text style={styles.cardText}>No guarda preferencias tuyas. Para ofrecerte «lo de siempre» mira tu última cita en ese negocio, que sigue en Mis salidas.</Text>
        </View>

        <Text style={[styles.eyebrow, styles.gap]}>LO QUE NUNCA GUARDA</Text>
        <View style={styles.never}>
          {NEVER.map((n) => (
            <View key={n.t} style={styles.neverRow}>
              <Ionicons name="close-circle-outline" size={18} color={colors.verified} style={styles.neverIcon} />
              <View style={styles.neverBody}>
                <Text style={styles.neverTitle}>{n.t}</Text>
                <Text style={styles.neverText}>{n.d}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 10 },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  headText: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 11, letterSpacing: 1.1, fontFamily: fonts.ui.extrabold, color: colors.faint },
  title: { fontSize: 21, lineHeight: 25, fontFamily: fonts.display.bold, color: colors.ink },
  body: { paddingHorizontal: 16, gap: 12 },
  lead: { fontSize: 13.5, lineHeight: 20, fontFamily: fonts.ui.medium, color: colors.muted },
  gap: { marginTop: 4 },
  card: { padding: 14, gap: 4, borderRadius: 16, backgroundColor: colors.surface },
  cardTitle: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  cardText: { fontSize: 13, lineHeight: 19, fontFamily: fonts.ui.medium, color: colors.muted },
  never: { padding: 12, gap: 10, borderRadius: 16, backgroundColor: colors.surface },
  neverRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  neverIcon: { marginTop: 1 },
  neverBody: { flex: 1, minWidth: 0, gap: 1 },
  neverTitle: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  neverText: { fontSize: 12.5, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.muted },
});
