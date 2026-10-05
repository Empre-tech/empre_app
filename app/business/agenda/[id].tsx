import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { agendaApi, type Appointment } from '@/api/agenda';
import { entitiesApi } from '@/api/endpoints';
import { Button } from '@/components/Button';
import {
  dayKey,
  dayNumber,
  formatClock,
  formatDay,
  formatDuration,
  formatRemaining,
  monthShort,
  nextDays,
  STATUS_COLOR,
  STATUS_LABEL,
  weekdayShort,
} from '@/lib/agendaFormat';
import { colors, fonts, radius, spacing } from '@/theme';

const DAYS_AHEAD = 14;
const BLOCK_DURATIONS = [30, 60, 120, 180, 240];

/** Hora de inicio de un día (en Colombia) como instante ISO. */
function dayStartIso(key: string): string {
  return new Date(`${key}T00:00:00-05:00`).toISOString();
}
function dayEndIso(key: string): string {
  return new Date(Date.parse(`${key}T00:00:00-05:00`) + 24 * 60 * 60 * 1000).toISOString();
}
function timeOptions(key: string, stepMin: number): string[] {
  const out: string[] = [];
  const start = Date.parse(`${key}T06:00:00-05:00`);
  for (let t = start; t < start + 16 * 60 * 60 * 1000; t += stepMin * 60 * 1000) out.push(new Date(t).toISOString());
  return out;
}

export default function BusinessAgendaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const days = useMemo(() => nextDays(DAYS_AHEAD), []);
  const [day, setDay] = useState(() => dayKey(days[0]));
  const [blockOpen, setBlockOpen] = useState(false);

  const entity = useQuery({ queryKey: ['entity', id], queryFn: () => entitiesApi.get(id), enabled: Boolean(id) }).data;
  const settings = useQuery({ queryKey: ['agenda-settings', id], queryFn: () => agendaApi.settings(id), enabled: Boolean(id) });
  const agenda = useQuery({
    queryKey: ['agenda', id, day],
    queryFn: () => agendaApi.agenda(id, dayStartIso(day), dayEndIso(day)),
    enabled: Boolean(id) && settings.data?.enabled === true,
    refetchInterval: 30_000,
  });

  const items = agenda.data ?? [];
  const pending = items.filter((a) => a.status === 'requested').sort((a, b) => Date.parse(a.expires_at ?? a.starts_at) - Date.parse(b.expires_at ?? b.starts_at));
  const today = items.filter((a) => a.status !== 'requested' && dayKey(new Date(a.starts_at)) === day);
  const confirmedToday = today.filter((a) => a.status === 'confirmed').length;

  const reload = () => {
    void queryClient.invalidateQueries({ queryKey: ['agenda', id] });
    void queryClient.invalidateQueries({ queryKey: ['agenda-summary', id] });
  };
  const accept = useMutation({
    mutationFn: (apptId: string) => agendaApi.accept(apptId),
    onSuccess: reload,
    onError: (e: Error) => {
      Alert.alert('No se pudo aceptar', e.message === 'bad_state' ? 'Esta solicitud ya venció o cambió.' : e.message);
      reload();
    },
  });
  const unblock = useMutation({ mutationFn: (blockId: string) => agendaApi.unblock(id, blockId), onSuccess: reload });

  const askUnblock = (a: Appointment) =>
    Alert.alert('¿Quitar este bloqueo?', `${formatClock(a.starts_at)} – ${formatClock(a.ends_at)}`, [
      { text: 'No', style: 'cancel' },
      { text: 'Quitar', onPress: () => unblock.mutate(a.id) },
    ]);

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Volver">
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Agenda</Text>
          {entity ? (
            <Text style={styles.headerSub} numberOfLines={1}>
              {entity.name}
            </Text>
          ) : null}
        </View>
        <Pressable
          onPress={() => router.push({ pathname: '/business/agenda/settings/[id]', params: { id } })}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Ajustes de agenda"
        >
          <Ionicons name="settings-outline" size={24} color={colors.ink} />
        </Pressable>
      </View>

      {settings.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !settings.data?.enabled ? (
        <View style={styles.center}>
          <Ionicons name="calendar-outline" size={42} color={colors.primary} />
          <Text style={styles.emptyTitle}>Define tus horarios y empieza a recibir citas</Text>
          <Text style={styles.emptyText}>Tus clientes verán tus espacios libres y te pedirán cita desde tu perfil.</Text>
          <Button
            title="Configurar agenda"
            onPress={() => router.push({ pathname: '/business/agenda/settings/[id]', params: { id } })}
            style={{ marginTop: spacing.md }}
          />
        </View>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.daysBar} contentContainerStyle={styles.daysRow}>
            {days.map((d) => {
              const key = dayKey(d);
              const active = key === day;
              return (
                <Pressable key={key} onPress={() => setDay(key)} style={[styles.dayChip, active && styles.dayChipOn]}>
                  <Text style={[styles.dayWeek, active && styles.onText]}>{weekdayShort(d)}</Text>
                  <Text style={[styles.dayNum, active && styles.onText]}>{dayNumber(d)}</Text>
                  <Text style={[styles.dayMonth, active && styles.onText]}>{monthShort(d)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 90 }]}>
            {pending.length > 0 ? (
              <View style={{ gap: spacing.sm }}>
                <Text style={styles.section}>Solicitudes por responder ({pending.length})</Text>
                {pending.map((a) => (
                  <View key={a.id} style={styles.requestCard}>
                    <Pressable onPress={() => router.push({ pathname: '/appointment/[id]', params: { id: a.id } })}>
                      <Text style={styles.reqWhen}>
                        {formatDay(a.starts_at)}, {formatClock(a.starts_at)}
                      </Text>
                      <Text style={styles.reqMeta}>
                        {a.customer?.name ?? 'Cliente'}
                        {a.service ? ` · ${a.service.name}` : ''} ·{' '}
                        {formatDuration(Math.round((Date.parse(a.ends_at) - Date.parse(a.starts_at)) / 60000))}
                      </Text>
                      {a.expires_at ? <Text style={styles.reqExpiry}>Expira en {formatRemaining(a.expires_at)}</Text> : null}
                    </Pressable>
                    <View style={styles.reqActions}>
                      <Button
                        title="Rechazar"
                        variant="secondary"
                        onPress={() => router.push({ pathname: '/appointment/decline/[id]', params: { id: a.id } })}
                        style={{ flex: 1, minHeight: 44 }}
                      />
                      <Button title="Aceptar" onPress={() => accept.mutate(a.id)} loading={accept.isPending && accept.variables === a.id} style={{ flex: 1, minHeight: 44 }} />
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            <Text style={styles.section}>
              {formatDay(dayStartIso(day))} · {confirmedToday} {confirmedToday === 1 ? 'cita' : 'citas'}
            </Text>
            {agenda.isLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : today.length === 0 ? (
              <View style={styles.freeDay}>
                <Ionicons name="checkmark-circle-outline" size={22} color={colors.success} />
                <Text style={styles.freeDayText}>Día libre. Tus espacios están disponibles para tus clientes.</Text>
              </View>
            ) : (
              today.map((a) =>
                a.kind === 'block' ? (
                  <Pressable key={a.id} onPress={() => askUnblock(a)} style={styles.blockRow} accessibilityRole="button">
                    <Ionicons name="lock-closed-outline" size={18} color={colors.muted} />
                    <Text style={styles.blockText}>
                      Bloqueado · {formatClock(a.starts_at)} – {formatClock(a.ends_at)}
                    </Text>
                    <Text style={styles.blockUndo}>Quitar</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    key={a.id}
                    onPress={() => router.push({ pathname: '/appointment/[id]', params: { id: a.id } })}
                    style={styles.apptRow}
                    accessibilityRole="button"
                  >
                    <View style={[styles.stripe, { backgroundColor: STATUS_COLOR[a.status] }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.apptTime}>
                        {formatClock(a.starts_at)} – {formatClock(a.ends_at)}
                      </Text>
                      <Text style={styles.reqMeta} numberOfLines={1}>
                        {a.customer?.name ?? 'Cliente'}
                        {a.service ? ` · ${a.service.name}` : ''}
                      </Text>
                      {a.out_of_hours ? <Text style={styles.outOfHours}>Fuera de tu horario actual</Text> : null}
                    </View>
                    <Text style={[styles.apptStatus, { color: STATUS_COLOR[a.status] }]}>{STATUS_LABEL[a.status]}</Text>
                  </Pressable>
                ),
              )
            )}
          </ScrollView>

          <View style={[styles.fabWrap, { paddingBottom: insets.bottom + spacing.md }]}>
            <Button title="Bloquear horas" variant="secondary" onPress={() => setBlockOpen(true)} />
          </View>

          <BlockSheet
            visible={blockOpen}
            day={day}
            stepMin={settings.data?.slot_minutes ?? 30}
            onClose={() => setBlockOpen(false)}
            onCreate={async (startIso, minutes) => {
              const endIso = new Date(Date.parse(startIso) + minutes * 60_000).toISOString();
              try {
                await agendaApi.block(id, startIso, endIso, false);
              } catch (error) {
                if (error instanceof Error && error.message === 'overlaps_booking') {
                  Alert.alert('Ya hay una cita ahí', '¿Cancelarla (le avisamos al cliente) y bloquear ese horario?', [
                    { text: 'No', style: 'cancel' },
                    {
                      text: 'Cancelar cita y bloquear',
                      style: 'destructive',
                      onPress: () => {
                        agendaApi
                          .block(id, startIso, endIso, true)
                          .then(reload)
                          .catch((e: Error) => Alert.alert('No se pudo bloquear', e.message));
                      },
                    },
                  ]);
                  return;
                }
                Alert.alert('No se pudo bloquear', error instanceof Error ? error.message : 'Intenta de nuevo');
                return;
              }
              setBlockOpen(false);
              reload();
            }}
          />
        </>
      )}
    </View>
  );
}

function BlockSheet({
  visible,
  day,
  stepMin,
  onClose,
  onCreate,
}: {
  visible: boolean;
  day: string;
  stepMin: number;
  onClose: () => void;
  onCreate: (startIso: string, minutes: number) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const [start, setStart] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(60);
  const [busy, setBusy] = useState(false);
  const options = useMemo(() => timeOptions(day, stepMin), [day, stepMin]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Cerrar" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <View style={styles.handle} />
        <Text style={styles.sheetTitle}>Bloquear horas · {formatDay(dayStartIso(day))}</Text>
        <Text style={styles.sheetSub}>Desde</Text>
        <ScrollView style={{ maxHeight: 190 }}>
          <View style={styles.chips}>
            {options.map((iso) => (
              <Pressable key={iso} onPress={() => setStart(iso)} style={[styles.chip, start === iso && styles.chipOn]}>
                <Text style={[styles.chipText, start === iso && styles.onText]}>{formatClock(iso)}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
        <Text style={styles.sheetSub}>Duración</Text>
        <View style={styles.chips}>
          {BLOCK_DURATIONS.map((m) => (
            <Pressable key={m} onPress={() => setMinutes(m)} style={[styles.chip, minutes === m && styles.chipOn]}>
              <Text style={[styles.chipText, minutes === m && styles.onText]}>{formatDuration(m)}</Text>
            </Pressable>
          ))}
        </View>
        <Button
          title="Bloquear"
          disabled={!start}
          loading={busy}
          onPress={() => {
            if (!start) return;
            setBusy(true);
            void onCreate(start, minutes).finally(() => setBusy(false));
          }}
          style={{ marginTop: spacing.lg }}
        />
      </View>
    </Modal>
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
  headerSub: { fontSize: 12.5, fontFamily: fonts.ui.medium, color: colors.muted },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  emptyTitle: { fontSize: 18, fontFamily: fonts.display.bold, color: colors.ink, textAlign: 'center' },
  emptyText: { fontSize: 14, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center' },
  daysBar: { flexGrow: 0, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line },
  daysRow: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  dayChip: {
    width: 56,
    minHeight: 72,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  dayChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayWeek: { fontSize: 11.5, fontFamily: fonts.ui.semibold, color: colors.muted, textTransform: 'uppercase' },
  dayNum: { fontSize: 18, fontFamily: fonts.ui.extrabold, color: colors.ink },
  dayMonth: { fontSize: 11, fontFamily: fonts.ui.medium, color: colors.muted },
  onText: { color: '#fff' },
  content: { padding: spacing.lg, gap: spacing.sm },
  section: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.muted, marginTop: spacing.sm },
  requestCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.accent,
    padding: spacing.md,
    gap: spacing.md,
  },
  reqWhen: { fontSize: 20, fontFamily: fonts.ui.extrabold, color: colors.ink },
  reqMeta: { fontSize: 13.5, fontFamily: fonts.ui.medium, color: colors.muted },
  reqExpiry: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.accentDark, marginTop: 2 },
  reqActions: { flexDirection: 'row', gap: spacing.sm },
  freeDay: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line },
  freeDayText: { flex: 1, fontSize: 14, fontFamily: fonts.ui.medium, color: colors.muted },
  apptRow: {
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
  stripe: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  apptTime: { fontSize: 16, fontFamily: fonts.ui.extrabold, color: colors.ink },
  apptStatus: { fontSize: 12.5, fontFamily: fonts.ui.bold },
  outOfHours: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.warning },
  blockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.line,
  },
  blockText: { flex: 1, fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.muted },
  blockUndo: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.primary },
  fabWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, backgroundColor: colors.bg },
  backdrop: { flex: 1, backgroundColor: 'rgba(22,35,58,0.45)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: spacing.md },
  sheetTitle: { fontSize: 18, fontFamily: fonts.display.bold, color: colors.ink },
  sheetSub: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.muted, marginTop: spacing.md, marginBottom: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: 42, paddingHorizontal: spacing.md, borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink },
});
