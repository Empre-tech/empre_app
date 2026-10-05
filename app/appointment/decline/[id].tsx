import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { agendaApi } from '@/api/agenda';
import { Button } from '@/components/Button';
import { DECLINE_REASONS, dayKey, formatClock, formatDay, formatWhen } from '@/lib/agendaFormat';
import { colors, fonts, radius, spacing } from '@/theme';

/** Rechazar con motivo (un toque) y, si se puede, proponer hasta 3 horas alternativas. */
export default function DeclineScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<'no_space' | 'no_service' | 'other'>('no_space');
  const [note, setNote] = useState('');
  const [picked, setPicked] = useState<string[]>([]);

  const appt = useQuery({ queryKey: ['appointment', id], queryFn: () => agendaApi.get(id), enabled: Boolean(id) }).data;

  // Horas libres del mismo día (para la misma duración del servicio pedido).
  const day = appt ? dayKey(new Date(appt.starts_at)) : '';
  const slots = useQuery({
    queryKey: ['availability', appt?.entity_id, day, appt?.service_id ?? null],
    queryFn: () => agendaApi.availability(appt!.entity_id, day, appt!.service_id),
    enabled: Boolean(appt),
  });
  // Las tres más cercanas a la hora pedida.
  const suggestions = useMemo(() => {
    if (!appt) return [];
    const target = Date.parse(appt.starts_at);
    return [...(slots.data ?? [])]
      .sort((a, b) => Math.abs(Date.parse(a) - target) - Math.abs(Date.parse(b) - target))
      .slice(0, 3)
      .sort();
  }, [slots.data, appt]);

  const decline = useMutation({
    mutationFn: () => agendaApi.decline(id, { reason_code: reason, note: note.trim() || undefined, propose: picked }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['appointment', id], updated);
      void queryClient.invalidateQueries({ queryKey: ['agenda'] });
      void queryClient.invalidateQueries({ queryKey: ['appointments'] });
      router.back();
    },
    onError: (error: Error) => Alert.alert('No se pudo rechazar', error.message === 'bad_state' ? 'Esta solicitud ya cambió de estado.' : error.message),
  });

  if (!appt) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const toggle = (iso: string) =>
    setPicked((prev) => (prev.includes(iso) ? prev.filter((p) => p !== iso) : [...prev, iso]));

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Volver">
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Rechazar solicitud</Text>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
        <View style={styles.summary}>
          <Text style={styles.summaryName}>{appt.customer?.name ?? 'Cliente'}</Text>
          <Text style={styles.summaryWhen}>
            {formatWhen(appt.starts_at)}
            {appt.service ? ` · ${appt.service.name}` : ''}
          </Text>
        </View>

        <Text style={styles.section}>Motivo</Text>
        {DECLINE_REASONS.map((r) => (
          <Pressable key={r.code} onPress={() => setReason(r.code)} style={styles.radioRow} accessibilityRole="radio" accessibilityState={{ selected: reason === r.code }}>
            <View style={[styles.radio, reason === r.code && styles.radioOn]}>{reason === r.code ? <View style={styles.radioDot} /> : null}</View>
            <Text style={styles.radioLabel}>{r.label}</Text>
          </Pressable>
        ))}
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Mensaje para el cliente (opcional)"
          placeholderTextColor={colors.muted}
          maxLength={200}
          style={styles.input}
        />

        <View style={styles.proposeBox}>
          <Text style={styles.proposeTitle}>Proponle otra hora</Text>
          <Text style={styles.proposeText}>Así no pierdes al cliente. Elige hasta 3.</Text>
          {slots.isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : suggestions.length === 0 ? (
            <Text style={styles.proposeText}>No hay horas libres ese día.</Text>
          ) : (
            <View style={styles.chips}>
              {suggestions.map((iso) => (
                <Pressable key={iso} onPress={() => toggle(iso)} style={[styles.chip, picked.includes(iso) && styles.chipOn]}>
                  <Text style={[styles.chipText, picked.includes(iso) && styles.chipTextOn]}>
                    {formatDay(iso) === 'Hoy' ? '' : `${formatDay(iso)} `}
                    {formatClock(iso)}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <Button
          title={picked.length > 0 ? `Rechazar y proponer ${picked.length} ${picked.length === 1 ? 'hora' : 'horas'}` : 'Rechazar sin proponer'}
          onPress={() => decline.mutate()}
          loading={decline.isPending}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
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
  content: { padding: spacing.lg, gap: spacing.md },
  summary: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, gap: 2 },
  summaryName: { fontSize: 17, fontFamily: fonts.ui.extrabold, color: colors.ink },
  summaryWhen: { fontSize: 14, fontFamily: fonts.ui.medium, color: colors.muted },
  section: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.muted, marginTop: spacing.sm },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
  },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  radioLabel: { fontSize: 15.5, fontFamily: fonts.ui.semibold, color: colors.ink },
  input: {
    minHeight: 50,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    fontFamily: fonts.ui.regular,
    color: colors.ink,
  },
  proposeBox: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, gap: spacing.sm },
  proposeTitle: { fontSize: 15.5, fontFamily: fonts.ui.bold, color: colors.ink },
  proposeText: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: 46, paddingHorizontal: spacing.lg, borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink },
  chipTextOn: { color: '#fff' },
});
