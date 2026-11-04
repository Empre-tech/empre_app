import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { agendaApi, type Appointment } from '@/api/agenda';
import { EmpreSymbol } from '@/components/EmpreSymbol';
import { clockShort, dayEndIso, dayKey, dayStartIso, formatDay, formatRemaining, nextDays } from '@/lib/agendaFormat';
import { initials } from '@/lib/text';
import { colors, fonts, softShadow } from '@/theme';

const STATE = { auto: 'Agent activo', rules: 'Agent activo', manual: 'Agent en pausa' } as const;

/** Lo que Agent resolvió solo: entró confirmada, sin pasar por «por responder» (esas llevan vencimiento). */
const solvedByAgent = (a: Appointment) => a.kind === 'booking' && (a.status === 'confirmed' || a.status === 'completed') && !a.expires_at;

function whyAsks(a: Appointment, now: number): string {
  const reasons = [a.out_of_hours ? 'Es fuera de tu horario.' : null, a.customer_note?.trim() ? `Dice: «${a.customer_note.trim()}».` : null].filter(Boolean);
  return reasons.length ? reasons.join(' ') : a.expires_at ? `Tu agenda pide revisar esta cita. Vence en ${formatRemaining(a.expires_at, now)}.` : 'Tu agenda pide revisar esta cita.';
}

/**
 * Tablero «Agenda con Empre Agent»: lo que resolvió solo hoy y lo poco que espera tu decisión. «Agent» son las reglas de
 * recepción de la agenda: nunca cobra, no cambia precios ni cancela una cita por su cuenta.
 */
export default function AgentInboxScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const qc = useQueryClient();
  const days = useMemo(() => nextDays(30), []);
  const now = Date.now();
  const today = dayKey(new Date());

  const settings = useQuery({ queryKey: ['agenda-settings', id], queryFn: () => agendaApi.settings(id), enabled: Boolean(id) });
  const agenda = useQuery({
    queryKey: ['agenda', id, 'agent'],
    queryFn: () => agendaApi.agenda(id, dayStartIso(today), dayEndIso(dayKey(days[days.length - 1]))),
    enabled: Boolean(id),
    refetchInterval: 30_000,
  });
  const items = useMemo(() => agenda.data ?? [], [agenda.data]);
  const waiting = useMemo(() => items.filter((a) => a.status === 'requested').sort((a, b) => a.starts_at.localeCompare(b.starts_at)), [items]);
  const solved = useMemo(() => items.filter((a) => solvedByAgent(a) && dayKey(new Date(a.created_at)) === today).sort((a, b) => b.created_at.localeCompare(a.created_at)), [items, today]);

  const reload = () => {
    void qc.invalidateQueries({ queryKey: ['agenda', id] });
    void qc.invalidateQueries({ queryKey: ['agenda-summary', id] });
  };
  const accept = useMutation({
    mutationFn: (apptId: string) => agendaApi.accept(apptId),
    onSuccess: reload,
    onError: (e: Error) => {
      Alert.alert('No se pudo aceptar', e.message === 'bad_state' ? 'Esta solicitud ya venció o cambió.' : e.message);
      reload();
    },
  });

  const mode = settings.data?.intake_mode;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.body, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.head}>
          <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} style={styles.back}>
            <Ionicons name="chevron-back" size={20} color={colors.ink} />
          </Pressable>
          <View style={styles.headText}>
            {name ? (
              <Text style={styles.eyebrow} numberOfLines={1}>
                {name.toUpperCase()}
              </Text>
            ) : null}
            <Text style={styles.title} accessibilityRole="header">
              Agenda
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Lo que Empre Agent puede hacer solo"
            onPress={() => router.push({ pathname: '/business/agenda/settings/[id]', params: { id } })}
            style={styles.state}
          >
            <EmpreSymbol product="agent" size={30} />
            {mode ? <Text style={styles.stateText}>{STATE[mode]}</Text> : null}
          </Pressable>
        </View>

        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={[styles.statN, { color: colors.verified }]}>{solved.length}</Text>
            <Text style={styles.statLabel}>resueltas por Agent hoy</Text>
          </View>
          <View style={styles.statLine} />
          <View style={styles.stat}>
            <Text style={[styles.statN, { color: waiting.length ? colors.warning : colors.ink }]}>{waiting.length}</Text>
            <Text style={styles.statLabel}>esperan tu decisión</Text>
          </View>
        </View>

        {waiting.length ? (
          <>
            <Text style={styles.eyebrow}>ESPERA TU DECISIÓN</Text>
            {waiting.map((a) => (
              <View key={a.id} style={styles.req}>
                <View style={styles.reqTop}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials(a.customer?.name ?? 'Cliente')}</Text>
                  </View>
                  <View style={styles.reqBody}>
                    <Text style={styles.reqName}>
                      {a.customer?.name ?? 'Cliente'}
                      {a.service?.name ? <Text style={styles.reqService}> · {a.service.name}</Text> : null}
                    </Text>
                    <Text style={styles.reqMeta}>
                      Pide {formatDay(a.starts_at).toLowerCase()} a las {clockShort(a.starts_at)}
                    </Text>
                  </View>
                </View>
                <View style={styles.why}>
                  <Ionicons name="chatbox-outline" size={16} color={colors.primaryDark} style={styles.whyIcon} />
                  <Text style={styles.whyText}>{whyAsks(a, now)}</Text>
                </View>
                <View style={styles.reqBtns}>
                  <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/appointment/decline/[id]', params: { id: a.id } })} style={styles.btnOff}>
                    <Text style={styles.btnOffText}>Ofrecer otra hora</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" disabled={accept.isPending} onPress={() => accept.mutate(a.id)} style={[styles.btnOn, accept.isPending && { opacity: 0.6 }]}>
                    <Text style={styles.btnOnText}>Aceptar {clockShort(a.starts_at)}</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </>
        ) : agenda.isSuccess ? (
          <View style={styles.none}>
            <Text style={styles.noneTitle}>Nada espera tu decisión</Text>
            <Text style={styles.noneText}>Si algo se sale de tus reglas, Agent te lo trae aquí.</Text>
          </View>
        ) : null}

        {agenda.isError ? (
          <Pressable accessibilityRole="button" onPress={() => void agenda.refetch()} style={styles.none}>
            <Text style={styles.noneTitle}>No pudimos cargar tu agenda</Text>
            <Text style={styles.noneText}>Revisa tu conexión y toca para reintentar.</Text>
          </Pressable>
        ) : null}

        <Text style={styles.eyebrow}>AGENT RESOLVIÓ SOLO · HOY</Text>
        <View style={styles.log}>
          {solved.length ? (
            solved.map((a, i) => (
              <View key={a.id} style={[styles.logRow, i < solved.length - 1 && styles.logLine]}>
                <View style={styles.logIcon}>
                  <Ionicons name="checkmark" size={16} color={colors.verified} />
                </View>
                <View style={styles.reqBody}>
                  <Text style={styles.logTitle} numberOfLines={1}>
                    Confirmó a {a.customer?.name ?? 'un cliente'}
                  </Text>
                  <Text style={styles.logSub} numberOfLines={1}>
                    {[a.service?.name, `${formatDay(a.starts_at)} ${clockShort(a.starts_at)}`].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <View style={styles.by}>
                  <Text style={styles.byText}>Agent</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.logEmpty}>{mode === 'manual' ? 'Agent está en pausa: hoy respondes tú todas las solicitudes.' : 'Hoy todavía no ha entrado ninguna cita.'}</Text>
          )}
        </View>
        <Text style={styles.foot}>Agent nunca cobra, no cambia tus precios y no cancela una cita por su cuenta.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: 16, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, shadowColor: colors.ink, shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  headText: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 11, letterSpacing: 1.1, fontFamily: fonts.ui.extrabold, color: colors.faint },
  title: { fontSize: 24, lineHeight: 29, fontFamily: fonts.display.bold, color: colors.ink },
  state: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 6, paddingRight: 12, borderRadius: 20, backgroundColor: colors.surface, shadowColor: colors.ink, shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  stateText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  stats: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 20, backgroundColor: colors.surface, ...softShadow },
  stat: { flex: 1, gap: 2 },
  statN: { fontSize: 26, lineHeight: 31, fontFamily: fonts.display.bold },
  statLabel: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  statLine: { width: 1, backgroundColor: colors.selectedSoft },
  req: { padding: 14, gap: 10, borderRadius: 20, borderWidth: 2, borderColor: colors.warning, backgroundColor: colors.surface },
  reqTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selectedSoft },
  avatarText: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  reqBody: { flex: 1, minWidth: 0, gap: 1 },
  reqName: { fontSize: 17, lineHeight: 21, fontFamily: fonts.display.bold, color: colors.ink },
  reqService: { fontSize: 13.5, fontFamily: fonts.ui.bold, color: colors.muted },
  reqMeta: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.accentInk },
  why: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.bg },
  whyIcon: { marginTop: 2 },
  whyText: { flex: 1, fontSize: 13.5, lineHeight: 19, fontFamily: fonts.ui.medium, color: colors.ink },
  reqBtns: { flexDirection: 'row', gap: 8 },
  btnOff: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  btnOffText: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  btnOn: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.primary },
  btnOnText: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: '#fff' },
  none: { padding: 14, gap: 2, borderRadius: 20, backgroundColor: colors.surface, ...softShadow },
  noneTitle: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  noneText: { fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.muted },
  log: { paddingVertical: 4, paddingHorizontal: 14, borderRadius: 20, backgroundColor: colors.surface, ...softShadow },
  logRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  logLine: { borderBottomWidth: 1, borderBottomColor: colors.selectedSoft },
  logIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.verifiedSoft },
  logTitle: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  logSub: { fontSize: 12.5, fontFamily: fonts.ui.medium, color: colors.faint },
  by: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.verifiedSoft },
  byText: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.verified },
  logEmpty: { paddingVertical: 12, fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.muted },
  foot: { fontSize: 12, lineHeight: 17, fontFamily: fonts.ui.medium, color: colors.faint },
});
