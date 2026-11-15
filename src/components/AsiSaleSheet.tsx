import { Ionicons } from '@/components/Icon';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Preview } from '@/lib/asiSale';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts } from '@/theme';

/**
 * «Así sale» (tablero «Cada cifra con su porqué», 2026-11-14): la vista previa de por qué sale una cifra. Sube hasta la
 * mitad y deja ver la pantalla de atrás: es un vistazo, no otra pantalla. Cierra con un botón a la parte de Empre que
 * tiene el detalle (Finance, Mis salidas…): esta hoja no la reemplaza.
 */
export function AsiSaleSheet({
  preview,
  onClose,
  owner,
  onRow,
}: {
  preview: Preview | null;
  onClose: () => void;
  /** El dueño del detalle: «Ver el detalle en Empre Finance». `money` lo pinta con el verde de la plata. */
  owner?: { label: string; onPress: () => void; money?: boolean };
  /** Tocar una fila (por ejemplo, un negocio del total lleva a su Finance). */
  onRow?: (key: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const p = preview;
  return (
    <Modal visible={Boolean(p)} transparent animationType={reduce ? 'none' : 'slide'} onRequestClose={onClose}>
      <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" style={styles.veil} onPress={onClose} />
      {p ? (
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]} accessibilityViewIsModal>
          <View style={styles.handle} />
          <View style={styles.head}>
            <Text style={styles.title} accessibilityRole="header">
              {p.title}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              {p.sub}
            </Text>
          </View>
          {/* La cuenta en palabras: cada número dice qué es */}
          <Text style={styles.eq}>
            {p.equation.map((x, i) => (
              <Text key={i} style={[x.bold && styles.eqBold, x.result && styles.eqResult]}>
                {x.t}
              </Text>
            ))}
          </Text>
          {/* Lo principal, no todo */}
          {p.rows.length ? (
            <View style={styles.card}>
              {p.rows.map((r, i) => {
                const body = (
                  <>
                    <View style={styles.rowText}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {r.title}
                      </Text>
                      {r.sub ? (
                        <Text style={styles.rowSub} numberOfLines={2}>
                          {r.sub}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={[styles.rowValue, r.quiet && styles.rowQuiet]}>{r.value}</Text>
                    {onRow ? <Ionicons name="chevron-forward" size={16} color={colors.placeholder} /> : null}
                  </>
                );
                return onRow ? (
                  <Pressable key={r.key} accessibilityRole="button" onPress={() => onRow(r.key)} style={({ pressed }) => [styles.row, i > 0 && styles.rowLine, pressed && { opacity: 0.8 }]}>
                    {body}
                  </Pressable>
                ) : (
                  <View key={r.key} style={[styles.row, i > 0 && styles.rowLine]}>
                    {body}
                  </View>
                );
              })}
            </View>
          ) : null}
          {/* Si falta algo, lo dice */}
          {p.warning ? (
            <View style={styles.warning}>
              <Ionicons name="warning-outline" size={16} color={colors.ink} />
              <Text style={styles.warningText}>{p.warning}</Text>
            </View>
          ) : null}
          {/* Qué cuenta y qué no */}
          {p.note ? (
            <View style={styles.note}>
              <Ionicons name="information-circle-outline" size={16} color={colors.muted} />
              <Text style={styles.noteText}>{p.note}</Text>
            </View>
          ) : null}
          {/* El detalle, en su dueño */}
          {owner ? (
            <Pressable accessibilityRole="button" onPress={owner.onPress} style={({ pressed }) => [styles.owner, owner.money && styles.ownerMoney, pressed && { opacity: 0.85 }]}>
              <Text style={[styles.ownerText, owner.money && { color: colors.finance }]}>{owner.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={owner.money ? colors.finance : colors.ink} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  veil: { flex: 1, backgroundColor: 'rgba(43,38,34,0.32)' },
  sheet: { gap: 12, paddingTop: 10, paddingHorizontal: 16, borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundColor: colors.bg },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  title: { fontSize: 18, fontFamily: fonts.display.bold, color: colors.ink },
  sub: { flexShrink: 1, fontSize: 12.5, fontFamily: fonts.ui.medium, color: colors.muted },
  eq: { fontSize: 16, lineHeight: 24, fontFamily: fonts.ui.medium, color: colors.ink },
  eqBold: { fontFamily: fonts.ui.extrabold },
  eqResult: { color: colors.finance },
  card: { paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  rowLine: { borderTopWidth: 1, borderTopColor: colors.line },
  rowText: { flex: 1, minWidth: 0, gap: 1 },
  rowTitle: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  rowSub: { fontSize: 12, lineHeight: 16, fontFamily: fonts.ui.medium, color: colors.muted },
  rowValue: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink, fontVariant: ['tabular-nums'] },
  rowQuiet: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  warning: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 14, backgroundColor: colors.selectedSoft },
  warningText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.ink },
  note: { flexDirection: 'row', gap: 8 },
  noteText: { flex: 1, fontSize: 12.5, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.muted },
  owner: { minHeight: 48, marginTop: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 24, borderWidth: 1.5, borderColor: colors.nightSoft, backgroundColor: colors.surface },
  ownerMoney: { borderColor: colors.finance },
  ownerText: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
});
