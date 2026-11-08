import { Ionicons } from '@expo/vector-icons';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useRef, useState } from 'react';
import { ledgerApi } from '@/api/ledger';
import type { RedeemResult } from '@/api/types';
import { queueVoid } from '@/ledger/ledgerStore';
import { formatPesos, METHOD_LABEL, type PayMethod } from '@/lib/ledger';
import { formatAgo, formatCurrency, formatSlotsLeft } from '@/lib/offer';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { EmpreSymbol } from '@/components/EmpreSymbol';
import { colors, fonts } from '@/theme';

type Tone = 'ok' | 'bad' | 'warn' | 'grey';

interface Look {
  tone: Tone;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  /** Por qué, en una línea. */
  why: string;
  /** Qué hacer ahora. */
  hint?: string;
}

/** Pantalla, título y siguiente paso para cada causa de rechazo. */
function rejectionLook(r: RedeemResult): Look {
  switch (r.reason_code) {
    case 'ALREADY_REDEEMED':
      return {
        tone: 'bad',
        icon: 'close',
        title: 'Ya fue canjeado',
        why: r.redeemed_at ? `Este código se usó ${formatAgo(r.redeemed_at)}. No lo entregues otra vez.` : 'Este código ya se usó. No lo entregues otra vez.',
        hint: 'Su pantalla sigue mostrando que ya lo usó: si insiste, pídele que te la enseñe.',
      };
    case 'EXPIRED':
      return {
        tone: 'warn',
        icon: 'time-outline',
        title: r.expires_at ? `Venció ${formatAgo(r.expires_at)}` : 'Venció',
        why: 'El cliente no llegó a tiempo y el cupo ya se liberó.',
        hint: 'Puede reclamar de nuevo si aún quedan cupos.',
      };
    case 'CANCELED':
      return {
        tone: 'grey',
        icon: 'close',
        title: 'El cliente lo canceló',
        why: 'Liberó su cupo antes de venir.',
        hint: 'Puede reclamar de nuevo.',
      };
    case 'WRONG_BUSINESS':
      return {
        tone: 'bad',
        icon: 'close',
        title: 'Es de otro negocio',
        why: 'Este código pertenece a otro negocio.',
        hint: 'Pídele al cliente que vaya al negocio correcto.',
      };
    case 'NOT_FOUND':
      return {
        tone: 'grey',
        icon: 'search',
        title: 'No encontramos ese código',
        why: 'Revisa las letras: los códigos no usan 0, O, 1, I ni L.',
        hint: 'Escríbelo otra vez o escanea de nuevo.',
      };
    default:
      // Servidor anterior: sin reason_code, se muestra el texto que mande.
      return { tone: 'grey', icon: 'close', title: 'No válido', why: r.reason ?? 'No pudimos validar el código.' };
  }
}

interface Props {
  /** Resultado del servidor; null mientras no haya. */
  result: RedeemResult | null;
  /** Sin conexión: no se pudo validar y no se canjeó nada. */
  offline: boolean;
  onNext: () => void;
  onRetry: () => void;
  /** Abrir Finanzas del negocio. */
  onFinance?: (entityId: string) => void;
  /** Modo práctica: nada se registra y lo dice. */
  practice?: boolean;
}

/**
 * Resultado del escáner a pantalla completa. El color es la primera señal:
 * verde = entrega, rojo suave = no entregues, ámbar/gris = reintenta o
 * explica. Cada rechazo dice por qué y qué hacer.
 */
export function RedeemResultView({ result, offline, onNext, onRetry, onFinance, practice = false }: Props) {
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const pop = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if ((!result && !offline) || reduce) {
      pop.setValue(1);
      return;
    }
    pop.setValue(0);
    const s = Animated.spring(pop, { toValue: 1, friction: 6, tension: 85, useNativeDriver: true });
    s.start();
    return () => s.stop();
  }, [result, offline, reduce, pop]);

  if (!result && !offline) return null;

  const look: Look = offline
    ? {
        tone: 'grey',
        icon: 'cloud-offline-outline',
        title: 'Sin conexión',
        why: 'Necesitamos internet para validar y evitar que un código se use dos veces.',
        hint: 'El cliente conserva su QR: no se ha canjeado nada. Reconecta y reintenta.',
      }
    : result!.valid
      ? { tone: 'ok', icon: 'checkmark', title: 'VÁLIDO', why: 'Entrega la oferta y cobra el precio de la oferta.' }
      : rejectionLook(result!);

  const ok = look.tone === 'ok';
  const hour = new Date().toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' }).replace(/\s*([ap])\.\s*m\.?/i, ' $1m');
  const discAnim = reduce
    ? undefined
    : {
        opacity: pop.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.2, 1, 1] }),
        transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.65, 1] }) }],
      };

  return (
    <View style={styles.root} accessibilityRole="alert" accessibilityLiveRegion="assertive">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.band, { paddingTop: insets.top + 22, backgroundColor: ok ? colors.verified : colors.ink }]}>
          <View style={styles.bandTop}>
            <Text style={styles.bandSmall}>{practice ? 'Práctica · no cuenta' : 'Canje'}</Text>
            <Text style={styles.bandSmall}>{hour}</Text>
          </View>
          {ok ? (
            <Animated.View style={[styles.discOk, discAnim]}>
              <EmpreSymbol product="check" size={64} />
            </Animated.View>
          ) : (
            <Animated.View style={[styles.discBad, discAnim]}>
              <Ionicons name={look.icon} size={38} color="#fff" />
            </Animated.View>
          )}
          <Text style={ok ? styles.titleOk : styles.title}>{look.title}</Text>
          <Text style={styles.why}>{look.why}</Text>
        </View>

        <View style={styles.cards}>
          {result && ok ? <ValidDetails result={result} /> : null}
          {result && !ok && !offline ? <RejectedFacts result={result} /> : null}
          {look.hint ? (
            <View style={styles.hint}>
              <Ionicons name="alert-circle-outline" size={18} color={colors.ink} />
              <Text style={styles.hintText}>{look.hint}</Text>
            </View>
          ) : null}
          {result && ok && !practice ? <SaleReceipt key={result.claim_id} result={result} onFinance={onFinance} /> : null}
          {result && ok && practice ? (
            <View style={styles.sale}>
              <Text style={styles.saleTitle}>Aquí Empre Finance registra la venta</Text>
              <Text style={styles.saleSub}>En práctica no se registra nada ni se toca el inventario.</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View style={[styles.actions, { paddingBottom: insets.bottom + 22 }]}>
        {offline ? (
          <>
            <Pressable accessibilityRole="button" onPress={onRetry} style={styles.btn}>
              <Text style={styles.btnText}>Reintentar</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onNext} style={styles.btnGhost}>
              <Text style={styles.btnGhostText}>Cancelar</Text>
            </Pressable>
          </>
        ) : (
          <Pressable accessibilityRole="button" onPress={onNext} style={styles.btn}>
            <Text style={styles.btnText}>{ok ? (practice ? 'Listo, ya sé canjear' : 'Listo, escanear otro') : 'Escanear otro código'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** Qué entregar, cuánto cobrar y a quién. */
function ValidDetails({ result }: { result: RedeemResult }) {
  const price = formatCurrency(result.offer_price);
  const slots = typeof result.slots_left === 'number' ? formatSlotsLeft(result.slots_left) : null;
  return (
    <View style={styles.deliver}>
      <Text style={styles.deliverLabel}>ENTREGA</Text>
      <Text style={styles.deliverTitle}>{result.offer_title}</Text>
      {price ? (
        <View style={styles.charge}>
          <Text style={styles.chargeLabel}>Cobra</Text>
          <Text style={styles.chargeValue}>{price}</Text>
        </View>
      ) : null}
      {result.client_name ? (
        <View style={styles.client}>
          <View style={styles.clientAvatar}>
            <Text style={styles.clientInitials}>{initials(result.client_name)}</Text>
          </View>
          <View style={styles.clientText}>
            <Text style={styles.clientName}>{result.client_name}</Text>
            <Text style={styles.clientMeta}>{result.claimed_at ? `Reclamó ${formatAgo(result.claimed_at)} · ` : ''}pide su nombre</Text>
          </View>
        </View>
      ) : null}
      {result.offer_conditions || slots ? (
        <Text style={styles.verifyText}>
          {result.offer_conditions ? `Recuerda la condición: ${result.offer_conditions}. ` : ''}
          {slots ?? ''}
        </Text>
      ) : null}
    </View>
  );
}

const PAY_METHODS: PayMethod[] = ['cash', 'transfer', 'card'];

/** Cómo pagó: la venta ya quedó en Empre Finance; aquí solo se ajusta el medio o se anula. */
function SaleReceipt({ result, onFinance }: { result: RedeemResult; onFinance?: (entityId: string) => void }) {
  const [method, setMethod] = useState<PayMethod>('cash');
  const [voided, setVoided] = useState(false);
  const [error, setError] = useState('');
  const entityId = result.entity_id;
  const saleId = result.sale_id;
  if (!saleId || !entityId) {
    return (
      <View style={styles.sale}>
        <Text style={styles.saleTitle}>No quedó en tus ventas</Text>
        <Text style={styles.saleSub}>Esta oferta no dice cuánto cobrar en pesos. Si cobraste algo, anótalo como venta.</Text>
        {entityId && onFinance ? (
          <Pressable accessibilityRole="button" onPress={() => onFinance(entityId)} style={styles.saleLink}>
            <Text style={styles.saleLinkText}>Ir a Finanzas</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }
  const pick = (next: PayMethod) => {
    const prev = method;
    setMethod(next);
    setError('');
    ledgerApi.setSaleMethod(entityId, saleId, next).catch(() => {
      setMethod(prev);
      setError('No pudimos cambiarlo. Revisa tu conexión e inténtalo otra vez.');
    });
  };
  if (voided) {
    return (
      <View style={styles.sale} accessibilityLiveRegion="polite">
        <Text style={styles.saleTitle}>Venta anulada</Text>
        <Text style={styles.saleSub}>Salió de tus números y el inventario volvió. El canje del cliente sigue usado.</Text>
      </View>
    );
  }
  return (
    <View style={styles.sale}>
      <Text style={styles.saleLabel}>¿CÓMO TE PAGÓ?</Text>
      <View style={styles.saleChips}>
        {PAY_METHODS.map((m) => (
          <Pressable key={m} accessibilityRole="button" accessibilityState={{ selected: method === m }} onPress={() => pick(m)} style={[styles.saleChip, method === m && styles.saleChipOn]}>
            <Text style={styles.saleChipText}>{METHOD_LABEL[m]}</Text>
          </Pressable>
        ))}
      </View>
      {error ? <Text style={styles.saleError}>{error}</Text> : null}
      <View style={styles.saleSync}>
        <EmpreSymbol product="offers" size={24} />
        <View style={styles.saleLine} />
        <EmpreSymbol product="finance" size={24} />
        <View style={styles.saleSyncText}>
          <Text style={styles.saleTitle} accessibilityLiveRegion="polite">
            Empre Finance registró la venta
          </Text>
          <Text style={styles.saleSub}>
            {formatPesos(result.sale_total ?? 0)} · {METHOD_LABEL[method]}. No tienes que anotarlo.
          </Text>
        </View>
      </View>
      <View style={styles.saleActions}>
        {onFinance ? (
          <Pressable accessibilityRole="button" onPress={() => onFinance(entityId)} style={styles.saleLink}>
            <Text style={styles.saleLinkText}>Ver</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Anular la venta de este canje"
          onPress={() => {
            queueVoid('sale', entityId, saleId, 'Anulada al canjear');
            setVoided(true);
          }}
          style={styles.saleLink}
        >
          <Text style={styles.saleLinkText}>Anular</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Contexto del reclamo rechazado (solo llega para reclamos del propio negocio). */
function RejectedFacts({ result }: { result: RedeemResult }) {
  const rows: [string, string][] = [];
  if (result.offer_title) rows.push(['Oferta', result.offer_title]);
  if (result.client_name) rows.push(['Cliente', result.client_name]);
  if (result.redeemed_at) rows.push(['Canjeado', formatAgo(result.redeemed_at)]);
  if (rows.length === 0) return null;
  return (
    <View style={styles.facts}>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.factRow}>
          <Text style={styles.factLabel}>{label}</Text>
          <Text style={styles.factValue}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, backgroundColor: colors.bg },
  scroll: { flexGrow: 1 },
  band: { alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 32 },
  bandTop: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bandSmall: { fontSize: 13, fontFamily: fonts.ui.bold, color: 'rgba(255,255,255,0.9)' },
  discOk: { width: 84, height: 84, marginTop: 4, borderRadius: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  discBad: { width: 76, height: 76, marginTop: 4, borderRadius: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  titleOk: { fontSize: 40, lineHeight: 44, letterSpacing: 2.4, fontFamily: fonts.display.bold, color: '#fff', textAlign: 'center' },
  title: { fontSize: 28, lineHeight: 32, fontFamily: fonts.display.bold, color: '#fff', textAlign: 'center' },
  why: { maxWidth: 300, fontSize: 15.5, lineHeight: 22, fontFamily: fonts.ui.medium, color: 'rgba(255,255,255,0.95)', textAlign: 'center' },
  cards: { marginTop: -16, paddingHorizontal: 20, gap: 12 },
  deliver: { padding: 18, gap: 12, borderRadius: 20, backgroundColor: colors.surface, shadowColor: colors.ink, shadowOpacity: 0.1, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 4 },
  deliverLabel: { fontSize: 12, letterSpacing: 1.2, fontFamily: fonts.ui.extrabold, color: colors.faint },
  deliverTitle: { fontSize: 22, lineHeight: 25, fontFamily: fonts.display.bold, color: colors.ink },
  charge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.bg },
  chargeLabel: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.muted },
  chargeValue: { fontSize: 26, fontFamily: fonts.ui.extrabold, color: colors.ink },
  client: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  clientAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selectedSoft },
  clientInitials: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  clientText: { flex: 1, minWidth: 0 },
  clientName: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  clientMeta: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.faint },
  verifyText: { fontSize: 13, lineHeight: 19, fontFamily: fonts.ui.semibold, color: colors.accentInk },
  sale: { padding: 12, gap: 8, borderRadius: 16, borderWidth: 1.5, borderColor: colors.hairline, backgroundColor: colors.surface },
  saleLabel: { fontSize: 11, letterSpacing: 1.1, fontFamily: fonts.ui.extrabold, color: colors.faint },
  saleChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  saleChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line },
  saleChipOn: { backgroundColor: colors.selectedSoft, borderColor: colors.ink },
  saleChipText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  saleError: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.danger },
  saleSync: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  saleLine: { width: 16, height: 2, borderRadius: 1, backgroundColor: colors.line },
  saleSyncText: { flex: 1, minWidth: 0, marginLeft: 8, gap: 1 },
  saleTitle: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  saleSub: { fontSize: 12, lineHeight: 17, fontFamily: fonts.ui.medium, color: colors.faint },
  saleActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16 },
  saleLink: { minHeight: 44, justifyContent: 'center' },
  saleLinkText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
  facts: { paddingHorizontal: 18, paddingVertical: 6, borderRadius: 20, backgroundColor: colors.surface, shadowColor: colors.ink, shadowOpacity: 0.1, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 4 },
  factRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  factLabel: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  factValue: { flexShrink: 1, fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink, textAlign: 'right' },
  hint: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 16, backgroundColor: colors.surface },
  hintText: { flex: 1, fontSize: 13, lineHeight: 19, fontFamily: fonts.ui.semibold, color: colors.ink },
  actions: { gap: 8, paddingTop: 12, paddingHorizontal: 20 },
  btn: { minHeight: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: colors.primary },
  btnText: { fontSize: 17, fontFamily: fonts.ui.extrabold, color: '#fff' },
  btnGhost: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  btnGhostText: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
});
