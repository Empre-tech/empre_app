import { Ionicons } from '@/components/Icon';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { offerAlertsApi } from '@/api/offers';
import { useAuth } from '@/auth/AuthContext';
import { colors, fonts } from '@/theme';

/**
 * «Avísame» (tablero «Ofertas», teléfono 4): lo último cuando hay pocas ofertas no es un relleno, es que te avisen.
 * Guarda el aviso en el servidor por zona y categoría; cuando un negocio de esa zona publica, llega la notificación.
 */
export function OfferAlertCard({ zoneId, zoneName, categoryId, categoryName }: { zoneId: string; zoneName: string; categoryId?: string; categoryName?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { status } = useAuth();
  const signedIn = status === 'signedIn';
  const mine = useQuery({ queryKey: ['offer-alerts'], queryFn: offerAlertsApi.mine, enabled: signedIn, staleTime: 60_000 });
  const current = (mine.data ?? []).find((a) => a.zone_id === zoneId && (a.category_id ?? undefined) === categoryId) ?? null;
  const create = useMutation({ mutationFn: () => offerAlertsApi.create(zoneId, categoryId), onSuccess: () => qc.invalidateQueries({ queryKey: ['offer-alerts'] }) });
  const remove = useMutation({ mutationFn: (id: string) => offerAlertsApi.remove(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['offer-alerts'] }) });

  const what = categoryName ? `ofertas de ${categoryName.toLowerCase()}` : 'ofertas';
  const busy = create.isPending || remove.isPending;
  const failed = create.isError || remove.isError;

  const title = current ? `Te avisamos de ${what} en ${zoneName}` : `Avísame de ${what} aquí`;
  const sub = failed ? 'No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.' : current ? 'Te llega una notificación cuando un negocio publique una.' : `Cuando un negocio de ${zoneName} publique una.`;

  const onPress = () => {
    if (!signedIn) return router.push('/(auth)/login');
    if (current) remove.mutate(current.id);
    else create.mutate();
  };
  const label = !signedIn ? 'Entrar' : current ? 'Quitar' : 'Avisarme';

  return (
    <View style={styles.card}>
      <View style={[styles.icon, current && styles.iconOn]}>
        <Ionicons name={current ? 'notifications' : 'notifications-outline'} size={18} color={colors.ink} />
      </View>
      <View style={styles.texts}>
        <Text style={styles.title}>{title}</Text>
        <Text style={[styles.sub, failed && styles.subError]}>{sub}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={!signedIn ? 'Entra para que te avisemos' : current ? `Quitar el aviso de ${what} en ${zoneName}` : `Avisarme de ${what} en ${zoneName}`}
        accessibilityState={{ busy }}
        disabled={busy}
        onPress={onPress}
        style={({ pressed }) => [styles.btn, current && styles.btnQuiet, pressed && styles.pressed]}
      >
        {busy ? <ActivityIndicator color={current ? colors.ink : colors.surface} /> : <Text style={[styles.btnText, current && styles.btnTextQuiet]}>{label}</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 20, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selectedSoft },
  iconOn: { backgroundColor: colors.selectedSoft },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 15, lineHeight: 19, fontFamily: fonts.ui.bold, color: colors.ink },
  sub: { fontSize: 12, lineHeight: 16, fontFamily: fonts.ui.medium, color: colors.muted },
  subError: { color: colors.ink },
  btn: { minHeight: 44, minWidth: 92, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  btnQuiet: { backgroundColor: colors.selectedSoft },
  btnText: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.surface },
  btnTextQuiet: { color: colors.ink },
  pressed: { opacity: 0.8 },
});
