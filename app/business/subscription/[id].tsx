import { Ionicons } from '@/components/Icon';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { paymentsApi } from '@/api/endpoints';
import { Button } from '@/components/Button';
import { ProPerkList } from '@/components/pro/ProPerkList';
import { ProTag } from '@/components/pro/ProTag';
import { isProSubscription, proPriceFor, PRO_PRICE_UNIT } from '@/lib/proPlan';
import { colors, fonts, radius, spacing } from '@/theme';


function formatDate(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Tu plan (Mi negocio > Tu plan, tablero «Base y Empre Pro»): Base es gratis y nunca oculta el negocio; Empre Pro suma
 * Empre AI, la agenda y contar por sección, por $39.900 al mes por negocio. Pagar (o renovar) abre el Widget Web
 * Checkout de Wompi; la confirmación llega por un webhook al backend, así que el estado se refresca unas veces al
 * volver por si tarda un segundo en aplicarse.
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
  const price = proPriceFor(query.data);
  const isPro = isProSubscription(sub);

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
        <Text style={styles.title}>Tu plan</Text>
      </View>

      {query.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.ink} />
        </View>
      ) : query.isError ? (
        <View style={styles.center}>
          <Text style={styles.muted}>No pudimos cargar tu plan.</Text>
          <Button title="Reintentar" variant="secondary" onPress={() => void query.refetch()} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.lg }]}>
          {/* Dónde estás: Base es gratis y nunca oculta tu negocio; Pro dice hasta cuándo. */}
          <View style={styles.planCard}>
            <View style={styles.planHead}>
              {isPro ? <ProTag /> : null}
              <Text style={styles.planTitle} accessibilityRole="header">
                {isPro ? 'Empre Pro activo' : 'Plan Base · gratis'}
              </Text>
            </View>
            <Text style={styles.planSub}>
              {isPro
                ? `Hasta el ${formatDate(sub?.current_period_end)}. Si no renuevas, vuelves a Base y nada se pierde.`
                : 'Vendes, anotas, publicas ofertas y te encuentran en Empre sin pagar. Lo de Pro se ve en gris con la corona.'}
            </Text>
          </View>

          <View>
            <Text style={styles.lead}>{isPro ? 'Lo que tienes con Empre Pro:' : 'Lo que ya tienes sigue igual. Con Empre Pro se suma:'}</Text>
            <ProPerkList detail />
            <View style={styles.price}>
              <Text style={styles.priceName}>Empre Pro</Text>
              <Text style={styles.priceAmount} accessibilityLabel={`${price.amount} pesos al mes, por negocio`}>
                {price.amount}
                <Text style={styles.priceUnit}> al mes</Text>
              </Text>
            </View>
            {price.extra ? <Text style={styles.disclaimer}>Mitad de precio: ya tienes Empre Pro en otro de tus negocios.</Text> : null}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button title={isPro ? 'Renovar un mes más' : 'Pásate a Pro'} onPress={() => void pay()} loading={paying} />
          <Text style={styles.disclaimer}>
            {`Se paga por negocio, ${price.amount} ${PRO_PRICE_UNIT}, en Wompi. Cada negocio más va a mitad de precio. Empre nunca ve ni guarda los datos de tu tarjeta.`}
          </Text>
        </ScrollView>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  muted: { fontSize: 14, fontFamily: fonts.ui.medium, color: colors.muted },
  content: { padding: spacing.md, gap: spacing.lg },
  planCard: { gap: 4, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.well, borderWidth: 1, borderColor: colors.line },
  planHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  planTitle: { fontSize: 17, lineHeight: 22, fontFamily: fonts.ui.semibold, color: colors.ink },
  planSub: { fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.muted },
  lead: { marginBottom: spacing.sm, fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.muted },
  price: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line },
  priceName: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink },
  priceAmount: { fontSize: 20, fontFamily: fonts.ui.semibold, color: colors.ink },
  priceUnit: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  error: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.danger, textAlign: 'center' },
  disclaimer: { fontSize: 12, lineHeight: 16, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center' },
});
