import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { entitiesApi, paymentsApi } from '@/api/endpoints';
import { novedadesApi } from '@/api/novedades';
import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import { GrowthCard } from '@/components/profile/GrowthCard';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { FEATURES } from '@/config';
import { catalogCopy } from '@/lib/catalog';
import { colors, fonts, radius, spacing } from '@/theme';

/**
 * «Mi negocio»: el centro de todo. Desde aquí se administra lo que es del negocio —datos, productos e inventario, fotos,
 * ofertas, ventas y gastos, agenda, suscripción— y «Así te ven» solo muestra cómo lo ven los demás.
 */
export default function BusinessHubScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const entityId = id ?? '';
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const business = useQuery({ queryKey: ['entity', entityId], queryFn: () => entitiesApi.get(entityId), enabled: Boolean(entityId) });
  const subscription = useQuery({ queryKey: ['subscription', entityId], queryFn: () => paymentsApi.getSubscription(entityId), enabled: Boolean(entityId) });
  const followers = useQuery({ queryKey: ['followers', entityId], queryFn: () => novedadesApi.followers(entityId), enabled: Boolean(entityId) });

  if (business.isLoading) {
    return (
      <View style={styles.screen}>
        <SubScreenHeader title="Mi negocio" />
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      </View>
    );
  }
  const b = business.data;
  if (business.isError || !b) {
    return (
      <View style={styles.screen}>
        <SubScreenHeader title="Mi negocio" />
        <EmptyState icon="cloud-offline-outline" title="No pudimos cargar tu negocio" body="Revisa tu conexión e inténtalo de nuevo." action={{ title: 'Reintentar', onPress: () => void business.refetch() }} />
      </View>
    );
  }

  const copy = catalogCopy(b.category?.name, b.business_profile);
  const requiresPayment = subscription.data?.requires_payment ?? false;
  const nFollowers = followers.data ?? 0;
  const go = (href: Href) => () => router.push(href);
  const edit = go({ pathname: '/business/edit/[id]', params: { id: entityId } });
  const offers = go({ pathname: '/business/offers', params: { entityId } });
  const products = go({ pathname: '/business/products/[id]', params: { id: entityId } });
  const photos = go({ pathname: '/business/my-photos/[id]', params: { id: entityId } });

  return (
    <View style={styles.screen}>
      <SubScreenHeader title="Mi negocio" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: insets.bottom + spacing.xxl }}>
        <View style={styles.identity}>
          <Avatar uri={b.profile_url} name={b.name} size={56} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>{b.name}</Text>
            <Text style={styles.meta} numberOfLines={1}>
              {[b.category?.name, nFollowers > 0 ? `${nFollowers} ${nFollowers === 1 ? 'seguidor' : 'seguidores'}` : null].filter(Boolean).join(' · ')}
            </Text>
            {b.is_verified ? null : <Text style={styles.pending}>Aún no está verificado. Puedes administrarlo mientras tanto.</Text>}
          </View>
        </View>

        {requiresPayment ? (
          <Pressable accessibilityRole="button" onPress={go({ pathname: '/business/subscription/[id]', params: { id: entityId } })} style={styles.trial}>
            <Ionicons name="sparkles" size={18} color={colors.primary} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.trialTitle}>Tu prueba gratis terminó</Text>
              <Text style={styles.meta}>Actívalo pronto o tu negocio se ocultará del mapa y las búsquedas.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        ) : null}

        <GrowthCard entityId={entityId} onGo={(t) => (t === 'catalog' ? products() : t === 'offer' ? offers() : t === 'photos' ? photos() : edit())} />

        <Group title="Tu negocio">
          <Tile icon="create-outline" title="Datos del negocio" sub="Nombre, descripción, horario, ubicación y contacto" onPress={edit} />
          <Tile icon="cube-outline" title={FEATURES.ledger && copy.kind !== 'service' ? `${copy.noun} e inventario` : copy.noun} sub={FEATURES.ledger && copy.kind !== 'service' ? 'Lo que vendes, su precio y cuántos te quedan' : 'Lo que ofreces y su precio'} onPress={products} />
          <Tile icon="images-outline" title="Fotos y videos" sub={`${b.photos?.length ?? 0} publicadas · súbelas y edítalas aquí`} onPress={photos} />
          <Tile icon="flash-outline" title="Ofertas" sub="Publica y administra tus promociones" onPress={offers} />
        </Group>

        {FEATURES.ledger || FEATURES.agenda ? (
          <Group title="Día a día">
            {FEATURES.ledger ? <Tile icon="wallet-outline" title="Ventas y gastos" sub="Cómo va el día, fiados y costos" onPress={go({ pathname: '/business/ledger/[id]', params: { id: entityId } })} /> : null}
            {FEATURES.ledger && FEATURES.tabs ? (
              <Tile
                icon={b.business_profile === 'food' ? 'restaurant-outline' : 'receipt-outline'}
                title={b.business_profile === 'food' ? 'Mesas' : 'Cuentas abiertas'}
                sub={b.business_profile === 'food' ? 'Lo que va pidiendo cada mesa, y cobrar al final' : 'Para clientes que piden varias cosas y pagan al final'}
                onPress={go({ pathname: '/business/ledger/tabs/[id]', params: { id: entityId } })}
              />
            ) : null}
            {FEATURES.agenda ? <Tile icon="calendar-outline" title="Agenda de citas" sub="Solicitudes y reservas" onPress={go({ pathname: '/business/agenda/[id]', params: { id: entityId } })} /> : null}
            <Tile icon="scan-outline" title="Escanear canje" sub="Valida el código de un cliente" onPress={go('/business/scan')} />
          </Group>
        ) : null}

        <Group title="Cuenta">
          <Tile icon="diamond-outline" title="Suscripción del negocio" sub="Tu plan y pagos" onPress={go({ pathname: '/business/subscription/[id]', params: { id: entityId } })} dot={requiresPayment} />
          <Tile icon="eye-outline" title="Así te ven" sub="Cómo ven tu negocio los demás" onPress={go({ pathname: '/business/[id]', params: { id: entityId } })} />
        </Group>
      </ScrollView>
    </View>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={styles.groupTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Tile({ icon, title, sub, onPress, dot }: { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string; onPress: () => void; dot?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${sub}`} onPress={onPress} style={({ pressed }) => [styles.tile, pressed && { opacity: 0.85 }]}>
      <View style={styles.tileIcon}>
        <Ionicons name={icon} size={22} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.tileTitle}>{title}</Text>
        <Text style={styles.meta}>{sub}</Text>
      </View>
      {dot ? <View style={styles.dot} /> : null}
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { fontSize: 20, fontFamily: fonts.display.bold, color: colors.ink },
  meta: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  pending: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: '#9A5B00', marginTop: 2 },
  trial: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primarySoft, borderWidth: 1.5, borderColor: colors.primary },
  trialTitle: { fontSize: 14, fontFamily: fonts.display.bold, color: colors.ink },
  groupTitle: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  tile: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 64, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  tileIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  tileTitle: { fontSize: 15.5, fontFamily: fonts.ui.bold, color: colors.ink },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
});
