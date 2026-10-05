import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { agendaApi, type Appointment } from '@/api/agenda';
import { useAuth } from '@/auth/AuthContext';
import { SignInPrompt } from '@/components/SignInPrompt';
import { formatWhen, STATUS_COLOR, STATUS_LABEL } from '@/lib/agendaFormat';
import { colors, fonts, radius, spacing } from '@/theme';

function Row({ appt, onPress }: { appt: Appointment; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.when}>{formatWhen(appt.starts_at)}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          {appt.entity?.name ?? 'Negocio'}
          {appt.service ? ` · ${appt.service.name}` : ''}
        </Text>
      </View>
      <Text style={[styles.status, { color: STATUS_COLOR[appt.status] }]}>{STATUS_LABEL[appt.status]}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

/** "Mis citas": las que el usuario pidió como cliente, próximas primero. */
export default function AppointmentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status } = useAuth();
  const query = useQuery({ queryKey: ['appointments'], queryFn: agendaApi.mine, enabled: status === 'signedIn' });

  const all = query.data ?? [];
  const live = all
    .filter((a) => a.status === 'requested' || a.status === 'confirmed')
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const past = all.filter((a) => a.status !== 'requested' && a.status !== 'confirmed');
  const open = (id: string) => router.push({ pathname: '/appointment/[id]', params: { id } });

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Volver">
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Mis citas</Text>
      </View>
      {status !== 'signedIn' ? (
        <SignInPrompt title="Inicia sesión" message="Para ver y pedir tus citas." />
      ) : query.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : all.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>Tus citas aparecerán acá.</Text>
          <Pressable onPress={() => router.replace('/(tabs)')} accessibilityRole="button">
            <Text style={styles.link}>Buscar en el mapa</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
          {live.length > 0 ? <Text style={styles.section}>Próximas</Text> : null}
          {live.map((a) => (
            <Row key={a.id} appt={a} onPress={() => open(a.id)} />
          ))}
          {past.length > 0 ? <Text style={styles.section}>Anteriores</Text> : null}
          {past.map((a) => (
            <Row key={a.id} appt={a} onPress={() => open(a.id)} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headerTitle: { fontSize: 18, fontFamily: fonts.display.bold, color: colors.ink },
  content: { padding: spacing.lg, gap: spacing.sm },
  section: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.muted, marginTop: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 64,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  when: { fontSize: 15.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  meta: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  status: { fontSize: 12.5, fontFamily: fonts.ui.bold },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  empty: { fontSize: 15, fontFamily: fonts.ui.medium, color: colors.muted },
  link: { fontSize: 15, fontFamily: fonts.ui.bold, color: colors.primary },
});
