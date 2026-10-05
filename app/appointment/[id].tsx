import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { agendaApi, type Appointment } from '@/api/agenda';
import { useAuth } from '@/auth/AuthContext';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import {
  DECLINE_REASONS,
  formatClock,
  formatDay,
  formatDuration,
  formatRemaining,
  formatWhen,
  STATUS_COLOR,
  STATUS_LABEL,
} from '@/lib/agendaFormat';
import { colors, fonts, radius, spacing } from '@/theme';

function statusLine(appt: Appointment, isBusiness: boolean): string {
  switch (appt.status) {
    case 'requested':
      return isBusiness
        ? 'Responde antes de que venza para no perder al cliente.'
        : 'El negocio tiene que aceptarla. Te avisamos apenas responda.';
    case 'confirmed':
      return isBusiness ? 'Cita confirmada. El cliente ya fue avisado.' : 'Tu cita está confirmada. Te recordamos antes de la hora.';
    case 'declined': {
      const reason = DECLINE_REASONS.find((r) => r.code === appt.decline_reason)?.label;
      return reason ? `Motivo: ${reason}.` : 'El negocio no pudo atenderla.';
    }
    case 'expired':
      return isBusiness ? 'No alcanzaste a responder y el espacio se liberó.' : 'El negocio no alcanzó a responder. Puedes pedir otra hora.';
    case 'cancelled':
      return appt.cancelled_by === 'business' ? 'La canceló el negocio.' : 'La canceló el cliente.';
    case 'completed':
      return 'La cita se cumplió.';
    case 'no_show':
      return 'El cliente no se presentó.';
    case 'disputed':
      return 'Las dos partes respondieron distinto. Queda registrado.';
    default:
      return '';
  }
}

export default function AppointmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [now, setNow] = useState(Date.now());

  // La cuenta regresiva se refresca sola (el estado llega aparte por WebSocket).
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const query = useQuery({
    queryKey: ['appointment', id],
    queryFn: () => agendaApi.get(id),
    enabled: Boolean(id),
  });
  const appt = query.data;
  const isBusiness = Boolean(appt && user && appt.entity?.owner_id === user.id);

  const refresh = (updated?: Appointment) => {
    if (updated) queryClient.setQueryData(['appointment', id], updated);
    void queryClient.invalidateQueries({ queryKey: ['appointments'] });
    void queryClient.invalidateQueries({ queryKey: ['agenda'] });
    void queryClient.invalidateQueries({ queryKey: ['agenda-summary'] });
  };
  const onError = (error: Error) => {
    const message =
      error.message === 'bad_state' ? 'Esta cita ya cambió de estado. Actualizamos la pantalla.' : error.message;
    Alert.alert('No se pudo completar', message);
    void query.refetch();
  };

  const accept = useMutation({ mutationFn: () => agendaApi.accept(id), onSuccess: refresh, onError });
  const cancel = useMutation({ mutationFn: () => agendaApi.cancel(id), onSuccess: refresh, onError });
  const outcome = useMutation({ mutationFn: (attended: boolean) => agendaApi.outcome(id, attended), onSuccess: refresh, onError });
  const rebook = useMutation({
    mutationFn: (startsAt: string) =>
      agendaApi.book({ entity_id: appt!.entity_id, service_id: appt!.service_id, starts_at: startsAt }),
    onSuccess: (created) => {
      refresh();
      router.replace({ pathname: '/appointment/[id]', params: { id: created.id } });
    },
    onError,
  });

  const confirmCancel = () => {
    if (!appt) return;
    const late = appt.status === 'confirmed' && Date.parse(appt.starts_at) - Date.now() < 2 * 60 * 60 * 1000;
    Alert.alert(
      appt.status === 'requested' ? '¿Cancelar la solicitud?' : '¿Cancelar la cita?',
      late ? 'Cancelar tan cerca de la cita queda registrado.' : 'La otra parte recibirá un aviso.',
      [
        { text: 'No', style: 'cancel' },
        { text: 'Sí, cancelar', style: 'destructive', onPress: () => cancel.mutate() },
      ],
    );
  };

  if (query.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!appt) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>No encontramos esta cita.</Text>
        <Button title="Volver" variant="secondary" onPress={() => router.back()} style={{ marginTop: spacing.lg }} />
      </View>
    );
  }

  const durationMin = Math.round((Date.parse(appt.ends_at) - Date.parse(appt.starts_at)) / 60_000);
  const other = isBusiness ? appt.customer?.name ?? 'Cliente' : appt.entity?.name ?? 'Negocio';
  const ended = Date.parse(appt.ends_at) <= now;
  const myAnswer = isBusiness ? appt.business_attended : appt.customer_attended;
  const askOutcome = appt.status === 'confirmed' && ended && myAnswer === undefined;
  const pending = appt.status === 'requested';

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Volver">
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>{isBusiness && pending ? 'Solicitud de cita' : 'Tu cita'}</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={styles.card}>
          <Text style={styles.label}>{isBusiness ? 'Te piden' : 'Tu cita'}</Text>
          <Text style={styles.when}>{formatWhen(appt.starts_at)}</Text>
          <Text style={styles.meta}>
            {appt.service ? `${appt.service.name} · ` : ''}
            {formatDuration(durationMin)}
          </Text>

          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: STATUS_COLOR[appt.status] }]} />
            <Text style={[styles.status, { color: STATUS_COLOR[appt.status] }]}>{STATUS_LABEL[appt.status]}</Text>
          </View>
          <Text style={styles.statusText}>{statusLine(appt, isBusiness)}</Text>

          <View style={styles.personRow}>
            <Avatar uri={isBusiness ? appt.customer?.profile_picture_url : appt.entity?.profile_url} name={other} size={44} />
            <Text style={styles.person}>{other}</Text>
          </View>

          {appt.customer_note ? (
            <View style={styles.noteBox}>
              <Text style={styles.label}>{isBusiness ? 'Su nota' : 'Tu nota'}</Text>
              <Text style={styles.note}>{appt.customer_note}</Text>
            </View>
          ) : null}

          {pending && appt.expires_at ? (
            <View style={styles.expiry}>
              <Ionicons name="time-outline" size={18} color={colors.warning} />
              <Text style={styles.expiryText}>
                {isBusiness ? 'Expira en ' : 'El negocio tiene '}
                {formatRemaining(appt.expires_at, now)}
                {isBusiness ? '' : ' para responder'}
              </Text>
            </View>
          ) : null}
          {appt.out_of_hours ? (
            <Text style={styles.warn}>Esta cita quedó fuera del horario de atención actual.</Text>
          ) : null}
        </View>

        {isBusiness && pending ? (
          <View style={styles.actions}>
            <Button
              title="Rechazar"
              variant="secondary"
              onPress={() => router.push({ pathname: '/appointment/decline/[id]', params: { id: appt.id } })}
              style={{ flex: 1 }}
            />
            <Button title="Aceptar" onPress={() => accept.mutate()} loading={accept.isPending} style={{ flex: 1 }} />
          </View>
        ) : null}

        {askOutcome ? (
          <View style={styles.card}>
            <Text style={styles.question}>¿Se dio la cita?</Text>
            <View style={styles.actions}>
              <Button title="No" variant="secondary" onPress={() => outcome.mutate(false)} loading={outcome.isPending} style={{ flex: 1 }} />
              <Button title="Sí" onPress={() => outcome.mutate(true)} loading={outcome.isPending} style={{ flex: 1 }} />
            </View>
          </View>
        ) : appt.status === 'confirmed' && ended && myAnswer !== undefined ? (
          <Text style={styles.muted}>Gracias. Esperamos la respuesta de la otra parte para cerrarla.</Text>
        ) : null}

        {!isBusiness && appt.status === 'declined' && (appt.proposed_slots ?? []).length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.question}>El negocio te propone otra hora</Text>
            <View style={styles.proposals}>
              {(appt.proposed_slots ?? []).map((iso) => (
                <Pressable
                  key={iso}
                  accessibilityRole="button"
                  disabled={rebook.isPending}
                  onPress={() => rebook.mutate(iso)}
                  style={({ pressed }) => [styles.proposal, pressed && { opacity: 0.8 }]}
                >
                  <Text style={styles.proposalText}>
                    {formatDay(iso)} · {formatClock(iso)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {!isBusiness && (appt.status === 'declined' || appt.status === 'expired') ? (
          <Button
            title="Ver el negocio"
            variant="secondary"
            onPress={() => router.push({ pathname: '/business/[id]', params: { id: appt.entity_id } })}
          />
        ) : null}

        {(appt.status === 'requested' || appt.status === 'confirmed') && !askOutcome ? (
          <Button
            title={appt.status === 'requested' ? 'Cancelar solicitud' : 'Cancelar cita'}
            variant="ghost"
            onPress={confirmCancel}
            loading={cancel.isPending}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: spacing.xl },
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
  content: { padding: spacing.lg, gap: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  label: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.muted },
  when: { fontSize: 27, fontFamily: fonts.ui.extrabold, color: colors.ink, letterSpacing: -0.4 },
  meta: { fontSize: 15, fontFamily: fonts.ui.medium, color: colors.muted },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  status: { fontSize: 15, fontFamily: fonts.ui.extrabold },
  statusText: { fontSize: 14, lineHeight: 20, fontFamily: fonts.ui.medium, color: colors.muted },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  person: { fontSize: 16, fontFamily: fonts.ui.bold, color: colors.ink, flex: 1 },
  noteBox: { gap: 4 },
  note: { fontSize: 15, fontFamily: fonts.ui.regular, color: colors.ink },
  expiry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  expiryText: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.accentDark, flex: 1 },
  warn: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.warning },
  actions: { flexDirection: 'row', gap: spacing.md },
  question: { fontSize: 16, fontFamily: fonts.ui.bold, color: colors.ink, marginBottom: spacing.xs },
  proposals: { gap: spacing.sm },
  proposal: {
    minHeight: 48,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  proposalText: { fontSize: 15, fontFamily: fonts.ui.bold, color: colors.primary },
  muted: { fontSize: 14, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center' },
});
