import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmpreSymbol, type EmpreProduct } from '@/components/EmpreSymbol';
import { AnimatedFill } from '@/components/finance/FinanceMotion';
import { LOCKED_OPACITY, ProTag } from '@/components/pro/ProTag';
import { colors, fonts, softShadow, typeScale } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

/** Tapa la franja de la hora del teléfono: lo que sube al desplazar no queda debajo de ella. */
export function StatusCap() {
  const insets = useSafeAreaInsets();
  return <View pointerEvents="none" style={[styles.cap, { height: insets.top }]} />;
}

/** Arriba, igual en cada pantalla interna: volver y de qué se trata. */
export function SystemHead({ lead, name, right }: { lead: string; name?: string; right?: ReactNode }) {
  const router = useRouter();
  return (
    <View style={styles.head}>
      <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} style={styles.back}>
        <Ionicons name="chevron-back" size={20} color={colors.ink} />
      </Pressable>
      <View style={styles.headText}>
        <Text style={styles.lead}>{lead}</Text>
        <Text style={styles.name} numberOfLines={1}>
          {name ?? ' '}
        </Text>
      </View>
      {right}
    </View>
  );
}

export function SystemTitle({ children }: { children: string }) {
  return (
    <Text style={styles.title} accessibilityRole="header">
      {children}
    </Text>
  );
}

/** Una sección: su título y, si hay, un enlace al detalle. */
export function SystemSection({ title, link, onLink, children }: { title: string; link?: string; onLink?: () => void; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </Text>
        {link ? (
          <Pressable accessibilityRole="link" onPress={onLink} hitSlop={10} style={styles.linkBtn}>
            <Text style={styles.link}>{link}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export function SystemGroup({ children }: { children: ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

/** Una fila. Lo urgente lleva un punto, no otro color. Sin `onPress` es solo un dato. */
export function SystemRow({ icon, symbol, tag, product, title, sub, amount, alert, first, locked, onPress }: { icon: IconName; symbol?: EmpreProduct; tag?: string; product?: string; title: string; sub?: string; amount?: string; alert?: boolean; first?: boolean; locked?: boolean; onPress?: () => void }) {
  if (locked && onPress) {
    // De Empre Pro en Base: en gris, con la corona en lugar de la flecha; tocarla abre «Pásate a Empre Pro».
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={[title, sub, 'Es de Empre Pro'].filter(Boolean).join('. ')} accessibilityHint="Abre Pásate a Empre Pro" onPress={onPress} style={({ pressed }) => [styles.row, !first && styles.rowLine, pressed && { opacity: 0.85 }]}>
        <View style={[styles.rowLocked, { opacity: LOCKED_OPACITY }]}>
          <View style={styles.rowIcon}>
            <Ionicons name={icon} size={18} color={colors.ink} />
          </View>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>{title}</Text>
            {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
          </View>
        </View>
        <ProTag />
      </Pressable>
    );
  }
  const body = (
    <>
      <View style={styles.rowIcon}>
        {symbol ? <EmpreSymbol product={symbol} size={28} /> : <Ionicons name={icon} size={18} color={colors.ink} />}
      </View>
      <View style={styles.rowText}>
        {tag ? <Text style={styles.rowTag}>{tag}</Text> : null}
        <View style={styles.rowTop}>
          <Text style={styles.rowTitle}>{title}</Text>
          {product ? <Text style={styles.rowTag}>{product}</Text> : null}
        </View>
        {sub ? (
          <View style={styles.rowSubLine}>
            {alert ? <View style={styles.dot} /> : null}
            <Text style={[styles.rowSub, alert && styles.rowSubAlert]}>{sub}</Text>
          </View>
        ) : null}
      </View>
      {amount ? <Text style={styles.rowAmount}>{amount}</Text> : null}
      {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.placeholder} /> : null}
    </>
  );
  if (!onPress) {
    return (
      <View accessible style={[styles.row, !first && styles.rowLine]}>
        {body}
      </View>
    );
  }
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={[title, amount, sub].filter(Boolean).join('. ')} onPress={onPress} style={({ pressed }) => [styles.row, !first && styles.rowLine, pressed && { opacity: 0.85 }]}>
      {body}
    </Pressable>
  );
}

/** Lo que dice Empre AI, siempre con su logo: el dueño sabe de quién viene. `note` dice de dónde lo saca. */
export function EmpreAICard({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <View style={styles.ai}>
      <View style={styles.aiHead}>
        <EmpreSymbol product="ai" size={28} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.aiBrand}>Empre AI</Text>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            {title}
          </Text>
        </View>
      </View>
      {children}
      {note ? <Text style={styles.aiNote}>{note}</Text> : null}
    </View>
  );
}

/** Un acceso de la fila de tres: siempre el mismo cuadro, en cualquier pantalla. */
export function ActionTile({ icon, label, selected, onPress, width }: { icon: IconName; label: string; selected?: boolean; onPress: () => void; width?: number }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: Boolean(selected) }} onPress={onPress} style={({ pressed }) => [styles.tile, width ? { width } : styles.tileFlex, selected && styles.tileOn, pressed && { opacity: 0.8 }]}>
      <Ionicons name={icon} size={22} color={colors.ink} />
      <Text style={styles.tileText} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Una parte de un total: nombre, plata y barra. */
export function ShareRow({ label, value, share, color = colors.ink, first }: { label: string; value: string; share: number; color?: string; first?: boolean }) {
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} style={[styles.share, !first && styles.rowLine]}>
      <View style={styles.shareHead}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.rowAmount}>{value}</Text>
      </View>
      <View style={styles.track}>
        <AnimatedFill pct={share} color={color} style={styles.fill} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cap: { position: 'absolute', left: 0, right: 0, top: 0, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, ...softShadow },
  headText: { flex: 1, minWidth: 0 },
  lead: { ...typeScale.label, color: colors.muted },
  name: { ...typeScale.name, color: colors.ink },
  title: { fontSize: 26, lineHeight: 30, letterSpacing: -0.4, fontFamily: fonts.display.bold, color: colors.ink },
  section: { gap: 8 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 28 },
  // Una sola escala de letra (17/600 secciones, 15/600 filas, 13/500 texto, 12 etiquetas; un rol por lugar, 2026-11-18).
  sectionTitle: { ...typeScale.name, flexShrink: 1, color: colors.ink },
  linkBtn: { minHeight: 28, justifyContent: 'center' },
  link: { ...typeScale.body, fontFamily: fonts.ui.semibold, color: colors.ink, textDecorationLine: 'underline' },
  group: { paddingVertical: 2, paddingHorizontal: 14, borderRadius: 20, backgroundColor: colors.surface, ...softShadow },
  row: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  rowLine: { borderTopWidth: 1, borderTopColor: colors.selectedSoft },
  rowIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selectedSoft },
  rowLocked: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowText: { flex: 1, minWidth: 0, gap: 1 },
  rowTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 6 },
  rowTag: { ...typeScale.label, color: colors.muted },
  rowTitle: { ...typeScale.title, flexShrink: 1, color: colors.ink },
  rowSubLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.brand },
  rowSub: { ...typeScale.body, flexShrink: 1, color: colors.muted },
  rowSubAlert: { fontFamily: fonts.ui.semibold, color: colors.ink },
  rowAmount: { ...typeScale.figureSmall, color: colors.ink },
  ai: { gap: 12, padding: 14, borderRadius: 20, backgroundColor: colors.surface, ...softShadow },
  aiHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  aiBrand: { ...typeScale.label, color: colors.muted },
  aiNote: { ...typeScale.body, color: colors.muted },
  tile: { minHeight: 84, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 6, paddingVertical: 8, borderRadius: 16, backgroundColor: colors.surface, ...softShadow },
  tileFlex: { flex: 1, minWidth: 0 },
  tileOn: { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  tileText: { ...typeScale.label, textAlign: 'center', color: colors.ink },
  share: { gap: 6, paddingVertical: 10 },
  shareHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.selectedSoft },
  fill: { height: 6, borderRadius: 3 },
});
