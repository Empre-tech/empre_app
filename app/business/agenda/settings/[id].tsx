import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { agendaApi, type AgendaSettingsInput } from '@/api/agenda';
import { Button } from '@/components/Button';
import { formatDuration } from '@/lib/agendaFormat';
import { colors, fonts, radius, spacing } from '@/theme';

const SLOT_OPTIONS = [15, 30, 45, 60];
const BUFFER_OPTIONS = [0, 5, 10, 15, 30];
const SERVICE_DURATIONS = [15, 20, 30, 45, 60, 90, 120];
const CLOCK_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

const EMPTY: AgendaSettingsInput = {
  enabled: false,
  slot_minutes: 30,
  lunch_start: '',
  lunch_end: '',
  buffer_min: 0,
  min_notice_min: 45,
  horizon_days: 14,
};

function pad(clock: string): string {
  const [h, m] = clock.split(':');
  return `${h.padStart(2, '0')}:${m}`;
}

export default function AgendaSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AgendaSettingsInput>(EMPTY);
  const [svcName, setSvcName] = useState('');
  const [svcMin, setSvcMin] = useState(30);

  const settings = useQuery({ queryKey: ['agenda-settings', id], queryFn: () => agendaApi.settings(id), enabled: Boolean(id) });
  const services = useQuery({ queryKey: ['agenda-services', id], queryFn: () => agendaApi.services(id), enabled: Boolean(id) });

  useEffect(() => {
    if (settings.data) {
      const { entity_id: _ignored, ...rest } = settings.data;
      setForm(rest);
    }
  }, [settings.data]);

  const save = useMutation({
    mutationFn: () => {
      const lunchStart = form.lunch_start.trim();
      const lunchEnd = form.lunch_end.trim();
      if ((lunchStart || lunchEnd) && !(CLOCK_RE.test(lunchStart) && CLOCK_RE.test(lunchEnd))) {
        return Promise.reject(new Error('El almuerzo va en formato 12:00 a 13:00.'));
      }
      return agendaApi.saveSettings(id, {
        ...form,
        lunch_start: lunchStart ? pad(lunchStart) : '',
        lunch_end: lunchEnd ? pad(lunchEnd) : '',
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['agenda-settings', id] });
      void queryClient.invalidateQueries({ queryKey: ['agenda-summary', id] });
      void queryClient.invalidateQueries({ queryKey: ['agenda', id] });
      router.back();
    },
    onError: (e: Error) => Alert.alert('No se pudo guardar', e.message),
  });

  const addService = useMutation({
    mutationFn: () => agendaApi.createService(id, { name: svcName.trim(), duration_min: svcMin }),
    onSuccess: () => {
      setSvcName('');
      void queryClient.invalidateQueries({ queryKey: ['agenda-services', id] });
      void queryClient.invalidateQueries({ queryKey: ['agenda-summary', id] });
    },
    onError: (e: Error) => Alert.alert('No se pudo agregar', e.message),
  });
  const removeService = useMutation({
    mutationFn: (serviceId: string) => agendaApi.deleteService(id, serviceId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['agenda-services', id] });
      void queryClient.invalidateQueries({ queryKey: ['agenda-summary', id] });
    },
  });

  if (settings.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const set = <K extends keyof AgendaSettingsInput>(key: K, value: AgendaSettingsInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));
  const hasServices = (services.data ?? []).length > 0;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Volver">
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Ajustes de agenda</Text>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Agenda de citas</Text>
              <Text style={styles.help}>{form.enabled ? 'Activada: tus clientes pueden pedir cita.' : 'Apagada: tu perfil no muestra nada de agenda.'}</Text>
            </View>
            <Switch value={form.enabled} onValueChange={(v) => set('enabled', v)} trackColor={{ true: colors.primary }} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>¿De cuánto es cada espacio?</Text>
          <Text style={styles.help}>Si no defines servicios, cada cita dura esto.</Text>
          <View style={styles.chips}>
            {SLOT_OPTIONS.map((m) => (
              <Pressable key={m} onPress={() => set('slot_minutes', m)} style={[styles.chip, form.slot_minutes === m && styles.chipOn]}>
                <Text style={[styles.chipText, form.slot_minutes === m && styles.onText]}>{formatDuration(m)}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.note}>Tus días y horas de atención se editan en “Editar negocio”.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Servicios (opcional)</Text>
          <Text style={styles.help}>Cada servicio ocupa su propio tiempo. Ej.: Corte 30 min, Tinte 1 hora.</Text>
          {(services.data ?? []).map((s) => (
            <View key={s.id} style={styles.serviceRow}>
              <Text style={styles.serviceName}>{s.name}</Text>
              <Text style={styles.serviceMin}>{formatDuration(s.duration_min)}</Text>
              <Pressable onPress={() => removeService.mutate(s.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Quitar ${s.name}`}>
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
              </Pressable>
            </View>
          ))}
          <TextInput value={svcName} onChangeText={setSvcName} placeholder="Nombre del servicio" placeholderTextColor={colors.muted} style={styles.input} maxLength={60} />
          <View style={styles.chips}>
            {SERVICE_DURATIONS.map((m) => (
              <Pressable key={m} onPress={() => setSvcMin(m)} style={[styles.chip, svcMin === m && styles.chipOn]}>
                <Text style={[styles.chipText, svcMin === m && styles.onText]}>{formatDuration(m)}</Text>
              </Pressable>
            ))}
          </View>
          <Button title="Agregar servicio" variant="secondary" disabled={!svcName.trim()} loading={addService.isPending} onPress={() => addService.mutate()} />
          {hasServices ? null : <Text style={styles.note}>Sin servicios, el cliente solo elige día y hora.</Text>}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Descanso de almuerzo (opcional)</Text>
          <View style={styles.lunchRow}>
            <TextInput value={form.lunch_start} onChangeText={(v) => set('lunch_start', v)} placeholder="12:00" placeholderTextColor={colors.muted} style={[styles.input, { flex: 1 }]} keyboardType="numbers-and-punctuation" maxLength={5} />
            <Text style={styles.help}>a</Text>
            <TextInput value={form.lunch_end} onChangeText={(v) => set('lunch_end', v)} placeholder="13:00" placeholderTextColor={colors.muted} style={[styles.input, { flex: 1 }]} keyboardType="numbers-and-punctuation" maxLength={5} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Margen entre citas</Text>
          <Text style={styles.help}>Para limpiar el puesto o desplazarte.</Text>
          <View style={styles.chips}>
            {BUFFER_OPTIONS.map((m) => (
              <Pressable key={m} onPress={() => set('buffer_min', m)} style={[styles.chip, form.buffer_min === m && styles.chipOn]}>
                <Text style={[styles.chipText, form.buffer_min === m && styles.onText]}>{m === 0 ? 'Ninguno' : `${m} min`}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Anticipación mínima</Text>
          <Text style={styles.help}>Mínimo 45 minutos: 15 para que respondas y 30 para que el cliente llegue.</Text>
          <View style={styles.chips}>
            {[45, 60, 120, 240].map((m) => (
              <Pressable key={m} onPress={() => set('min_notice_min', m)} style={[styles.chip, form.min_notice_min === m && styles.chipOn]}>
                <Text style={[styles.chipText, form.min_notice_min === m && styles.onText]}>{formatDuration(m)}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.cardTitle, { marginTop: spacing.md }]}>Hasta cuántos días adelante</Text>
          <View style={styles.chips}>
            {[7, 14, 30].map((d) => (
              <Pressable key={d} onPress={() => set('horizon_days', d)} style={[styles.chip, form.horizon_days === d && styles.chipOn]}>
                <Text style={[styles.chipText, form.horizon_days === d && styles.onText]}>{d} días</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Button title="Guardar" onPress={() => save.mutate()} loading={save.isPending} />
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
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, gap: spacing.sm },
  cardTitle: { fontSize: 15.5, fontFamily: fonts.ui.bold, color: colors.ink },
  help: { fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.muted },
  note: { fontSize: 12.5, fontFamily: fonts.ui.medium, color: colors.muted },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: 44, paddingHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink },
  onText: { color: '#fff' },
  input: { minHeight: 48, borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.line, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: fonts.ui.regular, color: colors.ink, backgroundColor: colors.surface },
  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  serviceName: { flex: 1, fontSize: 15, fontFamily: fonts.ui.semibold, color: colors.ink },
  serviceMin: { fontSize: 13.5, fontFamily: fonts.ui.medium, color: colors.muted },
  lunchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
