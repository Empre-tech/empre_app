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
import { Chip } from '@/components/Chip';

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
  intake_mode: 'rules',
  review_no_shows: 2,
  review_first_visit: false,
  review_notice_min: 120,
  notify_every: 60,
  quiet_mode: 'hours',
  quiet_from: '21:00',
  quiet_to: '07:00',
};

// Cómo recibe las solicitudes (§9b, mockup conversaciones_agenda.html): con reglas por defecto.
const INTAKE: { key: AgendaSettingsInput['intake_mode']; title: string; help: string }[] = [
  { key: 'manual', title: 'Revisar cada una', help: 'Tú aceptas o rechazas. Para pocos clientes o servicios que hay que evaluar.' },
  { key: 'rules', title: 'Automático con reglas', help: 'Se confirman solas; solo revisas las que no cumplen tus reglas.' },
  { key: 'auto', title: 'Todo automático', help: 'Hora libre = cita confirmada. Nunca dos citas en la misma hora.' },
];
const NOTIFY: { value: number; label: string }[] = [
  { value: 0, label: 'Al instante' },
  { value: 30, label: 'Cada 30 min' },
  { value: 60, label: 'Cada hora' },
  { value: 360, label: '2 veces al día' },
];
const QUIET: { key: AgendaSettingsInput['quiet_mode']; label: string }[] = [
  { key: 'hours', label: 'Fuera de mi horario' },
  { key: 'custom', label: 'Elegir horas' },
  { key: 'off', label: 'Nunca' },
];

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
      const qFrom = form.quiet_from.trim();
      const qTo = form.quiet_to.trim();
      if (form.quiet_mode === 'custom' && !(CLOCK_RE.test(qFrom) && CLOCK_RE.test(qTo) && pad(qFrom) !== pad(qTo))) {
        return Promise.reject(new Error('El silencio va en formato 21:00 a 07:00, con horas distintas.'));
      }
      return agendaApi.saveSettings(id, {
        ...form,
        lunch_start: lunchStart ? pad(lunchStart) : '',
        lunch_end: lunchEnd ? pad(lunchEnd) : '',
        quiet_from: CLOCK_RE.test(qFrom) ? pad(qFrom) : '',
        quiet_to: CLOCK_RE.test(qTo) ? pad(qTo) : '',
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

        <View style={styles.card} accessibilityRole="radiogroup">
          <Text style={styles.cardTitle}>Cómo recibes las solicitudes</Text>
          {INTAKE.map((m) => {
            const on = form.intake_mode === m.key;
            return (
              <Pressable
                key={m.key}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => set('intake_mode', m.key)}
                style={[styles.mode, on && styles.modeOn]}
              >
                <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modeTitle}>
                    {m.title}
                    {m.key === 'rules' ? <Text style={styles.rec}>{'  Recomendado'}</Text> : null}
                  </Text>
                  <Text style={styles.help}>{m.help}</Text>
                </View>
              </Pressable>
            );
          })}
          {form.intake_mode === 'rules' ? (
            <View style={{ marginTop: spacing.xs }}>
              <Text style={styles.subTitle}>Revisar yo cuando…</Text>
              <View style={styles.switchRow}>
                <Text style={[styles.help, { flex: 1 }]}>El cliente tiene 2 faltas o más</Text>
                <Switch value={form.review_no_shows > 0} onValueChange={(v) => set('review_no_shows', v ? 2 : 0)} trackColor={{ true: colors.primary }} accessibilityLabel="Revisar clientes con 2 faltas o más" />
              </View>
              <View style={styles.switchRow}>
                <Text style={[styles.help, { flex: 1 }]}>Es su primera vez contigo</Text>
                <Switch value={form.review_first_visit} onValueChange={(v) => set('review_first_visit', v)} trackColor={{ true: colors.primary }} accessibilityLabel="Revisar clientes nuevos" />
              </View>
              <View style={styles.switchRow}>
                <Text style={[styles.help, { flex: 1 }]}>Pide con menos de 2 horas de anticipación</Text>
                <Switch value={form.review_notice_min > 0} onValueChange={(v) => set('review_notice_min', v ? 120 : 0)} trackColor={{ true: colors.primary }} accessibilityLabel="Revisar reservas con poca anticipación" />
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Avisos</Text>
          <Text style={styles.help}>Cómo te llegan las solicitudes y las citas nuevas.</Text>
          <View style={styles.chips} accessibilityRole="radiogroup">
            {NOTIFY.map((n) => (
              <Chip key={n.value} label={n.label} role="radio" tone="primary" size="lg" selected={form.notify_every === n.value} onPress={() => set('notify_every', n.value)} />
            ))}
          </View>
          <Text style={[styles.subTitle, { marginTop: spacing.sm }]}>Cuándo no te molestamos</Text>
          <View style={styles.chips} accessibilityRole="radiogroup">
            {QUIET.map((q) => (
              <Chip key={q.key} label={q.label} role="radio" tone="primary" size="lg" selected={form.quiet_mode === q.key} onPress={() => set('quiet_mode', q.key)} />
            ))}
          </View>
          {form.quiet_mode === 'custom' ? (
            <View style={styles.lunchRow}>
              <TextInput value={form.quiet_from} onChangeText={(v) => set('quiet_from', v)} placeholder="21:00" style={[styles.input, { flex: 1 }]} keyboardType="numbers-and-punctuation" accessibilityLabel="Silencio desde" />
              <Text style={styles.help}>a</Text>
              <TextInput value={form.quiet_to} onChangeText={(v) => set('quiet_to', v)} placeholder="07:00" style={[styles.input, { flex: 1 }]} keyboardType="numbers-and-punctuation" accessibilityLabel="Silencio hasta" />
            </View>
          ) : null}
          <Text style={styles.note}>
            {form.quiet_mode === 'hours'
              ? 'Usamos tu horario de atención: si lo cambias, esto cambia solo. Lo que llegue cerrado te espera en un resumen al abrir.'
              : form.quiet_mode === 'custom'
                ? 'Lo que llegue en esas horas te espera en un resumen al terminar el silencio.'
                : 'Te avisamos a cualquier hora.'}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>¿De cuánto es cada espacio?</Text>
          <Text style={styles.help}>Si no defines servicios, cada cita dura esto.</Text>
          <View style={styles.chips} accessibilityRole="radiogroup">
            {SLOT_OPTIONS.map((m) => (
              <Chip key={m} label={formatDuration(m)} accessibilityLabel={`Cada cita dura ${formatDuration(m)}`} role="radio" tone="primary" size="lg" selected={form.slot_minutes === m} onPress={() => set('slot_minutes', m)} />
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
          <View style={styles.chips} accessibilityRole="radiogroup">
            {SERVICE_DURATIONS.map((m) => (
              <Chip key={m} label={formatDuration(m)} accessibilityLabel={`Servicio de ${formatDuration(m)}`} role="radio" tone="primary" size="lg" selected={svcMin === m} onPress={() => setSvcMin(m)} />
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
          <View style={styles.chips} accessibilityRole="radiogroup">
            {BUFFER_OPTIONS.map((m) => (
              <Chip key={m} label={m === 0 ? 'Ninguno' : `${m} min`} accessibilityLabel={m === 0 ? 'Sin tiempo entre citas' : `${m} min entre citas`} role="radio" tone="primary" size="lg" selected={form.buffer_min === m} onPress={() => set('buffer_min', m)} />
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Anticipación mínima</Text>
          <Text style={styles.help}>Mínimo 45 minutos: 15 para que respondas y 30 para que el cliente llegue.</Text>
          <View style={styles.chips} accessibilityRole="radiogroup">
            {[45, 60, 120, 240].map((m) => (
              <Chip key={m} label={formatDuration(m)} accessibilityLabel={`Anticipación de ${formatDuration(m)}`} role="radio" tone="primary" size="lg" selected={form.min_notice_min === m} onPress={() => set('min_notice_min', m)} />
            ))}
          </View>
          <Text style={[styles.cardTitle, { marginTop: spacing.md }]}>Hasta cuántos días adelante</Text>
          <View style={styles.chips} accessibilityRole="radiogroup">
            {[7, 14, 30].map((d) => (
              <Chip key={d} label={`${d} días`} accessibilityLabel={`Reservas hasta ${d} días adelante`} role="radio" tone="primary" size="lg" selected={form.horizon_days === d} onPress={() => set('horizon_days', d)} />
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
  input: { minHeight: 48, borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.line, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: fonts.ui.regular, color: colors.ink, backgroundColor: colors.surface },
  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  serviceName: { flex: 1, fontSize: 15, fontFamily: fonts.ui.semibold, color: colors.ink },
  serviceMin: { fontSize: 13.5, fontFamily: fonts.ui.medium, color: colors.muted },
  lunchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  subTitle: { fontSize: 13.5, fontFamily: fonts.ui.bold, color: colors.ink },
  mode: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start', minHeight: 60, padding: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line },
  modeOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  modeTitle: { fontSize: 14.5, fontFamily: fonts.ui.bold, color: colors.ink },
  rec: { fontSize: 11.5, fontFamily: fonts.ui.extrabold, color: colors.success },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.muted, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  radioOn: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
});
