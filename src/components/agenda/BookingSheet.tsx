import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { agendaApi, type Appointment, type AgendaSummary } from '@/api/agenda';
import { Button } from '@/components/Button';
import {
  dayKey,
  dayNumber,
  formatClock,
  formatDay,
  formatDuration,
  monthShort,
  nextDays,
  weekdayShort,
} from '@/lib/agendaFormat';
import { colors, fonts, radius, spacing } from '@/theme';

interface Props {
  visible: boolean;
  entityId: string;
  entityName: string;
  summary: AgendaSummary;
  onClose: () => void;
  onBooked: (appointment: Appointment) => void;
}

/**
 * Hoja "Elegir día y hora": días, horas libres (solo las libres: las ocupadas
 * no se muestran), servicio si el negocio definió varios y una nota opcional.
 */
export function BookingSheet({ visible, entityId, entityName, summary, onClose, onBooked }: Props) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const days = useMemo(() => nextDays(Math.min(summary.horizon_days + 1, 15)), [summary.horizon_days]);
  const [day, setDay] = useState(() => dayKey(days[0]));
  const [serviceId, setServiceId] = useState<string | undefined>(summary.services[0]?.id);
  const [slot, setSlot] = useState<string | null>(null);
  const [note, setNote] = useState('');

  // Al abrir la hoja arranca en el día del próximo espacio libre.
  useEffect(() => {
    if (!visible) return;
    setSlot(null);
    setNote('');
    setServiceId(summary.services[0]?.id);
    setDay(dayKey(summary.next_slot ? new Date(summary.next_slot) : days[0]));
  }, [visible, summary.next_slot, summary.services, days]);

  const needsService = summary.services.length > 0;
  const slots = useQuery({
    queryKey: ['availability', entityId, day, serviceId ?? null],
    queryFn: () => agendaApi.availability(entityId, day, serviceId),
    enabled: visible && (!needsService || Boolean(serviceId)),
    staleTime: 10_000,
  });

  const service = summary.services.find((s) => s.id === serviceId);
  const durationMin = service?.duration_min ?? summary.slot_minutes;

  const book = useMutation({
    mutationFn: () =>
      agendaApi.book({ entity_id: entityId, service_id: serviceId, starts_at: slot as string, note: note.trim() || undefined }),
    onSuccess: (appointment) => {
      void queryClient.invalidateQueries({ queryKey: ['appointments'] });
      void queryClient.invalidateQueries({ queryKey: ['agenda-summary', entityId] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      onBooked(appointment);
    },
    onError: (error: Error) => {
      if (error.message === 'slot_taken') {
        // Alguien más lo tomó (o dejó de estar libre): refrescamos las horas.
        setSlot(null);
        void slots.refetch();
        Alert.alert('Ese horario se acaba de ocupar', 'Elige otra hora, ya actualizamos las disponibles.');
      } else if (error.message === 'too_many_pending') {
        Alert.alert('Ya tienes 3 solicitudes pendientes', 'Espera a que te respondan antes de pedir otra.');
      } else if (error.message === 'customer_busy') {
        Alert.alert('Ya tienes una cita a esa hora', 'Elige otro horario.');
      } else if (error.message === 'entity_hidden') {
        Alert.alert('Este negocio no está disponible', 'Por ahora no recibe citas nuevas.');
      } else {
        Alert.alert('No pudimos pedir la cita', error.message);
      }
    },
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Cerrar" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Elegir día y hora</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {entityName}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cerrar">
              <Ionicons name="close" size={24} color={colors.ink} />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {needsService ? (
              <View style={styles.block}>
                <Text style={styles.label}>Servicio</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                  {summary.services.map((s) => (
                    <Pressable
                      key={s.id}
                      onPress={() => {
                        setServiceId(s.id);
                        setSlot(null);
                      }}
                      style={[styles.chip, serviceId === s.id && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, serviceId === s.id && styles.chipTextActive]}>
                        {s.name} · {formatDuration(s.duration_min)}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.row, styles.block]}>
              {days.map((d) => {
                const key = dayKey(d);
                const active = key === day;
                return (
                  <Pressable
                    key={key}
                    onPress={() => {
                      setDay(key);
                      setSlot(null);
                    }}
                    style={[styles.dayChip, active && styles.chipActive]}
                    accessibilityLabel={`${formatDay(d)}`}
                  >
                    <Text style={[styles.dayWeek, active && styles.chipTextActive]}>{weekdayShort(d)}</Text>
                    <Text style={[styles.dayNum, active && styles.chipTextActive]}>{dayNumber(d)}</Text>
                    <Text style={[styles.dayMonth, active && styles.chipTextActive]}>{monthShort(d)}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.block}>
              {slots.isLoading ? (
                <ActivityIndicator color={colors.primary} />
              ) : slots.isError ? (
                <Text style={styles.empty}>No pudimos cargar las horas. Intenta de nuevo.</Text>
              ) : (slots.data ?? []).length === 0 ? (
                <Text style={styles.empty}>No hay horas libres ese día. Prueba con otro.</Text>
              ) : (
                <View style={styles.grid}>
                  {(slots.data ?? []).map((iso) => (
                    <Pressable
                      key={iso}
                      onPress={() => setSlot(iso)}
                      style={[styles.slot, slot === iso && styles.chipActive]}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.slotText, slot === iso && styles.chipTextActive]}>{formatClock(iso)}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            {slot ? (
              <View style={styles.block}>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryWhen}>
                    {formatDay(slot)}, {formatClock(slot)}
                  </Text>
                  <Text style={styles.summaryMeta}>
                    {service ? `${service.name} · ` : ''}
                    {formatDuration(durationMin)}
                  </Text>
                </View>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="Nota para el negocio (opcional)"
                  placeholderTextColor={colors.muted}
                  maxLength={300}
                  style={styles.note}
                />
              </View>
            ) : null}
          </ScrollView>

          <Button
            title="Pedir cita"
            onPress={() => book.mutate()}
            disabled={!slot}
            loading={book.isPending}
            style={{ marginTop: spacing.md }}
          />
          <Text style={styles.hint}>El negocio tiene que aceptarla. Te avisamos apenas responda.</Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(22,35,58,0.45)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: '88%',
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  title: { fontSize: 19, fontFamily: fonts.display.bold, color: colors.ink },
  subtitle: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted, marginTop: 1 },
  block: { marginTop: spacing.md },
  label: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.muted, marginBottom: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink },
  chipTextActive: { color: '#fff' },
  dayChip: {
    width: 58,
    minHeight: 76,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  dayWeek: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted, textTransform: 'uppercase' },
  dayNum: { fontSize: 19, fontFamily: fonts.ui.extrabold, color: colors.ink },
  dayMonth: { fontSize: 11, fontFamily: fonts.ui.medium, color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  slot: {
    width: '31%',
    minHeight: 48,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  slotText: { fontSize: 14.5, fontFamily: fonts.ui.semibold, color: colors.ink },
  empty: { fontSize: 14, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center', paddingVertical: spacing.lg },
  summaryCard: { backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: spacing.md, gap: 2 },
  summaryWhen: { fontSize: 17, fontFamily: fonts.ui.extrabold, color: colors.ink },
  summaryMeta: { fontSize: 13.5, fontFamily: fonts.ui.medium, color: colors.muted },
  note: {
    marginTop: spacing.sm,
    minHeight: 48,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    fontFamily: fonts.ui.regular,
    color: colors.ink,
  },
  hint: { textAlign: 'center', marginTop: spacing.sm, fontSize: 12.5, fontFamily: fonts.ui.medium, color: colors.muted },
});
