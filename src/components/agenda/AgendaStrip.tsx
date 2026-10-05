import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { agendaApi } from '@/api/agenda';
import { useAuth } from '@/auth/AuthContext';
import { BookingSheet } from '@/components/agenda/BookingSheet';
import { formatWhen } from '@/lib/agendaFormat';
import { colors, fonts, radius, spacing } from '@/theme';

interface Props {
  entityId: string;
  entityName: string;
}

/**
 * Franja delgada bajo las acciones del perfil: la señal de disponibilidad real
 * ("Próximo espacio: hoy 3:00 p.m.") y el botón secundario Agendar. Si el
 * negocio no tiene la agenda activa no pinta nada.
 */
export function AgendaStrip({ entityId, entityName }: Props) {
  const router = useRouter();
  const { status } = useAuth();
  const [open, setOpen] = useState(false);
  const summary = useQuery({
    queryKey: ['agenda-summary', entityId],
    queryFn: () => agendaApi.summary(entityId),
    enabled: status === 'signedIn',
    staleTime: 20_000,
  });

  const data = summary.data;
  if (!data?.enabled) return null;

  return (
    <>
      <View style={styles.strip}>
        <Ionicons name="calendar-outline" size={20} color={colors.primary} />
        <View style={styles.textWrap}>
          <Text style={styles.line} numberOfLines={1}>
            {data.next_slot ? `Próximo espacio: ${formatWhen(data.next_slot).toLowerCase()}` : 'Sin espacios por ahora'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => setOpen(true)}
          disabled={!data.next_slot}
          style={({ pressed }) => [styles.button, pressed && { opacity: 0.8 }, !data.next_slot && { opacity: 0.4 }]}
        >
          <Text style={styles.buttonText}>Agendar</Text>
        </Pressable>
      </View>
      <BookingSheet
        visible={open}
        entityId={entityId}
        entityName={entityName}
        summary={data}
        onClose={() => setOpen(false)}
        onBooked={(appointment) => {
          setOpen(false);
          router.push({ pathname: '/appointment/[id]', params: { id: appointment.id } });
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  textWrap: { flex: 1 },
  line: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.ink },
  button: {
    minHeight: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.primary },
});
