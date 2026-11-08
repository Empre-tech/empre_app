import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { agendaApi, type Appointment, type AppointmentService } from '@/api/agenda';
import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { EmpreSymbol } from '@/components/EmpreSymbol';
import { clockShort, dayKey, formatDay, nextDays } from '@/lib/agendaFormat';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts, radius } from '@/theme';

type Msg = { id: number; from: 'agent' | 'you'; text: string };
type Step = 'start' | 'hi' | 'svc' | 'looking' | 'times' | 'confirm' | 'sending' | 'done' | 'none';
type Reply = { label: string; run: () => void };

const when = (iso: string) => `${formatDay(iso).toLowerCase()} a las ${clockShort(iso)}`;
const chip = (iso: string) => `${formatDay(iso)} ${clockShort(iso)}`;
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * Tablero «Pedir cita con Empre Agent»: la conversación con el negocio, sin llamar. Sale de plantillas sobre datos
 * reales (sin IA, no cuesta por mensaje): solo ofrece servicios y horas libres de la agenda y aparta con la misma
 * llamada que la hoja de reserva.
 */
export default function AgentBookingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const biz = name || 'el negocio';
  const { user } = useAuth();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [step, setStep] = useState<Step>('start');
  const [service, setService] = useState<AppointmentService | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [slot, setSlot] = useState<string | null>(null);
  const [booked, setBooked] = useState<Appointment | null>(null);
  const [draft, setDraft] = useState('');
  const [noteText, setNoteText] = useState<string | undefined>(undefined);
  const seq = useRef(0);
  const idem = useRef(`agent-${id}-${Date.now()}`);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scroll = useRef<ScrollView>(null);

  const summary = useQuery({ queryKey: ['agenda-summary', id], queryFn: () => agendaApi.summary(id), enabled: Boolean(id), staleTime: 20_000 });
  const mine = useQuery({ queryKey: ['appointments'], queryFn: agendaApi.mine, staleTime: 60_000 });
  const services = useMemo(() => summary.data?.services.filter((s) => s.active) ?? [], [summary.data]);
  const usual = useMemo(() => {
    const last = [...(mine.data ?? [])].filter((a) => a.entity_id === id && a.status === 'completed' && a.service_id).sort((a, b) => b.starts_at.localeCompare(a.starts_at))[0];
    return last ? services.find((s) => s.id === last.service_id) ?? null : null;
  }, [mine.data, services, id]);

  const say = (you: string | null, agent: string, next: Step) => {
    setMsgs((m) => (you ? [...m, { id: ++seq.current, from: 'you', text: you }] : m));
    setStep('looking');
    setTyping(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(
      () => {
        setMsgs((m) => [...m, { id: ++seq.current, from: 'agent', text: agent }]);
        setTyping(false);
        setStep(next);
      },
      reduce ? 0 : 600,
    );
  };

  const offerTimes = async (you: string, s: AppointmentService | null) => {
    setService(s);
    setMsgs((m) => [...m, { id: ++seq.current, from: 'you', text: you }]);
    setStep('looking');
    setTyping(true);
    try {
      const days = nextDays(Math.min(summary.data?.horizon_days ?? 7, 7));
      const found: string[] = [];
      for (const d of days) {
        if (found.length >= 3) break;
        const free = await agendaApi.availability(id, dayKey(d), s?.id);
        found.push(...free.slice(0, 3 - found.length));
      }
      setSlots(found);
      if (!found.length) say(null, `${biz} no tiene horas libres en los próximos días. Vuelve a mirar más tarde o escríbele por Mensajes.`, 'none');
      else say(null, `Tiene libre ${found.map(when).join(', ').replace(/, ([^,]*)$/, ' y $1')}. ¿Cuál te sirve?`, 'times');
    } catch {
      say(null, 'No pude ver las horas libres. Tu cita todavía no está apartada. Revisa tu conexión e inténtalo de nuevo.', service || s ? 'svc' : 'hi');
    }
  };

  const pick = (iso: string) => {
    setSlot(iso);
    say(chip(iso), `Listo para confirmar: ${service ? lower(service.name) : 'tu cita'}, ${when(iso)}. Se paga allá. ¿Te la aparto?`, 'confirm');
  };

  const book = async () => {
    if (!slot) return;
    setMsgs((m) => [...m, { id: ++seq.current, from: 'you', text: 'Sí, apártala' }]);
    setStep('sending');
    setTyping(true);
    try {
      const a = await agendaApi.book({ entity_id: id, service_id: service?.id, starts_at: slot, note: noteText }, idem.current);
      setBooked(a);
      void mine.refetch();
      void summary.refetch();
      say(null, a.status === 'confirmed' ? `Hecho. Te esperan ${when(slot)}. Te aviso antes de la cita.` : `Le pasé tu solicitud a ${biz}. Te aviso apenas responda; la hora queda apartada mientras tanto.`, 'done');
    } catch (e) {
      const code = e instanceof ApiError ? e.message : '';
      idem.current = `agent-${id}-${Date.now()}`;
      if (code === 'slot_taken') {
        void offerTimes('Otra hora', service);
      } else if (code === 'too_many_pending') {
        say(null, 'Ya tienes 3 solicitudes pendientes. Espera a que te respondan antes de pedir otra.', 'none');
      } else if (code === 'customer_busy') {
        void offerTimes('Ya tengo una cita a esa hora', service);
      } else if (code === 'entity_hidden') {
        say(null, `${biz} no está recibiendo citas nuevas por ahora.`, 'none');
      } else {
        say(null, 'Tu cita no se apartó y nada se cobró. Revisa tu conexión e inténtalo de nuevo.', 'confirm');
      }
    }
  };

  const sendFreeText = () => {
    const clean = draft.trim();
    if (!clean || typing) return;
    setDraft('');
    const normalized = clean.toLowerCase();
    // Si escribió el nombre de un servicio disponible, lo elegimos directamente
    const matchedService = services.find((s) => normalized.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(normalized));
    if ((step === 'svc' || step === 'hi') && matchedService) {
      void offerTimes(clean, matchedService);
      return;
    }
    // Solo un sí claro y sin más aparta la cita: «si me das mejor mañana» o «sin barba» no.
    if (step === 'confirm' && /^(s[ií]|claro|ap[aá]rtala|s[ií],? ap[aá]rtala|dale|listo)[.!]*$/i.test(normalized)) {
      void book();
      return;
    }
    // Guardamos el mensaje como nota para el negocio y seguimos el paso actual
    setNoteText(clean);
    say(
      clean,
      step === 'times'
        ? `Anoté tu comentario para ${biz}. Elige cuál de las horas disponibles te sirve para apartarla:`
        : step === 'confirm'
          ? `Le dejé esa nota a ${biz}. ¿Confirmamos la cita para ${slot ? when(slot) : 'esa hora'}?`
          : `Le paso ese detalle a ${biz}. Elige una opción abajo para ver las horas libres:`,
      step,
    );
  };

  // El saludo: lo de siempre si ya viniste; si no, qué se te ofrece.
  const first = user?.name?.trim().split(/\s+/)[0];
  useEffect(() => {
    if (step !== 'start' || !summary.data || mine.isLoading) return;
    if (!summary.data.enabled) say(null, `${biz} no recibe citas por Empre por ahora. Puedes escribirle por Mensajes.`, 'none');
    else if (usual) say(null, `Hola${first ? `, ${first}` : ''}. Respondo por ${biz}. ¿Lo de siempre, ${lower(usual.name)}?`, 'hi');
    else if (services.length) say(null, `Hola${first ? `, ${first}` : ''}. Respondo por ${biz}. ¿Qué necesitas?`, 'svc');
    else {
      setStep('looking');
      void offerTimes('Quiero una cita', null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, summary.data, mine.isLoading, usual, services.length]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const replies: Reply[] =
    step === 'hi' && usual
      ? [
          { label: 'Sí, lo de siempre', run: () => void offerTimes('Sí, lo de siempre', usual) },
          { label: 'Otra cosa', run: () => say('Otra cosa', '¿Qué necesitas?', 'svc') },
        ]
      : step === 'svc'
        ? services.map((s) => ({ label: s.name, run: () => void offerTimes(s.name, s) }))
        : step === 'times'
          ? slots.map((s) => ({ label: chip(s), run: () => pick(s) }))
          : step === 'confirm'
            ? [
                { label: 'Sí, apártala', run: () => void book() },
                { label: 'Otra hora', run: () => void offerTimes('Mejor otra hora', service) },
              ]
            : [];

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={20} color={colors.ink} />
        </Pressable>
        <EmpreSymbol product="agent" size={32} />
        <View style={styles.headText}>
          <Text style={styles.headTitle} numberOfLines={1} accessibilityRole="header">
            Pedir cita · {biz}
          </Text>
          <Text style={styles.headSub}>Empre Agent responde por el negocio</Text>
        </View>
      </View>

      <ScrollView ref={scroll} style={styles.msgs} contentContainerStyle={styles.msgsIn} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: !reduce })} keyboardShouldPersistTaps="handled">
        {summary.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
        {summary.isError ? (
          <View accessibilityLiveRegion="polite" style={[styles.bub, styles.bubAgent]}>
            <Text style={styles.bubText}>No pude abrir la agenda de {biz}. Revisa tu conexión e inténtalo de nuevo.</Text>
          </View>
        ) : null}
        {msgs.map((m) => (
          <View key={m.id} accessibilityLiveRegion={m.from === 'agent' ? 'polite' : undefined} style={[styles.bub, m.from === 'agent' ? styles.bubAgent : styles.bubYou]}>
            <Text style={[styles.bubText, m.from === 'you' && styles.bubTextYou]}>{m.text}</Text>
          </View>
        ))}
        {typing ? (
          <View style={[styles.bub, styles.bubAgent]} accessibilityLabel="Agent está escribiendo">
            <Text style={styles.dots}>•••</Text>
          </View>
        ) : null}
        {booked && slot ? (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <View style={[styles.cardIcon, { backgroundColor: booked.status === 'confirmed' ? colors.verifiedSoft : colors.selectedSoft }]}>
                <Ionicons name="calendar-outline" size={22} color={booked.status === 'confirmed' ? colors.verified : colors.ink} />
              </View>
              <View style={styles.cardBody}>
                <Text style={[styles.cardEye, { color: booked.status === 'confirmed' ? colors.verified : colors.muted }]}>
                  {booked.status === 'confirmed' ? 'CONFIRMADA' : 'ESPERA RESPUESTA'} · {chip(slot).toUpperCase()}
                </Text>
                <Text style={styles.cardName}>{service?.name ?? 'Cita'}</Text>
                <Text style={styles.cardSub}>{biz}</Text>
              </View>
            </View>
            <Pressable accessibilityRole="link" onPress={() => router.push('/salidas')} style={styles.cardLink}>
              <Text style={styles.cardLinkText}>Ver en Mis salidas</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      {step !== 'done' && step !== 'none' ? (
        <View style={[styles.footContainer, { paddingBottom: insets.bottom + 12 }]}>
          {replies.length ? (
            <View style={styles.footReplies}>
              {replies.map((r, i) => {
                const main = step === 'confirm' && i === 0;
                return (
                  <Pressable key={r.label} accessibilityRole="button" onPress={r.run} style={[styles.reply, main && styles.replyMain]}>
                    <Text style={[styles.replyText, main && styles.replyTextMain]}>{r.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <View style={styles.composeRow}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Escribe o toca una opción…"
              placeholderTextColor={colors.muted}
              accessibilityLabel="Mensaje para Empre Agent"
              onSubmitEditing={sendFreeText}
              returnKeyType="send"
              style={styles.composeInput}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Enviar mensaje"
              disabled={!draft.trim() || typing}
              onPress={sendFreeText}
              style={[styles.sendBtn, (!draft.trim() || typing) && { opacity: 0.45 }]}
            >
              <Ionicons name="arrow-up" size={18} color="#fff" />
            </Pressable>
          </View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 10, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  headText: { flex: 1, minWidth: 0 },
  headTitle: { fontSize: 15.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  headSub: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.verified },
  msgs: { flex: 1 },
  msgsIn: { paddingVertical: 12, paddingHorizontal: 16, gap: 8 },
  bub: { maxWidth: '80%', paddingVertical: 9, paddingHorizontal: 12 },
  bubAgent: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomRightRadius: 16, borderBottomLeftRadius: 4 },
  bubYou: { alignSelf: 'flex-end', backgroundColor: colors.ink, borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomLeftRadius: 16, borderBottomRightRadius: 4 },
  bubText: { fontSize: 14.5, lineHeight: 20, fontFamily: fonts.ui.medium, color: colors.ink },
  bubTextYou: { color: '#fff' },
  dots: { fontSize: 14.5, letterSpacing: 2, color: colors.placeholder },
  card: { marginTop: 4, padding: 14, gap: 10, borderRadius: 20, backgroundColor: colors.surface, shadowColor: colors.ink, shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, minWidth: 0, gap: 2 },
  cardEye: { fontSize: 12, letterSpacing: 0.5, fontFamily: fonts.ui.extrabold },
  cardName: { fontSize: 16, fontFamily: fonts.ui.extrabold, color: colors.ink },
  cardSub: { fontSize: 12.5, fontFamily: fonts.ui.medium, color: colors.faint },
  cardLink: { minHeight: 44, justifyContent: 'center' },
  cardLinkText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
  footContainer: { gap: 8, paddingTop: 10, paddingHorizontal: 16, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.hairline },
  footReplies: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  reply: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  replyMain: { backgroundColor: colors.primary, borderColor: colors.primary },
  replyText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  replyTextMain: { color: '#fff' },
  composeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  composeInput: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    fontSize: 14,
    fontFamily: fonts.ui.medium,
    color: colors.ink,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
