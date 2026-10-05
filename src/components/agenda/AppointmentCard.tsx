import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { agendaApi } from '@/api/agenda';
import { formatWhen, STATUS_COLOR, STATUS_LABEL } from '@/lib/agendaFormat';
import { colors, fonts, radius, spacing } from '@/theme';

/** Tarjeta de una cita dentro del hilo del chat: se actualiza sola con el estado. */
export function AppointmentCard({ appointmentId }: { appointmentId: string }) {
  const router = useRouter();
  const query = useQuery({
    queryKey: ['appointment', appointmentId],
    queryFn: () => agendaApi.get(appointmentId),
    staleTime: 15_000,
  });
  const appt = query.data;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/appointment/[id]', params: { id: appointmentId } })}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.icon}>
        <Ionicons name="calendar" size={20} color={colors.primary} />
      </View>
      {appt ? (
        <View style={styles.body}>
          <Text style={styles.when}>{formatWhen(appt.starts_at)}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            {appt.service ? `${appt.service.name} · ` : ''}
            <Text style={{ color: STATUS_COLOR[appt.status], fontFamily: fonts.ui.bold }}>{STATUS_LABEL[appt.status]}</Text>
          </Text>
        </View>
      ) : query.isError ? (
        <Text style={styles.meta}>No se pudo cargar la cita</Text>
      ) : (
        <ActivityIndicator color={colors.primary} />
      )}
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minWidth: 250,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  when: { fontSize: 16, fontFamily: fonts.ui.extrabold, color: colors.ink },
  meta: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
});
