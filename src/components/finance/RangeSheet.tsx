import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Chip } from '@/components/ledger/parts';
import { addDays, daysBetween, monthGrid, MONTH_NAMES, pickDay, PRESETS, presetRange, rangeTitle, todayCO, WEEK_INITIALS, type Compare, type DateRange } from '@/lib/finance';
import { colors, fonts, radius, spacing } from '@/theme';

interface Props {
  visible: boolean;
  value: DateRange;
  onApply: (r: DateRange) => void;
  onClose: () => void;
}

/** Elegir fechas: un atajo (un toque y listo) o un rango libre en el calendario, con qué compararlo. Hasta un año. */
export function RangeSheet(props: Props) {
  // Se monta al abrir: cada vez arranca con el rango actual.
  if (!props.visible) return null;
  return <RangeBody {...props} />;
}

function RangeBody({ visible, value, onApply, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const today = todayCO();
  const minDay = addDays(today, -365);
  const [draft, setDraft] = useState<{ from: string | null; to: string | null }>({ from: value.from, to: value.to });
  const [compare, setCompare] = useState<Compare>(value.compare === 'year' ? 'year' : 'prev');
  const [month, setMonth] = useState<{ y: number; m: number }>(() => ({ y: Number(value.to.slice(0, 4)), m: Number(value.to.slice(5, 7)) }));

  const shift = (n: number) =>
    setMonth(({ y, m }) => {
      const t = m + n;
      return t < 1 ? { y: y - 1, m: 12 } : t > 12 ? { y: y + 1, m: 1 } : { y, m: t };
    });
  const monthKey = `${month.y}-${String(month.m).padStart(2, '0')}`;
  const canPrev = monthKey > minDay.slice(0, 7);
  const canNext = monthKey < today.slice(0, 7);
  const cells = monthGrid(month.y, month.m);
  const from = draft.from;
  const to = draft.to ?? draft.from;
  const n = from && to ? daysBetween(from, to) : 0;
  const tooLong = n > 366;

  const apply = () => {
    if (!from || !to || tooLong) return;
    onApply({ from, to, compare, preset: 'custom' });
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Cerrar" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} accessibilityViewIsModal>
        <View style={styles.grab} />
        <Text style={styles.title}>¿Qué fechas quieres ver?</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }} style={{ flexGrow: 0 }}>
          {PRESETS.map((p) => (
            <Chip
              key={p.key}
              label={p.label}
              selected={value.preset === p.key}
              onPress={() => {
                onApply(presetRange(p.key, today));
                onClose();
              }}
            />
          ))}
        </ScrollView>

        <View style={styles.monthRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Mes anterior" disabled={!canPrev} onPress={() => shift(-1)} style={[styles.nav, !canPrev && { opacity: 0.3 }]}>
            <Ionicons name="chevron-back" size={20} color={colors.ink} />
          </Pressable>
          <Text style={styles.month}>
            {MONTH_NAMES[month.m - 1]} {month.y}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Mes siguiente" disabled={!canNext} onPress={() => shift(1)} style={[styles.nav, !canNext && { opacity: 0.3 }]}>
            <Ionicons name="chevron-forward" size={20} color={colors.ink} />
          </Pressable>
        </View>

        <View style={styles.grid}>
          {WEEK_INITIALS.map((w, i) => (
            <Text key={`w${i}`} style={styles.wd}>
              {w}
            </Text>
          ))}
          {cells.map((d, i) => {
            if (!d) return <View key={`e${i}`} style={styles.cell} />;
            const off = d > today || d < minDay;
            const edge = d === from || d === to;
            const inside = from && to && d > from && d < to;
            return (
              <View
                key={d}
                style={[
                  styles.cell,
                  (inside || (edge && from !== to)) && styles.band,
                  d === from && from !== to && styles.bandStart,
                  d === to && from !== to && styles.bandEnd,
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: Boolean(edge), disabled: off }}
                  accessibilityLabel={`${Number(d.slice(8))} de ${MONTH_NAMES[month.m - 1]}`}
                  disabled={off}
                  onPress={() => setDraft((c) => pickDay(c, d))}
                  style={[styles.day, edge && styles.dayOn]}
                >
                  <Text style={[styles.dayText, edge && { color: '#fff' }, off && { color: '#B9C6D8' }, d === today && !edge && { color: colors.primary }]}>{Number(d.slice(8))}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
        <Text style={styles.hint}>{draft.to || !draft.from ? 'Toca el primer día y después el último.' : 'Ahora toca el último día (o aplica solo ese día).'}</Text>

        <View style={{ gap: 6 }}>
          <Text style={styles.label}>Comparar con</Text>
          <View style={styles.seg} accessibilityRole="radiogroup">
            {(
              [
                ['prev', n > 0 ? `Los ${n === 1 ? 'día' : `${n} días`} antes` : 'Los días antes'],
                ['year', 'Mismas fechas, año pasado'],
              ] as const
            ).map(([k, label]) => (
              <Pressable key={k} accessibilityRole="radio" accessibilityState={{ checked: compare === k }} onPress={() => setCompare(k)} style={[styles.segBtn, compare === k && styles.segOn]}>
                <Text style={[styles.segText, compare === k && styles.segTextOn]}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Button title={!from ? 'Elige las fechas' : tooLong ? 'Máximo un año' : `Ver ${rangeTitle({ from, to: to! }, today)}`} disabled={!from || tooLong} onPress={apply} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(22,35,58,0.45)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  grab: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line, alignSelf: 'center' },
  title: { fontSize: 20, fontFamily: fonts.display.bold, color: colors.ink },
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nav: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  month: { flex: 1, textAlign: 'center', fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  wd: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 11.5, fontFamily: fonts.ui.extrabold, color: colors.muted, paddingBottom: 4 },
  cell: { width: `${100 / 7}%`, height: 42, alignItems: 'center', justifyContent: 'center' },
  band: { backgroundColor: colors.primarySoft },
  bandStart: { borderTopLeftRadius: 21, borderBottomLeftRadius: 21 },
  bandEnd: { borderTopRightRadius: 21, borderBottomRightRadius: 21 },
  day: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  dayOn: { backgroundColor: colors.primary },
  dayText: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.ink },
  hint: { fontSize: 12.5, fontFamily: fonts.ui.medium, color: colors.muted },
  label: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.muted },
  seg: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: radius.md, backgroundColor: '#E8EEF6' },
  segBtn: { flex: 1, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  segOn: { backgroundColor: colors.surface },
  segText: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: '#55657C', textAlign: 'center' },
  segTextOn: { fontFamily: fonts.ui.extrabold, color: colors.ink },
});
