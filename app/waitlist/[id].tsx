import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { agendaApi } from '@/api/agenda';
import { ApiError } from '@/api/client';
import { Button } from '@/components/Button';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { useNow } from '@/lib/useNow';
import { colors, fonts, radius, spacing } from '@/theme';

const WINDOW_MS = 10 * 60_000;

function clock(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/**
 * Se liberó una hora (tablero «Agenda del negocio», teléfono 3): alguien canceló y eras el siguiente en la lista de
 * espera. Tienes 10 minutos para tomarla; después pasa al siguiente. Tomarla crea tu cita por el camino de siempre.
 */
export default function WaitlistOfferScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const now = useNow(1000);
  const mine = useQuery({ queryKey: ['waitlist', 'mine'], queryFn: agendaApi.myWaitlist });
  const entry = (mine.data ?? []).find((w) => w.id === id) ?? null;
  const take = useMutation({
    mutationFn: () => agendaApi.takeWaitlist(id ?? ''),
    onSuccess: (a) => {
      void qc.invalidateQueries({ queryKey: ['appointments'] });
      void qc.invalidateQueries({ queryKey: ['waitlist'] });
      router.replace({ pathname: '/appointment/[id]', params: { id: a.id } });
    },
  });
  const leave = useMutation({
    mutationFn: () => agendaApi.leaveWaitlist(id ?? ''),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['waitlist'] });
      router.back();
    },
  });

  const left = entry?.offered_at ? Date.parse(entry.offered_at) + WINDOW_MS - now : 0;
  const open = entry?.status === 'offered' && entry.offered_slot && left > 0;
  const gone = take.error instanceof ApiError && take.error.status === 409;
  const mm = Math.floor(Math.max(0, left) / 60_000);
  const ss = String(Math.floor((Math.max(0, left) % 60_000) / 1000)).padStart(2, '0');

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom + spacing.lg }]}>
      <SubScreenHeader title="Lista de espera" />
      {mine.isLoading ? (
        <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.primary} />
      ) : open && !gone ? (
        <View style={styles.body}>
          <View style={styles.card}>
            <Text style={styles.label}>Se liberó una hora en {entry.entity_name}</Text>
            <Text style={styles.hour}>{clock(entry.offered_slot!)}</Text>
            <Text style={styles.sub} accessibilityLiveRegion="polite">
              Eras el siguiente en la lista. Te queda {mm}:{ss} para tomarla; después pasa al siguiente.
            </Text>
          </View>
          <Button title={`Tomar las ${clock(entry.offered_slot!)}`} loading={take.isPending} onPress={() => take.mutate()} />
          <Button title="Ya no puedo, que pase al siguiente" variant="ghost" loading={leave.isPending} onPress={() => leave.mutate()} />
          {take.isError && !gone ? <Text style={styles.err}>No se pudo tomar. Revisa tu conexión e inténtalo de nuevo.</Text> : null}
        </View>
      ) : (
        <View style={styles.center}>
          <Ionicons name="time-outline" size={40} color={colors.muted} />
          <Text style={styles.title}>{entry?.status === 'booked' ? 'Ya tomaste esta hora' : 'Esta hora ya no está'}</Text>
          <Text style={styles.sub}>
            {entry?.status === 'booked' ? 'La encuentras en tus citas.' : entry?.status === 'waiting' ? 'Sigues en la lista: si se libera otra, te avisamos.' : 'Pasaron los 10 minutos o alguien más la tomó.'}
          </Text>
          <Button title="Ver mis citas" variant="secondary" onPress={() => router.replace('/appointments')} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: spacing.lg, gap: spacing.md },
  card: { padding: spacing.lg, gap: 6, borderRadius: radius.lg, backgroundColor: colors.surface },
  label: { fontSize: 15, fontFamily: fonts.ui.semibold, color: colors.ink },
  hour: { fontSize: 40, lineHeight: 46, fontFamily: fonts.display.bold, color: colors.primaryDark, fontVariant: ['tabular-nums'] },
  sub: { fontSize: 14, lineHeight: 20, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'left' },
  err: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.ink, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
  title: { fontSize: 20, fontFamily: fonts.display.bold, color: colors.ink, textAlign: 'center' },
});
