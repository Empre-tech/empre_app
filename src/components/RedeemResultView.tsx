import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RedeemResult } from '@/api/types';
import { formatAgo, formatCurrency, formatSlotsLeft } from '@/lib/offer';
import { colors, fonts, radius, spacing } from '@/theme';
import { hapticError, hapticSuccess, hapticWarning } from '@/lib/haptics';

// Verde oscuro: con texto blanco pasa AA (≈ 5,3:1); el success de la marca no.
const OK_GREEN = '#1F7A44';

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
        why: r.redeemed_at ? `Este código se usó ${formatAgo(r.redeemed_at)}.` : 'Este código ya se usó.',
        hint: 'No entregues la oferta. Si insiste, pídele que te muestre «Canjeado» en su pantalla.',
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
}

/**
 * Resultado del escáner a pantalla completa. El color es la primera señal:
 * verde = entrega, rojo suave = no entregues, ámbar/gris = reintenta o
 * explica. Cada rechazo dice por qué y qué hacer.
 */
export function RedeemResultView({ result, offline, onNext, onRetry }: Props) {
  const insets = useSafeAreaInsets();
  // Una vibración por resultado: válido, rechazado o sin conexión (quien escanea no siempre mira la pantalla).
  useEffect(() => {
    if (offline) hapticWarning();
    else if (result) (result.valid ? hapticSuccess : hapticError)();
  }, [result, offline]);
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
      ? { tone: 'ok', icon: 'checkmark', title: 'VÁLIDO', why: 'Entrega esta oferta' }
      : rejectionLook(result!);

  const ok = look.tone === 'ok';
  const toneStyle = TONES[look.tone];
  const textColor = ok ? '#fff' : colors.ink;
  const mutedColor = ok ? 'rgba(255,255,255,0.92)' : '#4A5A70';

  return (
    <View
      style={[styles.root, toneStyle.bg, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
    >
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.iconWrap, toneStyle.icon]}>
          <Ionicons name={look.icon} size={48} color={ok ? '#fff' : toneStyle.glyph} />
        </View>
        <Text style={[ok ? styles.titleOk : styles.title, { color: textColor }]}>{look.title}</Text>
        <Text style={[styles.why, { color: mutedColor }]}>{look.why}</Text>

        {result && ok ? <ValidDetails result={result} /> : null}
        {result && !ok && !offline ? <RejectedFacts result={result} /> : null}

        {look.hint ? (
          <View style={styles.hint}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.ink} />
            <Text style={styles.hintText}>{look.hint}</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.actions}>
        {offline ? (
          <>
            <Pressable accessibilityRole="button" onPress={onRetry} style={[styles.btn, styles.btnPrimary]}>
              <Text style={styles.btnPrimaryText}>Reintentar</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onNext} style={[styles.btn, styles.btnGhost]}>
              <Text style={styles.btnGhostText}>Cancelar</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={onNext}
            style={[styles.btn, ok ? styles.btnLight : styles.btnDark]}
          >
            <Text style={[styles.btnText, { color: ok ? OK_GREEN : '#fff' }]}>
              {ok ? 'Escanear siguiente' : 'Escanear otro'}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** Qué entregar, a quién y qué recordar antes de entregar. */
function ValidDetails({ result }: { result: RedeemResult }) {
  const price = formatCurrency(result.offer_price);
  const slots = typeof result.slots_left === 'number' ? formatSlotsLeft(result.slots_left) : null;
  return (
    <>
      <View style={styles.deliver}>
        <Text style={styles.deliverLabel}>ENTREGAR</Text>
        <Text style={styles.deliverTitle}>{result.offer_title}</Text>
        {price ? <Text style={styles.deliverPrice}>{price}</Text> : null}
      </View>

      {result.client_name ? (
        <View style={styles.client}>
          <View style={styles.clientAvatar}>
            <Text style={styles.clientInitials}>{initials(result.client_name)}</Text>
          </View>
          <View style={styles.clientText}>
            <Text style={styles.clientLabel}>CLIENTE</Text>
            <Text style={styles.clientName}>{result.client_name}</Text>
            <Text style={styles.clientMeta}>
              {result.claimed_at ? `Reclamó ${formatAgo(result.claimed_at)} · ` : ''}pide su nombre
            </Text>
          </View>
        </View>
      ) : null}

      {result.offer_conditions || slots ? (
        <View style={styles.verify}>
          <Ionicons name="alert-circle-outline" size={18} color="#fff" />
          <Text style={styles.verifyText}>
            {result.offer_conditions ? `Recuerda la condición: ${result.offer_conditions}. ` : ''}
            {slots ?? ''}
          </Text>
        </View>
      ) : null}
    </>
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

/** Colores de cada tono: fondo, círculo del ícono y color del glifo. */
const TONES: Record<Tone, { bg: ViewStyle; icon: ViewStyle; glyph: string }> = {
  ok: { bg: { backgroundColor: OK_GREEN }, icon: { backgroundColor: 'rgba(255,255,255,0.22)' }, glyph: '#fff' },
  bad: { bg: { backgroundColor: '#FBEDED' }, icon: { backgroundColor: '#F6CFCF' }, glyph: colors.danger },
  warn: { bg: { backgroundColor: colors.accentSoft }, icon: { backgroundColor: '#FAD9B8' }, glyph: colors.accentInk },
  grey: { bg: { backgroundColor: '#EDF1F6' }, icon: { backgroundColor: '#D7DFEA' }, glyph: '#4A5A70' },
};

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, paddingHorizontal: spacing.xl },
  scroll: { alignItems: 'center', paddingTop: spacing.xl, paddingBottom: spacing.lg, gap: spacing.sm, flexGrow: 1 },
  iconWrap: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  title: { fontSize: 26, fontFamily: fonts.display.bold, textAlign: 'center' },
  titleOk: { fontSize: 34, fontFamily: fonts.display.bold, textAlign: 'center', letterSpacing: 0.5 },
  why: { fontSize: 14.5, fontFamily: fonts.ui.semibold, textAlign: 'center', lineHeight: 21 },

  deliver: { alignSelf: 'stretch', backgroundColor: '#fff', borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.md },
  deliverLabel: { fontSize: 11, fontFamily: fonts.ui.bold, letterSpacing: 1, color: colors.muted },
  deliverTitle: { fontSize: 20, fontFamily: fonts.display.bold, color: colors.ink },
  deliverPrice: { fontSize: 17, fontFamily: fonts.display.bold, color: colors.primaryDark },

  client: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  clientAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  clientInitials: { fontSize: 17, fontFamily: fonts.display.bold, color: OK_GREEN },
  clientText: { flex: 1 },
  clientLabel: { fontSize: 11, fontFamily: fonts.ui.bold, letterSpacing: 1, color: 'rgba(255,255,255,0.88)' },
  clientName: { fontSize: 22, fontFamily: fonts.display.bold, color: '#fff' },
  clientMeta: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: 'rgba(255,255,255,0.92)' },

  verify: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  verifyText: { flex: 1, fontSize: 13, fontFamily: fonts.ui.semibold, color: '#fff', lineHeight: 19 },

  facts: { alignSelf: 'stretch', backgroundColor: '#fff', borderRadius: radius.lg, paddingHorizontal: spacing.md, marginTop: spacing.sm },
  factRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  factLabel: { fontSize: 13, fontFamily: fonts.ui.regular, color: colors.muted },
  factValue: { flexShrink: 1, fontSize: 13, fontFamily: fonts.ui.bold, color: colors.ink, textAlign: 'right' },

  hint: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  hintText: { flex: 1, fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.ink, lineHeight: 19 },

  actions: { gap: spacing.sm },
  btn: { minHeight: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  btnText: { fontSize: 16, fontFamily: fonts.ui.extrabold },
  btnLight: { backgroundColor: '#fff' },
  btnDark: { backgroundColor: colors.ink },
  btnPrimary: { backgroundColor: colors.primary },
  btnPrimaryText: { fontSize: 16, fontFamily: fonts.ui.extrabold, color: '#fff' },
  btnGhost: { backgroundColor: colors.primarySoft },
  btnGhostText: { fontSize: 15, fontFamily: fonts.ui.bold, color: colors.primaryDark },
});
