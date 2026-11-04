import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { entitiesApi, paymentsApi } from '@/api/endpoints';
import { novedadesApi } from '@/api/novedades';
import { useInboxSummary } from '@/chat/useInboxSummary';
import { EmpreSymbol, type EmpreProduct } from '@/components/EmpreSymbol';
import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import { GrowthCard } from '@/components/profile/GrowthCard';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { FEATURES } from '@/config';
import { catalogCopy } from '@/lib/catalog';
import { resolveImageUrl } from '@/lib/image';
import { displayIcon } from '@/lib/mapView';
import { initials } from '@/lib/text';
import { colors, fonts, softShadow, spacing } from '@/theme';

/**
 * «Mi negocio»: el centro de todo. Desde aquí se administra lo que es del negocio —datos, productos e inventario, fotos,
 * ofertas, ventas y gastos, agenda, suscripción— y «Así te ven» solo muestra cómo lo ven los demás.
 */
export default function BusinessHubScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const entityId = id ?? '';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const inbox = useInboxSummary();

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

  const agenda = go({ pathname: '/business/agenda/[id]', params: { id: entityId } });
  const finance = go({ pathname: '/business/ledger/[id]', params: { id: entityId } });
  const profile = go({ pathname: '/business/[id]', params: { id: entityId } });
  const requests = inbox.byEntity.get(entityId)?.requests ?? 0;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.body, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 28 }]}>
        <View style={styles.head}>
          <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} style={styles.back}>
            <Ionicons name="chevron-back" size={20} color={colors.ink} />
          </Pressable>
          <View style={styles.headText}>
            <Text style={styles.title} accessibilityRole="header">
              Mi negocio
            </Text>
            <View style={styles.pill}>
              <View style={styles.pillIni}>
                <Text style={styles.pillIniText}>{initials(b.name)}</Text>
              </View>
              <Text style={styles.pillName} numberOfLines={1}>
                {b.name}
              </Text>
            </View>
          </View>
        </View>

        <Pressable accessibilityRole="link" accessibilityLabel={`${b.name}. Así te ven`} onPress={profile} style={({ pressed }) => [styles.hero, pressed && { opacity: 0.9 }]}>
          <View style={styles.heroBand}>
            {b.banner_url ? <Image accessible={false} source={{ uri: resolveImageUrl(b.banner_url) ?? undefined }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
          </View>
          <View style={styles.heroBody}>
            <View style={styles.heroAvatar}>
              {b.profile_url ? <Avatar uri={b.profile_url} name={b.name} size={48} /> : <Ionicons name={displayIcon(b.category?.icon) as keyof typeof Ionicons.glyphMap} size={24} color={colors.ink} />}
            </View>
            <View style={styles.heroText}>
              <Text style={styles.heroName} numberOfLines={1}>
                {b.name}
              </Text>
              <Text style={styles.heroMeta} numberOfLines={1}>
                {b.review_count > 0 ? (
                  <>
                    <Text style={{ color: '#FFB21A' }}>★</Text> {b.avg_rating.toFixed(1).replace('.', ',')} ·{' '}
                  </>
                ) : null}
                <Text style={{ color: b.is_open_now ? colors.verified : colors.muted, fontFamily: fonts.ui.extrabold }}>{b.is_open_now ? 'Abierto' : 'Cerrado'}</Text>
                {nFollowers > 0 ? ` · ${nFollowers} ${nFollowers === 1 ? 'seguidor' : 'seguidores'}` : ''}
              </Text>
            </View>
            <Text style={styles.heroLink}>Así te ven ›</Text>
          </View>
        </Pressable>

        {b.is_verified ? null : <Text style={styles.pending}>Aún no está verificado. Puedes administrarlo mientras tanto.</Text>}

        {requiresPayment ? (
          <Pressable accessibilityRole="button" onPress={go({ pathname: '/business/subscription/[id]', params: { id: entityId } })} style={styles.trial}>
            <Ionicons name="sparkles" size={18} color={colors.primary} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.trialTitle}>Tu prueba gratis terminó</Text>
              <Text style={styles.sub}>Actívalo pronto o tu negocio se ocultará del mapa y las búsquedas.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        ) : null}

        <View style={styles.today}>
          {requests > 0 && FEATURES.agenda ? (
            <Pressable accessibilityRole="link" onPress={agenda} style={styles.todayStrip}>
              <View style={styles.todayDot} />
              <Text style={styles.todayText}>Hoy · {requests} por responder</Text>
              <Text style={styles.todayText}>Ver agenda ›</Text>
            </Pressable>
          ) : null}
          <View style={styles.quick}>
            <Quick symbol="offers" icon="scan-outline" label="Canjear" onPress={go('/business/scan')} />
            {FEATURES.ledger ? <Quick symbol="finance" icon="add-circle-outline" label="Vender" onPress={go({ pathname: '/business/ledger/sale/[id]', params: { id: entityId } })} /> : null}
            {FEATURES.agenda ? <Quick icon="calendar-outline" label="Agenda" onPress={agenda} /> : null}
          </View>
        </View>

        <GrowthCard entityId={entityId} onGo={(t) => (t === 'catalog' ? products() : t === 'offer' ? offers() : t === 'photos' ? photos() : edit())} />

        <Group title="LO QUE VEN TUS CLIENTES">
          <Tile first icon="person-outline" title="Perfil público" sub="Nombre, descripción, horario, ubicación y contacto" onPress={edit} />
          <Tile icon="list-outline" title={FEATURES.ledger && copy.kind !== 'service' ? `${copy.noun} e inventario` : copy.noun} sub={FEATURES.ledger && copy.kind !== 'service' ? 'Lo que vendes, su precio y cuántos te quedan' : 'Lo que ofreces y su precio'} onPress={products} />
          <Tile icon="images-outline" title="Fotos y videos" sub={`${b.photos?.length ?? 0} publicadas · súbelas y edítalas aquí`} onPress={photos} />
          <Tile symbol="offers" soft product="EMPRE OFFERS" icon="flash-outline" title="Ofertas" sub="Publica y administra tus ofertas" onPress={offers} />
        </Group>

        {FEATURES.ledger || FEATURES.agenda ? (
          <Group title="SOLO PARA TI">
            {FEATURES.agenda ? <Tile first symbol="agenda" product="EMPRE AGENDA" icon="calendar-outline" title="Agenda" sub={requests > 0 ? `${requests} por responder` : 'Solicitudes y reservas'} hot={requests > 0} onPress={agenda} /> : null}
            {FEATURES.agenda ? <Tile symbol="agent" product="EMPRE AGENT" icon="chatbubble-ellipses-outline" title="Agent" sub="Lo que resolvió solo y lo que espera tu decisión" onPress={go({ pathname: '/business/agent/[id]', params: { id: entityId, name: b.name } })} /> : null}
            {FEATURES.ledger ? <Tile symbol="finance" product="EMPRE FINANCE" icon="wallet-outline" title="Finanzas" sub="Cómo va el día, fiados y costos" onPress={finance} /> : null}
            {FEATURES.ledger && FEATURES.tabs ? (
              <Tile
                icon={b.business_profile === 'food' ? 'restaurant-outline' : 'receipt-outline'}
                title={b.business_profile === 'food' ? 'Mesas' : 'Cuentas abiertas'}
                sub={b.business_profile === 'food' ? 'Lo que va pidiendo cada mesa, y cobrar al final' : 'Para clientes que piden varias cosas y pagan al final'}
                onPress={go({ pathname: '/business/ledger/tabs/[id]', params: { id: entityId } })}
              />
            ) : null}
            <Tile icon="school-outline" title="Practicar el canje" sub="Con un QR de práctica: no cuenta como venta" onPress={go('/business/practice')} />
          </Group>
        ) : null}

        <Group title="CUENTA">
          <Tile first icon="diamond-outline" title="Suscripción del negocio" sub="Tu plan y pagos" onPress={go({ pathname: '/business/subscription/[id]', params: { id: entityId } })} dot={requiresPayment} />
        </Group>
      </ScrollView>
    </View>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle} accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.groupCard}>{children}</View>
    </View>
  );
}

function Quick({ symbol, icon, label, onPress }: { symbol?: EmpreProduct; icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.quickTile, pressed && { opacity: 0.8 }]}>
      {symbol ? <EmpreSymbol product={symbol} size={30} /> : <View style={styles.quickIcon}><Ionicons name={icon} size={18} color={colors.verified} /></View>}
      <Text style={styles.quickText}>{label}</Text>
    </Pressable>
  );
}

function Tile({ symbol, icon, title, sub, onPress, dot, first, product, soft, hot }: { symbol?: EmpreProduct; icon: keyof typeof Ionicons.glyphMap; title: string; sub: string; onPress: () => void; dot?: boolean; first?: boolean; product?: string; soft?: boolean; hot?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${sub}`} onPress={onPress} style={({ pressed }) => [styles.tile, !first && styles.tileLine, pressed && { opacity: 0.85 }]}>
      <View style={[styles.tileIcon, soft && { backgroundColor: colors.accentSoft }]}>{symbol ? <EmpreSymbol product={symbol} size={28} /> : <Ionicons name={icon} size={19} color={colors.muted} />}</View>
      <View style={styles.tileText}>
        <View style={styles.tileTop}>
          <Text style={styles.tileTitle}>{title}</Text>
          {product ? <Text style={styles.tileProduct}>{product}</Text> : null}
        </View>
        <Text style={[styles.sub, hot && styles.subHot]}>{sub}</Text>
      </View>
      {dot ? <View style={styles.dot} /> : null}
      <Ionicons name="chevron-forward" size={18} color={colors.placeholder} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: 16, gap: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, shadowColor: colors.ink, shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  headText: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontSize: 20, lineHeight: 24, fontFamily: fonts.display.bold, color: colors.ink },
  pill: { alignSelf: 'flex-start', maxWidth: '100%', minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 4, paddingRight: 10, borderRadius: 999, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  pillIni: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selectedSoft },
  pillIniText: { fontSize: 11, fontFamily: fonts.ui.extrabold, color: colors.ink },
  pillName: { flexShrink: 1, fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  hero: { borderRadius: 20, overflow: 'hidden', backgroundColor: colors.surface, ...softShadow },
  heroBand: { height: 56, backgroundColor: colors.ink },
  heroBody: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: -16, paddingHorizontal: 14, paddingBottom: 12 },
  heroAvatar: { width: 54, height: 54, borderRadius: 14, borderWidth: 3, borderColor: colors.surface, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, shadowColor: colors.ink, shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  heroText: { flex: 1, minWidth: 0, gap: 1 },
  heroName: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  heroMeta: { fontSize: 12, fontFamily: fonts.ui.medium, color: colors.faint },
  heroLink: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
  pending: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.ui.semibold, color: colors.accentInk },
  trial: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: colors.primarySoft, borderWidth: 1.5, borderColor: colors.primary },
  trialTitle: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  today: { padding: 14, gap: 12, borderRadius: 20, backgroundColor: colors.surface },
  todayStrip: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.accentSoft },
  todayDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.warning },
  todayText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.accentInk, flexShrink: 1 },
  quick: { flexDirection: 'row', gap: 8 },
  quickTile: { flex: 1, minHeight: 72, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 16, borderWidth: 1.5, borderColor: colors.hairline },
  quickIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.verifiedSoft },
  quickText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  group: { gap: 8 },
  groupTitle: { fontSize: 12, letterSpacing: 1.2, fontFamily: fonts.ui.extrabold, color: colors.faint },
  groupCard: { paddingVertical: 2, paddingHorizontal: 14, borderRadius: 20, backgroundColor: colors.surface },
  tile: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  tileLine: { borderTopWidth: 1, borderTopColor: colors.selectedSoft },
  tileIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selectedSoft },
  tileText: { flex: 1, minWidth: 0, gap: 1 },
  tileTop: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 6 },
  tileTitle: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  tileProduct: { fontSize: 11, letterSpacing: 0.66, fontFamily: fonts.ui.extrabold, color: colors.faint },
  sub: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.ui.semibold, color: colors.faint },
  subHot: { fontFamily: fonts.ui.extrabold, color: colors.accentInk },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
});
