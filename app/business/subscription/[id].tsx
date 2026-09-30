import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { paymentsApi } from '@/api/endpoints';
import { Button } from '@/components/Button';
import { colors, fonts, radius, spacing } from '@/theme';

const PLAN_PRICE_AMOUNT = '$39.900';
const PLAN_PRICE_UNIT = 'COP / mes';

function formatDate(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * "Mi negocio > Suscripción": muestra el estado del plan pago del negocio y
 * deja pagarlo (o renovarlo) abriendo el Widget Web Checkout de Wompi. Wompi
 * redirige de vuelta a la app (deep link) cuando el dueño termina de pagar;
 * como la confirmación real llega por un webhook al backend, refrescamos el
 * estado unas cuantas veces por si tarda un segundo en aplicarse.
 */
export default function BusinessSubscriptionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['subscription', id],
    queryFn: () => paymentsApi.getSubscription(id),
    enabled: Boolean(id),
  });

  const sub = query.data?.subscription;
  const isActive = sub?.status === 'active';
  const distinctCustomers = query.data?.distinct_customers ?? 0;
  const threshold = query.data?.trial_threshold ?? 10;
  const requiresPayment = query.data?.requires_payment ?? false;
  const inFreeTrial = !isActive && !requiresPayment;

  const pay = async () => {
    setError(null);
    setPaying(true);
    try {
      const checkout = await paymentsApi.createCheckout(id);
      const params = new URLSearchParams({
        'public-key': checkout.public_key,
        currency: checkout.currency,
        'amount-in-cents': String(checkout.amount_in_cents),
        reference: checkout.reference,
        'signature:integrity': checkout.signature,
        'redirect-url': checkout.redirect_url,
      });
      const checkoutUrl = `https://checkout.wompi.co/p/?${params.toString()}`;

      const result = await WebBrowser.openAuthSessionAsync(checkoutUrl, checkout.redirect_url);
      if (result.type === 'success') {
        // El webhook de Wompi puede tardar un par de segundos en llegar al
        // backend; reintentamos unas cuantas veces antes de rendirnos.
        for (let attempt = 0; attempt < 5; attempt += 1) {
          await sleep(1500);
          const fresh = await queryClient.fetchQuery({ queryKey: ['subscription', id], queryFn: () => paymentsApi.getSubscription(id) });
          queryClient.setQueryData(['subscription', id], fresh);
          if (fresh.subscription.status === 'active') break;
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos iniciar el pago. Intenta de nuevo.');
    } finally {
      setPaying(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>Suscripción</Text>
      </View>

      {query.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : query.isError ? (
        <View style={styles.center}>
          <Text style={styles.muted}>No pudimos cargar la suscripción.</Text>
        </View>
      ) : (
        <View style={styles.content}>
          <View style={[styles.statusCard, isActive && styles.statusCardActive]}>
            <View
              style={[
                styles.statusIconWrap,
                { backgroundColor: isActive ? colors.verifiedSoft : requiresPayment ? colors.primarySoft : colors.line },
              ]}
            >
              <Ionicons
                name={isActive ? 'checkmark-circle' : requiresPayment ? 'alert-circle-outline' : 'time-outline'}
                size={28}
                color={isActive ? colors.verified : requiresPayment ? colors.primary : colors.muted}
              />
            </View>
            <Text style={styles.statusTitle}>
              {isActive ? 'Plan Pro activo' : requiresPayment ? 'Tu prueba gratis terminó' : 'Prueba gratis'}
            </Text>
            <Text style={styles.statusSubtitle}>
              {isActive
                ? `Activo hasta el ${formatDate(sub?.current_period_end)}`
                : requiresPayment
                  ? 'Ya te contactaron suficientes clientes. Si no activas el plan pronto, tu negocio se ocultará del mapa y las búsquedas (tus conversaciones actuales siguen abiertas).'
                  : `Es gratis hasta que te escriban ${threshold} clientes distintos. Vas en ${distinctCustomers} de ${threshold}.`}
            </Text>
            {inFreeTrial ? (
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.min(100, (distinctCustomers / threshold) * 100)}%` },
                  ]}
                />
              </View>
            ) : null}
          </View>

          <View style={styles.planCard}>
            <View style={styles.planHeaderRow}>
              <Text style={styles.planName}>Empre Pro</Text>
              <View style={styles.planPriceWrap}>
                <Text style={styles.planPrice}>{PLAN_PRICE_AMOUNT}</Text>
                <Text style={styles.planPriceUnit}>{PLAN_PRICE_UNIT}</Text>
              </View>
            </View>
            <View style={styles.planFeatures}>
              <View style={styles.planFeature}>
                <Ionicons name="sparkles" size={16} color={colors.primary} />
                <Text style={styles.planFeatureText}>Tu negocio destacado en Empre</Text>
              </View>
              <View style={styles.planFeature}>
                <Ionicons name="stats-chart" size={16} color={colors.primary} />
                <Text style={styles.planFeatureText}>Más visibilidad en el mapa y las búsquedas</Text>
              </View>
            </View>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            title={isActive ? 'Renovar plan' : inFreeTrial ? 'Activar ahora (opcional)' : 'Pagar con Wompi'}
            onPress={() => void pay()}
            loading={paying}
          />
          <Text style={styles.disclaimer}>
            El pago se procesa de forma segura en Wompi. Empre nunca ve ni guarda los datos de tu tarjeta.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headerButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontFamily: fonts.ui.bold, color: colors.ink },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { fontSize: 14, fontFamily: fonts.ui.medium, color: colors.muted },
  content: { padding: spacing.lg, gap: spacing.lg },
  statusCard: {
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  statusCardActive: { borderColor: colors.verified, backgroundColor: colors.verified + '14' },
  statusIconWrap: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  statusTitle: { fontSize: 16, fontFamily: fonts.ui.bold, color: colors.ink },
  statusSubtitle: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center' },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.line,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: colors.primary },
  planCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: 'rgba(36,104,198,0.06)',
  },
  planHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: spacing.sm },
  planName: { fontSize: 15, fontFamily: fonts.ui.bold, color: colors.ink },
  planPriceWrap: { alignItems: 'flex-end' },
  planPrice: { fontSize: 20, fontFamily: fonts.display.semibold, color: colors.primary },
  planPriceUnit: { fontSize: 11, fontFamily: fonts.ui.medium, color: colors.muted },
  planFeatures: { gap: spacing.xs },
  planFeature: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  planFeatureText: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.ink },
  error: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.danger, textAlign: 'center' },
  disclaimer: { fontSize: 11, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center' },
});
