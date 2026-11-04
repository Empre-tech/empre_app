import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '@/theme';

export interface TimelineItem {
  label: string;
  /** Hora o dato corto bajo el nombre; sin él queda solo el nombre. */
  time?: string;
}

interface Props {
  items: TimelineItem[];
  /** Índice de donde va, desde 0; `items.length` si ya terminó. */
  current: number;
  accessibilityLabel?: string;
}

/** Línea de tiempo horizontal: dónde va algo y a qué hora pasó cada cosa. */
export function Timeline({ items, current, accessibilityLabel }: Props) {
  const place = items[current]?.label ?? items[items.length - 1]?.label ?? '';
  return (
    <View style={styles.row} accessible accessibilityLabel={accessibilityLabel ?? `Va en: ${place}`}>
      <View style={[styles.line, { left: `${50 / items.length}%`, right: `${50 / items.length}%` }]} />
      {items.map((item, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <View key={item.label} style={styles.item}>
            <View style={[styles.dot, done && styles.dotDone, now && styles.dotNow]}>{done ? <Text style={styles.check}>✓</Text> : null}</View>
            <Text style={[styles.label, (done || now) && styles.labelOn]} numberOfLines={1}>
              {item.label}
            </Text>
            {item.time ? <Text style={styles.time}>{item.time}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  line: { position: 'absolute', top: 10, height: 1.5, backgroundColor: colors.line },
  item: { flex: 1, minWidth: 0, alignItems: 'center', gap: 3 },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: colors.selectedSoft, borderColor: colors.selectedSoft },
  dotNow: { borderWidth: 2, borderColor: colors.selected },
  check: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.selected },
  label: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.muted },
  labelOn: { fontFamily: fonts.ui.extrabold, color: colors.ink },
  time: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted, fontVariant: ['tabular-nums'] },
});
