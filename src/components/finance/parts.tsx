import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, softShadow } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

/** Arriba, igual en Hoy y en Análisis: volver y de qué negocio se trata. */
export function FinanceHead({ lead, name }: { lead: string; name?: string }) {
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
    </View>
  );
}

export function FinanceTitle({ children }: { children: string }) {
  return (
    <Text style={styles.title} accessibilityRole="header">
      {children}
    </Text>
  );
}

/** Una sección: su título y, si hay, un enlace al detalle. */
export function FinanceSection({ title, link, onLink, children }: { title: string; link?: string; onLink?: () => void; children: ReactNode }) {
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

export function FinanceGroup({ children }: { children: ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

/** Una fila. Lo urgente lleva un punto, no otro color. Sin `onPress` es solo un dato. */
export function FinanceRow({ icon, title, sub, amount, alert, first, onPress }: { icon: IconName; title: string; sub?: string; amount?: string; alert?: boolean; first?: boolean; onPress?: () => void }) {
  const body = (
    <>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color={colors.ink} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
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
        <View style={[styles.fill, { width: `${Math.max(0, Math.min(100, share))}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, ...softShadow },
  headText: { flex: 1, minWidth: 0 },
  lead: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  name: { fontSize: 16, fontFamily: fonts.ui.extrabold, color: colors.ink },
  title: { fontSize: 26, lineHeight: 30, letterSpacing: -0.4, fontFamily: fonts.display.bold, color: colors.ink },
  section: { gap: 8 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 28 },
  sectionTitle: { flexShrink: 1, fontSize: 19, lineHeight: 23, fontFamily: fonts.display.bold, color: colors.ink },
  linkBtn: { minHeight: 28, justifyContent: 'center' },
  link: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.ink, textDecorationLine: 'underline' },
  group: { paddingVertical: 2, paddingHorizontal: 14, borderRadius: 20, backgroundColor: colors.surface, ...softShadow },
  row: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  rowLine: { borderTopWidth: 1, borderTopColor: colors.selectedSoft },
  rowIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selectedSoft },
  rowText: { flex: 1, minWidth: 0, gap: 1 },
  rowTitle: { flexShrink: 1, fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  rowSubLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.brand },
  rowSub: { flexShrink: 1, fontSize: 12.5, lineHeight: 17, fontFamily: fonts.ui.semibold, color: colors.muted },
  rowSubAlert: { fontFamily: fonts.ui.extrabold, color: colors.ink },
  rowAmount: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink, fontVariant: ['tabular-nums'] },
  share: { gap: 6, paddingVertical: 10 },
  shareHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.selectedSoft },
  fill: { height: 6, borderRadius: 3 },
});
