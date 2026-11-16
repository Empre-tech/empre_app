import { Ionicons } from '@/components/Icon';
import Constants from 'expo-constants';
import { useQuery, useQueryClient, useQueries } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { notifyError } from '@/components/Notice';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { agendaApi } from '@/api/agenda';
import { entitiesApi, usersApi } from '@/api/endpoints';
import { claimsApi } from '@/api/offers';
import { loadSavedClaims } from '@/claims/claimStore';
import { claimDate, mergeClaims, monthClaims, monthSummary, savedIn } from '@/lib/claims';
import { useNow } from '@/lib/useNow';
import { useAuth } from '@/auth/AuthContext';
import { Avatar } from '@/components/Avatar';
import { EmpreSymbol, type EmpreProduct } from '@/components/EmpreSymbol';
import { initAnalytics, isAnalyticsEnabled, setAnalyticsEnabled } from '@/analytics/track';
import { FEATURES } from '@/config';
import { SignInPrompt } from '@/components/SignInPrompt';
import { formatMessageTime, verificationLabel } from '@/lib/format';
import { pickImage } from '@/lib/images';
import { useInboxSummary } from '@/chat/useInboxSummary';
import { requestsLabel } from '@/lib/inbox';
import { ledgerApi } from '@/api/ledger';
import { formatPesos } from '@/lib/ledger';
import { todayCO } from '@/lib/finance';
import { getPhoneFlag, setPhoneFlag } from '@/lib/phoneFlags';
import { myInterests } from '@/lib/interests';
import { clearInterests, useInterestSignals } from '@/lib/interestStore';
import { ART_LABEL } from '@/lib/offerHome';
import { ScreenGlow } from '@/components/ScreenGlow';
import { AsiSaleSheet } from '@/components/AsiSaleSheet';
import { hasFacts, keptOf, keptPreview, savedPreview, totalPreview, type Preview } from '@/lib/asiSale';
import { colors, fonts } from '@/theme';

const version = Constants.expoConfig?.version;


export default function ProfileScreen() {
  const inbox = useInboxSummary();
  const { status, user, signOut, refreshUser } = useAuth();
  // Medición anónima de uso (se puede apagar; al apagarla se cambia el identificador de la instalación).
  const [analyticsOn, setAnalyticsOn] = useState(true);
  useEffect(() => {
    void initAnalytics().then(() => setAnalyticsOn(isAnalyticsEnabled()));
  }, []);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Lo suyo en una franja (tablero «Para el cliente»): salidas del mes, lo ahorrado y las citas que vienen. Solo lo que
  // hay: una cifra en cero no se muestra.
  const myClaims = useQuery({ queryKey: ['claims', 'mine'], queryFn: claimsApi.mine, enabled: status === 'signedIn', retry: false, staleTime: 15_000 });
  const savedClaims = useQuery({ queryKey: ['claims', 'saved', user?.id], queryFn: () => loadSavedClaims(user!.id), enabled: status === 'signedIn' && Boolean(user) });
  const myAppts = useQuery({ queryKey: ['appointments'], queryFn: agendaApi.mine, enabled: status === 'signedIn' && FEATURES.agenda });
  const stripNow = useNow(60_000);
  const allClaims = mergeClaims(myClaims.data ?? [], savedClaims.data ?? []);
  const month = monthSummary(allClaims, stripNow);
  const comingAppts = (myAppts.data ?? []).filter((a) => (a.status === 'requested' || a.status === 'confirmed') && Date.parse(a.starts_at) > stripNow).length;
  const following = useQuery({ queryKey: ['my-favorites'], queryFn: usersApi.favorites, enabled: status === 'signedIn', staleTime: 5 * 60_000 });
  const favCount = following.data?.length ?? 0;
  const mine = useQuery({
    queryKey: ['my-entities'],
    queryFn: entitiesApi.mine,
    enabled: status === 'signedIn',
  });
  // El negocio en el que estás trabajando: lo recuerda este teléfono.
  const [activeId, setActiveId] = useState<string | null>(null);
  // «Así sale» (tablero «Cada cifra con su porqué»): qué cifra se tocó. La hoja es una vista previa; el detalle, en su dueño.
  const [peek, setPeek] = useState<{ kind: 'kept'; id: string } | { kind: 'total' } | { kind: 'saved' } | null>(null);
  useEffect(() => {
    void getPhoneFlag('active-business').then(setActiveId);
  }, []);
  const entities = mine.data ?? [];
  const active = entities.find((e) => e.id === activeId)?.id ?? entities[0]?.id;
  const pick = (id: string) => {
    setActiveId(id);
    void setPhoneFlag('active-business', id);
  };
  const today = todayCO();
  const todays = useQueries({
    queries: entities.map((e) => ({
      queryKey: ['ledger', e.id, 'analytics', today, today, 'prev'],
      queryFn: () => ledgerApi.analytics(e.id, { from: today, to: today, compare: 'prev' as const }),
      staleTime: 60_000,
      retry: false,
      enabled: status === 'signedIn',
    })),
  });
  const salesOf = (id: string) => todays[entities.findIndex((e) => e.id === id)]?.data?.current;
  // Lo que te quedó hoy (entró menos salió), por negocio y entre todos: solo suman los que tuvieron movimiento.
  const allKept = entities.map((e) => ({ id: e.id, name: e.name, kept: keptOf(salesOf(e.id)) }));
  const anyFacts = allKept.some((x) => hasFacts(x.kept));
  const allLeft = allKept.reduce((sum, x) => sum + (hasFacts(x.kept) ? x.kept.left : 0), 0);
  // Lo principal de la vista previa (la venta más grande, los gastos más grandes): solo cuando se abre.
  const peekId = peek?.kind === 'kept' ? peek.id : null;
  const peekSales = useQuery({ queryKey: ['ledger', peekId, 'sales', today], queryFn: () => ledgerApi.sales(peekId!, { from: today, to: today, limit: 100 }), enabled: Boolean(peekId), staleTime: 60_000, retry: false });
  const peekOut = useQuery({ queryKey: ['ledger', peekId, 'expenses', today], queryFn: () => ledgerApi.expenses(peekId!, { from: today, to: today, limit: 100 }), enabled: Boolean(peekId), staleTime: 60_000, retry: false });

  if (status !== 'signedIn' || !user) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ScreenGlow />
        <SignInPrompt title="Tu perfil" message="Inicia sesión para ver tu cuenta y administrar tus negocios." variant="profile" />
      </View>
    );
  }

  const changePhoto = async () => {
    if (uploadingPhoto) return;
    try {
      const image = await pickImage({ aspect: [1, 1], maxWidth: 800 });
      if (!image) return;
      setUploadingPhoto(true);
      await usersApi.uploadProfileImage(image);
      await refreshUser();
      // Los negocios y chats no cambian, pero por si otra pantalla muestra tu foto.
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    } catch (error) {
      notifyError('No pudimos cambiar tu foto', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const hasBusiness = (mine.data ?? []).length > 0;
  const peekKept = peek?.kind === 'kept' ? keptOf(salesOf(peek.id)) : null;
  const peekName = peek?.kind === 'kept' ? (entities.find((e) => e.id === peek.id)?.name ?? '') : '';
  const preview: Preview | null = !peek
    ? null
    : peek.kind === 'kept'
      ? hasFacts(peekKept)
        ? keptPreview(peekName, peekKept, peekSales.data, peekOut.data, formatMessageTime(new Date(stripNow).toISOString()))
        : null
      : peek.kind === 'total'
        ? totalPreview(allKept)
        : savedPreview(
            monthClaims(allClaims, stripNow).map((c) => ({ claim: c, saved: savedIn(c), at: claimDate(c) })),
            new Intl.DateTimeFormat('es-CO', { month: 'long' }).format(new Date(stripNow)),
          );
  const owner =
    peek?.kind === 'kept'
      ? {
          label: 'Ver el detalle en Empre Finance',
          money: true,
          onPress: () => {
            setPeek(null);
            router.push({ pathname: '/business/ledger/[id]', params: { id: peek.id } });
          },
        }
      : peek?.kind === 'saved'
        ? {
            label: 'Ver tus QR en Mis salidas',
            onPress: () => {
              setPeek(null);
              router.push('/salidas');
            },
          }
        : undefined;

  // Una carta por negocio, como los medios de pago en Finance (tablero «Mi negocio» · Perfil, 2026-11-14): la activa
  // abierta y las otras apiladas con su cabecera. La cifra es lo que te quedó hoy y se toca para ver «Así sale».
  const ordered = [...entities].sort((a, b) => (a.id === active ? -1 : b.id === active ? 1 : 0));
  const businesses = (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.eyebrow} accessibilityRole="header">
          {`MIS NEGOCIOS${entities.length > 1 ? ` · ${entities.length}` : ''}`}
        </Text>
        {entities.length > 1 && anyFacts ? (
          <Pressable accessibilityRole="button" onPress={() => setPeek({ kind: 'total' })} hitSlop={10}>
            <Text style={styles.hint}>{`Ver los ${entities.length} ›`}</Text>
          </Pressable>
        ) : null}
      </View>
      {/* Con varios: lo que te quedó entre todos. Con uno, la carta ya lo dice */}
      {entities.length > 1 && anyFacts ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Te quedó hoy entre tus ${entities.length} negocios: ${formatPesos(allLeft)}. Ver así sale`} onPress={() => setPeek({ kind: 'total' })} style={styles.totalRow}>
          <Text style={styles.totalValue}>{formatPesos(allLeft)}</Text>
          <Text style={styles.totalLabel}>{`te quedó hoy entre los ${entities.length}`}</Text>
        </Pressable>
      ) : null}
      {mine.isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : mine.isError ? (
        <Text style={styles.empty}>No pudimos cargar tus negocios.</Text>
      ) : (
        <View>
          {ordered.map((entity, i) => {
            const isActive = entity.id === active;
            const k = keptOf(salesOf(entity.id));
            const reqs = inbox.byEntity.get(entity.id)?.requests ?? 0;
            const sub = [entity.category_name, entity.verification_status === 'verified' ? null : verificationLabel(entity.verification_status).toLocaleLowerCase('es')].filter(Boolean).join(' · ');
            // Sin hechos, sin cifra: nunca un $0.
            const amount = hasFacts(k) ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`${entity.name}: te quedó hoy ${formatPesos(k.left)}. Ver así sale`} onPress={() => setPeek({ kind: 'kept', id: entity.id })} hitSlop={8} style={styles.amountBox}>
                <Text style={[styles.amount, !isActive && styles.amountSmall]}>{formatPesos(k.left)}</Text>
                {isActive ? <Text style={styles.amountLabel}>te quedó hoy</Text> : null}
              </Pressable>
            ) : (
              <Text style={styles.noFacts}>Sin ventas hoy</Text>
            );
            if (!isActive) {
              return (
                <Pressable
                  key={entity.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${entity.name}. Toca para trabajar en él`}
                  onPress={() => pick(entity.id)}
                  style={[styles.closed, { backgroundColor: i % 2 ? colors.glowTop : colors.selectedSoft }, i === 1 ? styles.closedFirst : styles.closedNext, i < ordered.length - 1 && styles.closedCovered]}
                >
                  <View style={styles.bizHead}>
                    <BizLogo uri={entity.profile_url} name={entity.name} size={36} />
                    <View style={styles.bizText}>
                      <Text style={styles.bizNameSmall} numberOfLines={1}>
                        {entity.name}
                      </Text>
                      <Text style={styles.bizCat} numberOfLines={1}>
                        {sub}
                      </Text>
                    </View>
                    {amount}
                  </View>
                </Pressable>
              );
            }
            const hub = () => router.push({ pathname: '/business/hub/[id]', params: { id: entity.id } });
            return (
              <View key={entity.id} style={styles.biz}>
                <View style={styles.bizHead}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`${entity.name}. Abrir mi negocio`} onPress={hub} style={styles.bizHeadMain}>
                    <BizLogo uri={entity.profile_url} name={entity.name} size={42} />
                    <View style={styles.bizText}>
                      <Text style={styles.bizName} numberOfLines={1}>
                        {entity.name}
                      </Text>
                      <Text style={styles.bizCat} numberOfLines={1}>
                        {sub}
                      </Text>
                    </View>
                  </Pressable>
                  {amount}
                </View>
                {hasFacts(k) ? (
                  <View style={styles.wells}>
                    {[
                      { key: 'Entró', v: formatPesos(k.entered) },
                      { key: 'Salió', v: formatPesos(k.out) },
                      { key: 'Ventas', v: String(k.count) },
                    ].map((w) => (
                      <Pressable key={w.key} accessibilityRole="button" accessibilityLabel={`${w.key}: ${w.v}. Ver así sale`} onPress={() => setPeek({ kind: 'kept', id: entity.id })} style={styles.well}>
                        <Text style={styles.wellKey}>{w.key}</Text>
                        <Text style={styles.wellValue}>{w.v}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                <View style={styles.quickRow}>
                  <QuickAction icon="cash-outline" label="Vender" onPress={() => router.push({ pathname: '/business/ledger/sale/[id]', params: { id: entity.id } })} />
                  <QuickAction icon="scan-outline" label="Canjear" onPress={() => router.push('/business/scan')} />
                  <QuickAction icon="calendar-outline" label="Agenda" onPress={() => router.push({ pathname: '/business/agenda/[id]', params: { id: entity.id } })} />
                </View>
                <View style={styles.bizFoot}>
                  {reqs > 0 ? (
                    <Pressable accessibilityRole="link" accessibilityLabel={`${entity.name}: ${requestsLabel(reqs)}. Ver agenda`} onPress={() => router.push({ pathname: '/business/agenda/[id]', params: { id: entity.id } })} style={styles.footReq}>
                      <View style={styles.footDot} />
                      <Text style={styles.footText} numberOfLines={1}>
                        {requestsLabel(reqs)}
                      </Text>
                    </Pressable>
                  ) : (
                    <View style={{ flex: 1 }} />
                  )}
                  <Pressable accessibilityRole="link" onPress={hub} hitSlop={10}>
                    <Text style={styles.footLink}>Abrir mi negocio ›</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}
      {/* Sumar otro: la última carta, punteada */}
      <Pressable accessibilityRole="button" onPress={() => router.push('/business/new')} style={styles.createBtn}>
        <Text style={styles.createText}>+ Sumar otro negocio</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.screen}>
      <ScreenGlow />
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingTop: insets.top + 18 }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cambiar foto de perfil" onPress={() => void changePhoto()} style={styles.avatarButton}>
          <Avatar uri={user.profile_picture_url} name={user.name} size={64} />
          <View style={styles.avatarBadge}>{uploadingPhoto ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="camera" size={13} color="#fff" />}</View>
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.name} numberOfLines={1}>
            {user.name}
          </Text>
          <Text style={styles.contact} numberOfLines={1}>
            {user.phone || user.email}
          </Text>
        </View>
      </View>

      {hasBusiness || mine.isLoading ? businesses : null}
      <AsiSaleSheet
        preview={preview}
        onClose={() => setPeek(null)}
        owner={owner}
        onRow={
          peek?.kind === 'total'
            ? (id) => {
                // Cada negocio del total lleva a su propio detalle en Finance.
                setPeek(null);
                router.push({ pathname: '/business/ledger/[id]', params: { id } });
              }
            : undefined
        }
      />

      <View style={styles.section}>
        <Text style={styles.eyebrow} accessibilityRole="header">
          LO TUYO
        </Text>
        <View style={styles.tiles}>
          <Tile
            icon="qr-code-outline"
            value={month.outings ? String(month.outings) : null}
            label={month.outings ? `${month.outings === 1 ? 'salida' : 'salidas'} este mes${month.saved ? ` · ${formatPesos(month.saved)} ahorrados` : ''}` : 'Mis salidas'}
            sub={month.outings ? undefined : 'Tus QR y tus planes'}
            onPress={() => (month.saved ? setPeek({ kind: 'saved' }) : router.push('/salidas'))}
          />
          {FEATURES.agenda ? (
            <Tile
              icon="calendar-outline"
              value={comingAppts ? String(comingAppts) : null}
              label={comingAppts ? (comingAppts === 1 ? 'cita que viene' : 'citas que vienen') : 'Mis citas'}
              sub={comingAppts ? undefined : 'Las que pides a un negocio'}
              onPress={() => router.push('/appointments')}
            />
          ) : null}
          <Tile
            icon="heart-outline"
            value={favCount ? String(favCount) : null}
            label={favCount ? (favCount === 1 ? 'negocio que sigues' : 'negocios que sigues') : 'Negocios que sigo'}
            sub={favCount ? undefined : 'Lo que publican y sus ofertas'}
            onPress={() => router.push('/favorites')}
          />
          <Tile icon="shield-checkmark-outline" value={null} label="Lo que Agent sabe de ti" sub="Qué recuerda y qué nunca guarda" onPress={() => router.push('/agent/privacy')} />
        </View>
      </View>

      {!hasBusiness && !mine.isLoading ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/business/new')} style={styles.invite}>
          <Ionicons name="storefront-outline" size={22} color={colors.ink} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.rowLabel}>¿Vendes algo o das un servicio?</Text>
            <Text style={styles.rowSub}>Súmalo gratis en 2 min. Sigues siendo cliente igual.</Text>
          </View>
          <Text style={styles.inviteLink}>Crear ›</Text>
        </Pressable>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.eyebrow} accessibilityRole="header">
          AJUSTES
        </Text>
        <View style={styles.group}>
          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <Ionicons name="analytics-outline" size={19} color={colors.muted} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>Medición anónima de uso</Text>
              <Text style={styles.rowSub}>Ayuda a mejorar Empre sin identificarte</Text>
            </View>
            <Switch
              value={analyticsOn}
              onValueChange={(on) => {
                setAnalyticsOn(on);
                void setAnalyticsEnabled(on);
              }}
              trackColor={{ true: colors.verified, false: colors.line }}
              thumbColor="#fff"
              accessibilityLabel="Medición anónima de uso"
            />
          </View>
          <InterestsRow />
          <MenuRow icon="map-outline" label="Cómo usar el mapa" onPress={() => router.push({ pathname: '/map', params: { guide: '1' } })} />
          {user.role === 'admin' ? <MenuRow icon="settings-outline" label="Panel de administración" onPress={() => router.push('/admin')} /> : null}
          <MenuRow danger icon="log-out-outline" label="Cerrar sesión" onPress={() => void signOut()} />
        </View>
        {version ? <Text style={styles.version}>Empre · versión {version}</Text> : null}
      </View>
      </ScrollView>
    </View>
  );
}

/**
 * «Para ti» aprende de lo que buscas y miras, solo en este teléfono. Aquí se ve qué cree que te interesa y se puede
 * borrar; se confirma en la misma fila (sin ventanas), porque no se puede deshacer.
 */
function InterestsRow() {
  const signals = useInterestSignals();
  const [asking, setAsking] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [now] = useState(() => Date.now());
  const top = [...myInterests(signals, now)]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([k]) => ART_LABEL[k].toLowerCase());
  const sub = cleared && !signals.length ? 'Borrado: «Para ti» empieza de cero' : top.length ? `Ahora cree que te gusta: ${top.join(' y ')}` : 'Aún no hay nada: aprende de lo que buscas';
  return (
    <View style={styles.rowLine}>
      <View style={styles.row}>
        <View style={styles.rowIcon}>
          <Ionicons name="search-outline" size={19} color={colors.muted} />
        </View>
        <View style={styles.rowText}>
          <Text style={styles.rowLabel}>Lo que te interesa</Text>
          <Text style={styles.rowSub}>{sub}</Text>
          <Text style={styles.rowSub}>Para «Para ti» en Inicio · solo en este teléfono</Text>
        </View>
        {signals.length && !asking ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Borrar lo que te interesa" onPress={() => setAsking(true)} hitSlop={6} style={styles.clearBtn}>
            <Text style={styles.clearText}>Borrar</Text>
          </Pressable>
        ) : null}
      </View>
      {asking ? (
        <View style={styles.confirm} accessibilityLiveRegion="polite">
          <Text style={styles.confirmText}>Se borra lo que buscaste y miraste. No se puede deshacer.</Text>
          <View style={styles.confirmBtns}>
            <Pressable accessibilityRole="button" onPress={() => setAsking(false)} style={[styles.confirmBtn, styles.confirmKeep]}>
              <Text style={styles.confirmKeepText}>Cancelar</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sí, borrar lo que te interesa"
              onPress={() => {
                void clearInterests();
                setAsking(false);
                setCleared(true);
              }}
              style={[styles.confirmBtn, styles.confirmGo]}
            >
              <Text style={styles.confirmGoText}>Borrar</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function MenuRow({ icon, label, sub, onPress, first, danger }: { icon: keyof typeof Ionicons.glyphMap; label: string; sub?: string; onPress: () => void; first?: boolean; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, !first && styles.rowLine, pressed && { opacity: 0.8 }]}>
      <View style={[styles.rowIcon, danger && { backgroundColor: colors.primarySoft }]}>
        <Ionicons name={icon} size={19} color={danger ? colors.danger : colors.muted} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, danger && { color: colors.danger }]}>{label}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      {danger ? null : <Ionicons name="chevron-forward" size={18} color={colors.placeholder} />}
    </Pressable>
  );
}

function QuickAction({ symbol, icon, label, onPress }: { symbol?: EmpreProduct; icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.quick, pressed && { opacity: 0.8 }]}>
      {symbol ? <EmpreSymbol product={symbol} size={20} /> : <Ionicons name={icon} size={16} color={colors.ink} />}
      <Text style={styles.quickText}>{label}</Text>
    </Pressable>
  );
}

function BizLogo({ uri, name, size }: { uri?: string; name: string; size: number }) {
  return (
    <View style={[styles.bizIcon, { width: size, height: size, borderRadius: size * 0.28 }]}>
      {uri ? <Avatar uri={uri} name={name} size={size} /> : <Ionicons name="storefront-outline" size={size * 0.46} color={colors.ink} />}
    </View>
  );
}

/** Una tarjeta de «Lo tuyo»: el número (si hay) y qué es. Sin hechos, sin número: solo el nombre. */
function Tile({ icon, value, label, sub, onPress }: { icon: keyof typeof Ionicons.glyphMap; value: string | null; label: string; sub?: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={[value, label, sub].filter(Boolean).join(' ')} onPress={onPress} style={({ pressed }) => [styles.tile, pressed && { opacity: 0.85 }]}>
      <Ionicons name={icon} size={18} color={colors.muted} />
      {value ? <Text style={styles.tileValue}>{value}</Text> : null}
      <Text style={value ? styles.tileLabel : styles.tileTitle}>{label}</Text>
      {sub ? <Text style={styles.tileLabel}>{sub}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 120, gap: 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerInfo: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 20, lineHeight: 24, fontFamily: fonts.display.bold, color: colors.ink },
  contact: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.faint },
  avatarButton: { width: 64, height: 64, borderRadius: 32 },
  avatarBadge: { position: 'absolute', right: -3, bottom: -3, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.bg, backgroundColor: colors.primary },
  section: { gap: 8 },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, alignSelf: 'flex-start', minHeight: 44 },
  totalValue: { fontSize: 28, lineHeight: 34, fontFamily: fonts.display.bold, color: colors.finance, fontVariant: ['tabular-nums'] },
  totalLabel: { fontSize: 12.5, fontFamily: fonts.ui.medium, color: colors.muted },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '48.6%', minHeight: 104, padding: 12, gap: 4, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  tileValue: { fontSize: 20, lineHeight: 24, fontFamily: fonts.display.bold, color: colors.ink, fontVariant: ['tabular-nums'] },
  tileTitle: { fontSize: 14, lineHeight: 18, fontFamily: fonts.ui.extrabold, color: colors.ink },
  tileLabel: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.ui.medium, color: colors.muted },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  eyebrow: { fontSize: 12, letterSpacing: 1.2, fontFamily: fonts.ui.extrabold, color: colors.faint },
  hint: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.faint },
  empty: { fontSize: 14, fontFamily: fonts.ui.medium, color: colors.muted },
  // La carta abierta (la del negocio activo) y las cerradas, apiladas: la de abajo tapa el pie de la de arriba.
  biz: { padding: 14, gap: 12, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, shadowColor: colors.ink, shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  bizHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bizHeadMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  bizIcon: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selectedSoft },
  bizText: { flex: 1, minWidth: 0, gap: 2 },
  bizName: { fontSize: 16, lineHeight: 20, fontFamily: fonts.display.bold, color: colors.ink },
  bizNameSmall: { fontSize: 14.5, lineHeight: 18, fontFamily: fonts.ui.extrabold, color: colors.ink },
  bizCat: { fontSize: 12.5, fontFamily: fonts.ui.medium, color: colors.muted },
  amountBox: { alignItems: 'flex-end', minHeight: 44, justifyContent: 'center' },
  amount: { fontSize: 22, lineHeight: 26, fontFamily: fonts.display.bold, color: colors.finance, fontVariant: ['tabular-nums'] },
  amountSmall: { fontSize: 16, lineHeight: 20 },
  amountLabel: { fontSize: 11.5, fontFamily: fonts.ui.medium, color: colors.muted },
  noFacts: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  wells: { flexDirection: 'row', gap: 6 },
  well: { flex: 1, minWidth: 0, minHeight: 48, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.bg },
  wellKey: { fontSize: 11.5, fontFamily: fonts.ui.medium, color: colors.muted },
  wellValue: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink, fontVariant: ['tabular-nums'] },
  quickRow: { flexDirection: 'row', gap: 6 },
  quick: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  quickText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  bizFoot: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line },
  footReq: { flex: 1, minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 8 },
  footDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.brand },
  footText: { flexShrink: 1, fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.ink },
  footLink: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  closed: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 20, borderWidth: 1, borderColor: colors.line },
  closedFirst: { marginTop: 10 },
  closedNext: { marginTop: -20 },
  closedCovered: { paddingBottom: 32 },
  createBtn: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.line },
  createText: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.muted },
  invite: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.line },
  inviteLink: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
  group: { paddingVertical: 2, paddingHorizontal: 14, borderRadius: 20, backgroundColor: colors.surface },
  row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  rowLine: { borderTopWidth: 1, borderTopColor: colors.selectedSoft },
  rowIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selectedSoft },
  rowText: { flex: 1, minWidth: 0, gap: 1 },
  rowLabel: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  rowSub: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.ui.medium, color: colors.faint },
  clearBtn: { minHeight: 44, minWidth: 44, paddingHorizontal: 12, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  clearText: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.ink },
  confirm: { gap: 10, padding: 12, marginBottom: 10, borderRadius: 14, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line },
  confirmText: { fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.ink },
  confirmBtns: { flexDirection: 'row', gap: 8 },
  confirmBtn: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  confirmKeep: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  confirmKeepText: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink },
  confirmGo: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.brandRef },
  confirmGoText: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink },
  version: { paddingTop: 6, fontSize: 12, fontFamily: fonts.ui.medium, color: colors.faint, textAlign: 'center' },
});
