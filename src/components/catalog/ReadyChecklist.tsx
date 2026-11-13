import { Ionicons } from '@/components/Icon';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '@/theme';

export interface ReadyItem {
  key: string;
  label: string;
  ok: boolean;
  /** Lo que ya está (precio, minutos) o qué falta. */
  value: string;
}

/**
 * «Listo para aparecer» (tablero «Subir un servicio»): los parámetros que ordenan el catálogo y Ofertas, revisados en
 * vivo con lo que el dueño ya escribió. Nada se adivina: cada línea sale de un campo del formulario.
 */
export function ReadyChecklist({ items }: { items: ReadyItem[] }) {
  const done = items.filter((i) => i.ok).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  return (
    <View style={styles.box} accessible accessibilityLabel={`Listo para aparecer: ${done} de ${items.length}`}>
      <View style={styles.head}>
        <Text style={styles.title}>Listo para aparecer</Text>
        <Text style={styles.count}>{`${done} de ${items.length}`}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
      {items.map((i) => (
        <View key={i.key} style={styles.row}>
          <View style={[styles.mark, i.ok ? styles.markOk : styles.markTodo]}>{i.ok ? <Ionicons name="checkmark" size={12} color="#FFFFFF" /> : null}</View>
          <Text style={styles.label}>{i.label}</Text>
          <Text style={[styles.value, i.ok ? styles.valueOk : styles.valueTodo]} numberOfLines={1}>
            {i.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 20, backgroundColor: colors.surface, padding: 14, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: fonts.ui.extrabold, fontSize: 15, color: colors.ink },
  count: { fontFamily: fonts.ui.extrabold, fontSize: 13, color: colors.ink },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.selectedSoft, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.brand },
  row: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  markOk: { backgroundColor: colors.brand },
  markTodo: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.placeholder },
  label: { flex: 1, fontFamily: fonts.ui.bold, fontSize: 13, color: colors.ink },
  value: { fontFamily: fonts.ui.extrabold, fontSize: 12 },
  valueOk: { color: colors.brand },
  valueTodo: { color: colors.ink },
});
