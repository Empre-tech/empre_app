import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { notifyError } from '@/components/Notice';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { agendaApi, type Appointment, type AppointmentService } from '@/api/agenda';
import { entitiesApi } from '@/api/endpoints';
import { Button } from '@/components/Button';
import { EmpreSymbol } from '@/components/EmpreSymbol';
import {
  dayKey,
  dayNumber,
  formatClock,
  formatDay,
  formatDuration,
  formatRemaining,
  nextDays,
  STATUS_COLOR,
  STATUS_LABEL,
  weekdayShort,
  clockShort,
  dayEndIso,
  dayStartIso,
} from '@/lib/agendaFormat';
import { FEATURES } from '@/config';
import { newClientId } from '@/lib/ledger';
import { useNow } from '@/lib/useNow';
import { queueTabOpen } from '@/ledger/ledgerStore';
import { colors, fonts, radius, spacing } from '@/theme';

const DAYS_AHEAD = 14;
const BLOCK_DURATIONS = [30, 60, 120, 180, 240];

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
  const [blockStart, setBlockStart] = useState<string | null>(null);
  const [sheetInitialMode, setSheetInitialMode] = useState<'add' | 'block'>('block');
  const [reqsOpen, setReqsOpen] = useState(false);
  const now = useNow(60_000);

  const entity = useQuery({ queryKey: ['entity', id], queryFn: () => entitiesApi.get(id), enabled: Boolean(id) }).data;
  const settings = useQuery({ queryKey: ['agenda-settings', id], queryFn: () => agendaApi.settings(id), enabled: Boolean(id) });
  const servicesQuery = useQuery({ queryKey: ['agenda-services', id], queryFn: () => agendaApi.services(id), enabled: Boolean(id) && settings.data?.enabled === true });
  const agenda = useQuery({
    queryKey: ['agenda', id, 'range'],
    queryFn: () => agendaApi.agenda(id, dayStartIso(dayKey(days[0])), dayEndIso(dayKey(days[days.length - 1]))),
    enabled: Boolean(id) && settings.data?.enabled === true,
    refetchInterval: 30_000,
  });

  const items = agenda.data ?? [];
  const pending = items.filter((a) => a.status === 'requested').sort((a, b) => Date.parse(a.expires_at ?? a.starts_at) - Date.parse(b.expires_at ?? b.starts_at));
  const today = items.filter((a) => a.status !== 'requested' && dayKey(new Date(a.starts_at)) === day);
  const confirmedToday = today.filter((a) => a.status === 'confirmed').length;
  const slots = useQuery({ queryKey: ['agenda', id, 'slots', day], queryFn: () => agendaApi.availability(id, day), enabled: Boolean(id) && settings.data?.enabled === true, staleTime: 30_000 });
  const askedToday = pending.filter((a) => dayKey(new Date(a.starts_at)) === day);
  // Una hora pedida no se ofrece como libre: se respeta a quien la pidió.
  const freeSlots = (slots.data ?? []).filter((iso) => !askedToday.some((a) => Date.parse(a.starts_at) === Date.parse(iso)));
  const rows = [
    ...today.map((a) => ({ at: a.starts_at, key: a.id, kind: a.kind === 'block' ? ('block' as const) : ('appt' as const), a })),
    ...askedToday.map((a) => ({ at: a.starts_at, key: `q${a.id}`, kind: 'asked' as const, a })),
    ...freeSlots.map((iso) => ({ at: iso, key: `f${iso}`, kind: 'free' as const, a: null })),
  ].sort((x, y) => Date.parse(x.at) - Date.parse(y.at));
  const countsByDay = (key: string) => {
    const of = items.filter((a) => dayKey(new Date(a.starts_at)) === key);
    return { appts: of.some((a) => a.status === 'confirmed' || a.status === 'completed'), reqs: of.some((a) => a.status === 'requested') };
  };
  const pendingSub = days
    .map((d) => {
      const n = pending.filter((a) => dayKey(new Date(a.starts_at)) === dayKey(d)).length;
      return n ? `${formatDay(dayStartIso(dayKey(d))).toLowerCase()} ${n}` : null;
    })
    .filter(Boolean)
    .join(' · ');
  // Dos personas piden la misma hora o choca con una cita: se ve antes de responder.
  const clashOf = (a: Appointment) => {
    const start = Date.parse(a.starts_at);
    const end = Date.parse(a.ends_at);
    const other = items.find((b) => b.id !== a.id && b.kind !== 'block' && (b.status === 'requested' || b.status === 'confirmed') && Date.parse(b.starts_at) < end && Date.parse(b.ends_at) > start);
    if (!other) return null;
    return other.status === 'confirmed' ? `Choca con la cita de ${other.customer?.name ?? 'otro cliente'}` : `${other.customer?.name ?? 'Otra persona'} también pidió esta hora`;
  };
  const attend = (a: Appointment) => {
    // La cuenta arranca con el servicio reservado; lo que compre se suma y, al cobrar, la cita queda atendida.
    const tabId = newClientId();
    queueTabOpen(id ?? '', { id: tabId, name: a.customer?.name ?? 'Cliente', appointment_id: a.id });
    router.push({ pathname: '/business/ledger/tab', params: { entityId: id ?? '', tabId } });
  };

  const reload = () => {
    void queryClient.invalidateQueries({ queryKey: ['agenda', id] });
    void queryClient.invalidateQueries({ queryKey: ['agenda-summary', id] });
  };
  const accept = useMutation({
    mutationFn: (apptId: string) => agendaApi.accept(apptId),
    onSuccess: reload,
    onError: (e: Error) => {
      notifyError('No se pudo aceptar', e.message === 'bad_state' ? 'Esta solicitud ya venció o cambió.' : e.message);
      reload();
    },
  });
  const unblock = useMutation({ mutationFn: (blockId: string) => agendaApi.unblock(id, blockId), onSuccess: reload });
  const noShow = useMutation({
    mutationFn: (apptId: string) => agendaApi.outcome(apptId, false),
    onSuccess: reload,
    onError: (e: Error) => notifyError('No se pudo anotar', e.message === 'bad_state' ? 'Esta cita ya cambió.' : e.message),
  });

  const askUnblock = (a: Appointment) =>
    Alert.alert('¿Quitar este bloqueo?', `${formatClock(a.starts_at)} – ${formatClock(a.ends_at)}`, [
      { text: 'No', style: 'cancel' },
      { text: 'Quitar', onPress: () => unblock.mutate(a.id) },
    ]);

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Volver" style={styles.back}>
          <Ionicons name="chevron-back" size={20} color={colors.ink} />
        </Pressable>
        <EmpreSymbol product="agent" size={32} />
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
          style={styles.iconBtn}
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
          <EmpreSymbol product="agent" size={56} />
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
              const marks = countsByDay(key);
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${formatDay(dayStartIso(key))}${marks.appts ? ', con citas' : ''}${marks.reqs ? ', con solicitudes por responder' : ''}`}
                  onPress={() => setDay(key)}
                  style={[styles.dayChip, active && styles.dayChipOn]}
                >
                  <Text style={[styles.dayWeek, active && styles.onText]}>{weekdayShort(d)}</Text>
                  <Text style={[styles.dayNum, active && styles.onText]}>{dayNumber(d)}</Text>
                  <View style={styles.dayDots}>
                    {marks.appts ? <View style={[styles.dayDot, { backgroundColor: active ? '#fff' : colors.ink }]} /> : null}
                    {marks.reqs ? <View style={[styles.dayDot, { backgroundColor: colors.warning }]} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 90 }]}>
            {pending.length > 0 ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`${pending.length} por responder: ${pendingSub}. Ver`} onPress={() => setReqsOpen(true)} style={({ pressed }) => [styles.pendingBar, pressed && { opacity: 0.85 }]}>
                <View style={styles.pendingCount}>
                  <Text style={styles.pendingCountText}>{pending.length}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pendingTitle}>Por responder</Text>
                  <Text style={styles.pendingSub} numberOfLines={1}>
                    {pendingSub}
                  </Text>
                </View>
                <Text style={styles.pendingSee}>Ver ›</Text>
              </Pressable>
            ) : null}

            <View style={styles.dayHead}>
              <Text style={styles.dayTitle}>{formatDay(dayStartIso(day))}</Text>
              <Text style={styles.dayCount}>
                {confirmedToday} {confirmedToday === 1 ? 'cita' : 'citas'}
              </Text>
            </View>
            {agenda.isLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : rows.length === 0 ? (
              <View style={styles.freeDay}>
                <Ionicons name="checkmark-circle-outline" size={22} color={colors.success} />
                <Text style={styles.freeDayText}>Día libre. Tus clientes ven tus espacios y te pueden pedir cita.</Text>
              </View>
            ) : (
              rows.map((r) => (
                <View key={r.key} style={styles.lineRow}>
                  <Text style={styles.lineTime}>{clockShort(r.at)}</Text>
                  <View style={{ flex: 1 }}>
                    {r.kind === 'free' ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Libre a las ${formatClock(r.at)}. Agregar cita o bloquear esta hora`}
                        onPress={() => {
                          setBlockStart(r.at);
                          setSheetInitialMode('add');
                          setBlockOpen(true);
                        }}
                        style={styles.freeRow}
                      >
                        <Text style={styles.freeText}>Libre · toca para agregar o bloquear</Text>
                      </Pressable>
                    ) : r.kind === 'block' ? (
                      <Pressable onPress={() => askUnblock(r.a)} style={styles.blockRow} accessibilityRole="button">
                        <Text style={styles.blockText}>Bloqueado hasta {clockShort(r.a.ends_at)}</Text>
                        <Text style={styles.blockUndo}>Quitar</Text>
                      </Pressable>
                    ) : r.kind === 'asked' ? (
                      <Pressable accessibilityRole="button" onPress={() => setReqsOpen(true)} style={styles.askedRow}>
                        <Text style={styles.askedTitle}>Pedida por {r.a.customer?.name ?? 'un cliente'}</Text>
                        <Text style={styles.askedSub}>Por responder · toca para verla</Text>
                      </Pressable>
                    ) : (
                      <View style={styles.apptRow}>
                        <View style={[styles.apptBar, { backgroundColor: r.a.status === 'completed' ? '#14B8B0' : colors.line }]} />
                        <Pressable accessibilityRole="button" style={styles.apptMain} onPress={() => router.push({ pathname: '/appointment/[id]', params: { id: r.a.id } })}>
                          <Text style={styles.apptTime} numberOfLines={1}>
                            {r.a.customer?.name ?? r.a.customer_note ?? 'Cliente'}
                          </Text>
                          <Text style={styles.apptSub} numberOfLines={2}>
                            {[r.a.service?.name, formatDuration(Math.round((Date.parse(r.a.ends_at) - Date.parse(r.a.starts_at)) / 60000))].filter(Boolean).join(' · ')}
                          </Text>
                          <Text style={[styles.apptStatus, { color: STATUS_COLOR[r.a.status] }]}>{STATUS_LABEL[r.a.status]}</Text>
                          {r.a.out_of_hours ? <Text style={styles.outOfHours}>Fuera de tu horario actual</Text> : null}
                        </Pressable>
                        {r.a.status === 'confirmed' ? (
                          <View style={styles.apptActions}>
                            {FEATURES.ledger ? (
                              <Pressable accessibilityRole="button" accessibilityLabel={`Llegó ${r.a.customer?.name ?? 'el cliente'}: abrir su cuenta`} onPress={() => attend(r.a)} style={styles.attend}>
                                <Text style={styles.attendText}>Llegó</Text>
                              </Pressable>
                            ) : null}
                            {Date.parse(r.a.ends_at) < now ? (
                              <Pressable accessibilityRole="button" accessibilityLabel={`${r.a.customer?.name ?? 'El cliente'} no vino`} onPress={() => noShow.mutate(r.a.id)} style={styles.altBtn}>
                                <Text style={styles.altText}>No vino</Text>
                              </Pressable>
                            ) : null}
                          </View>
                        ) : null}
                      </View>
                    )}
                  </View>
                </View>
              ))
            )}
          </ScrollView>

          <Modal visible={reqsOpen} transparent animationType="slide" onRequestClose={() => setReqsOpen(false)}>
            <Pressable style={styles.backdrop} onPress={() => setReqsOpen(false)} accessibilityLabel="Cerrar" />
            <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
              <View style={styles.handle} />
              <Text style={styles.sheetTitle}>Por responder</Text>
              <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ gap: spacing.sm }}>
                {[...pending].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)).map((a) => {
                  const clash = clashOf(a);
                  return (
                    <View key={a.id} style={styles.requestCard}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          setReqsOpen(false);
                          router.push({ pathname: '/appointment/[id]', params: { id: a.id } });
                        }}
                      >
                        <Text style={styles.reqWhen}>{a.customer?.name ?? 'Cliente'}</Text>
                        <Text style={styles.reqMeta}>
                          {formatDay(a.starts_at)}, {formatClock(a.starts_at)}
                          {a.service ? ` · ${a.service.name}` : ''} · {formatDuration(Math.round((Date.parse(a.ends_at) - Date.parse(a.starts_at)) / 60000))}
                        </Text>
                        {a.expires_at ? <Text style={styles.reqExpiry}>Expira en {formatRemaining(a.expires_at)}</Text> : null}
                        {clash ? <Text style={styles.outOfHours}>{clash}</Text> : null}
                      </Pressable>
                      <View style={styles.reqActions}>
                        <Button
                          title="Rechazar o proponer"
                          variant="secondary"
                          onPress={() => {
                            setReqsOpen(false);
                            router.push({ pathname: '/appointment/decline/[id]', params: { id: a.id } });
                          }}
                          style={{ flex: 1, minHeight: 44 }}
                        />
                        <Button title="Aceptar" onPress={() => accept.mutate(a.id)} loading={accept.isPending && accept.variables === a.id} style={{ flex: 1, minHeight: 44 }} />
                      </View>
                    </View>
                  );
                })}
                {pending.length === 0 ? <Text style={styles.freeDayText}>Respondiste todo. Le avisamos a cada cliente.</Text> : null}
              </ScrollView>
            </View>
          </Modal>

          <View style={[styles.fabWrap, { paddingBottom: insets.bottom + spacing.md }]}>
            <Button
              title="Bloquear horas"
              variant="secondary"
              onPress={() => {
                setBlockStart(null);
                setSheetInitialMode('block');
                setBlockOpen(true);
              }}
            />
          </View>

          <SlotActionSheet
            key={`${blockStart ?? day}-${sheetInitialMode}`}
            visible={blockOpen}
            day={day}
            initialStart={blockStart}
            initialMode={sheetInitialMode}
            stepMin={settings.data?.slot_minutes ?? 30}
            services={(servicesQuery.data ?? []).filter((s) => s.active)}
            onClose={() => setBlockOpen(false)}
            onAddAppointment={async (startIso, serviceId, customerName) => {
              try {
                await agendaApi.addOwnerAppointment(id, { starts_at: startIso, service_id: serviceId, customer_name: customerName.trim() });
                setBlockOpen(false);
                reload();
              } catch (error) {
                notifyError('No se pudo agendar', error instanceof Error ? error.message : 'Intenta de nuevo');
              }
            }}
            onCreateBlock={async (startIso, minutes) => {
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
                          .catch((e: Error) => notifyError('No se pudo bloquear', e.message));
                      },
                    },
                  ]);
                  return;
                }
                notifyError('No se pudo bloquear', error instanceof Error ? error.message : 'Intenta de nuevo');
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

function SlotActionSheet({
  visible,
  day,
  initialStart,
  initialMode,
  stepMin,
  services,
  onClose,
  onAddAppointment,
  onCreateBlock,
}: {
  visible: boolean;
  day: string;
  initialStart: string | null;
  initialMode: 'add' | 'block';
  stepMin: number;
  services: AppointmentService[];
  onClose: () => void;
  onAddAppointment: (startIso: string, serviceId: string | undefined, customerName: string) => Promise<void>;
  onCreateBlock: (startIso: string, minutes: number) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'add' | 'block'>(initialMode);
  const [start, setStart] = useState<string | null>(initialStart);
  const [minutes, setMinutes] = useState(60);
  const [serviceId, setServiceId] = useState<string | undefined>(services[0]?.id);
  const [customerName, setCustomerName] = useState('');
  const [busy, setBusy] = useState(false);
  const options = useMemo(() => timeOptions(day, stepMin), [day, stepMin]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Cerrar" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <View style={styles.handle} />
          <View style={styles.segment} accessibilityRole="tablist">
            {(['add', 'block'] as const).map((m) => {
              const on = mode === m;
              return (
                <Pressable key={m} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setMode(m)} style={[styles.segmentItem, on && styles.segmentOn]}>
                  <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{m === 'add' ? 'Agregar cita' : 'Bloquear horas'}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.sheetTitle}>
            {mode === 'add' ? 'Anótale una cita a un cliente' : 'Bloquear horas'} · {formatDay(dayStartIso(day))}
          </Text>
          <Text style={styles.sheetSub}>Hora</Text>
          <ScrollView style={{ maxHeight: 150 }}>
            <View style={styles.chips}>
              {options.map((iso) => (
                <Pressable key={iso} onPress={() => setStart(iso)} style={[styles.chip, start === iso && styles.chipOn]}>
                  <Text style={[styles.chipText, start === iso && styles.onText]}>{formatClock(iso)}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          {mode === 'add' ? (
            <>
              {services.length > 0 ? (
                <>
                  <Text style={styles.sheetSub}>Servicio</Text>
                  <View style={styles.chips}>
                    {services.map((s) => (
                      <Pressable key={s.id} onPress={() => setServiceId(s.id)} style={[styles.chip, serviceId === s.id && styles.chipOn]}>
                        <Text style={[styles.chipText, serviceId === s.id && styles.onText]}>{s.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}
              <Text style={styles.sheetSub}>¿Para quién es?</Text>
              <TextInput
                value={customerName}
                onChangeText={setCustomerName}
                placeholder="Nombre del cliente (ej. Andrés)"
                placeholderTextColor={colors.muted}
                accessibilityLabel="Nombre del cliente"
                style={styles.input}
              />
              <Button
                title="Guardar cita"
                disabled={!start || !customerName.trim()}
                loading={busy}
                onPress={() => {
                  if (!start || !customerName.trim()) return;
                  setBusy(true);
                  void onAddAppointment(start, serviceId, customerName).finally(() => setBusy(false));
                }}
                style={{ marginTop: spacing.md }}
              />
            </>
          ) : (
            <>
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
                  void onCreateBlock(start, minutes).finally(() => setBusy(false));
                }}
                style={{ marginTop: spacing.lg }}
              />
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dayDots: { flexDirection: 'row', gap: 3, height: 6, marginTop: 3 },
  dayDot: { width: 6, height: 6, borderRadius: 3 },
  pendingBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.accentSoft },
  pendingCount: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.warning },
  pendingCountText: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: '#fff' },
  pendingTitle: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.accentInk },
  lineRow: { flexDirection: 'row', gap: spacing.sm },
  lineTime: { width: 66, paddingTop: 12, fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  freeRow: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line },
  freeText: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.faint },
  askedRow: { minHeight: 48, justifyContent: 'center', gap: 1, paddingVertical: 6, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.warning, backgroundColor: colors.accentSoft },
  askedTitle: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.accentInk },
  apptHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  apptActions: { alignItems: 'center', gap: 6 },
  altBtn: { minHeight: 36, justifyContent: 'center' },
  altText: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  attend: { minHeight: 44, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  attendText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 6, backgroundColor: colors.bg },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, shadowColor: colors.ink, shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  iconBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, lineHeight: 24, fontFamily: fonts.display.bold, color: colors.ink },
  headerSub: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.faint },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  emptyTitle: { fontSize: 18, fontFamily: fonts.display.bold, color: colors.ink, textAlign: 'center' },
  emptyText: { fontSize: 14, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center' },
  daysBar: { flexGrow: 0 },
  daysRow: { flexDirection: 'row', gap: 8, paddingTop: 6, paddingHorizontal: 16, paddingBottom: 10 },
  dayChip: { width: 52, minHeight: 70, gap: 2, borderRadius: 16, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  dayChipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  dayWeek: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.ink },
  dayNum: { fontSize: 18, fontFamily: fonts.ui.extrabold, color: colors.ink },

  onText: { color: '#fff' },
  content: { paddingTop: 0, paddingHorizontal: 16, gap: 10 },
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
  reqExpiry: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.accentInk, marginTop: 2 },
  reqActions: { flexDirection: 'row', gap: spacing.sm },
  freeDay: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line },
  freeDayText: { flex: 1, fontSize: 14, fontFamily: fonts.ui.medium, color: colors.muted },
  apptRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingLeft: 14, paddingRight: 12, borderRadius: 16, backgroundColor: colors.surface, shadowColor: colors.ink, shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  apptBar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  apptMain: { flex: 1, minWidth: 0, gap: 2 },
  apptSub: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.ui.medium, color: colors.faint },
  askedSub: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.muted },
  dayHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, paddingTop: 4 },
  dayTitle: { fontSize: 16, fontFamily: fonts.ui.extrabold, color: colors.ink },
  dayCount: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.faint },
  pendingSub: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.accentInk },
  pendingSee: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.accentInk },
  apptTime: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  apptStatus: { fontSize: 12.5, fontFamily: fonts.ui.extrabold },
  outOfHours: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.warning },
  blockRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.selectedSoft },
  blockText: { flex: 1, fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.muted },
  blockUndo: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.primary },
  fabWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, backgroundColor: colors.bg },
  backdrop: { flex: 1, backgroundColor: 'rgba(22,35,58,0.45)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: spacing.md },
  segment: { flexDirection: 'row', padding: 4, marginBottom: spacing.sm, borderRadius: radius.md, backgroundColor: colors.selectedSoft },
  segmentItem: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  segmentOn: { backgroundColor: colors.surface },
  segmentText: { fontSize: 13.5, fontFamily: fonts.ui.bold, color: colors.muted },
  segmentTextOn: { fontFamily: fonts.ui.extrabold, color: colors.ink },
  sheetTitle: { fontSize: 18, fontFamily: fonts.display.bold, color: colors.ink },
  sheetSub: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.muted, marginTop: spacing.md, marginBottom: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: 44, paddingHorizontal: spacing.md, borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: colors.selectedSoft, borderColor: colors.selected },
  chipText: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink },
  input: {
    minHeight: 46,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    fontSize: 15,
    fontFamily: fonts.ui.semibold,
    color: colors.ink,
  },
});
