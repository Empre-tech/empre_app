import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius } from '@/theme';

export interface ZoneOption {
  id: string;
  name: string;
  where?: string | null;
}

/** La zona arriba, como «Entregar en…»: se toca para cambiarla. Igual en Finder y en Ofertas. */
export function ZoneButton({ lead, name, open, onPress, disabled }: { lead: string; name: string; open: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${lead} ${name}. Cambiar de zona`} disabled={disabled} onPress={onPress} style={styles.btn}>
      <Text style={styles.lead}>{lead}</Text>
      <View style={styles.nameRow}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {disabled ? null : <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.ink} />}
      </View>
    </Pressable>
  );
}

/** La lista de zonas que se abre debajo. */
export function ZoneList({ options, selected, onPick }: { options: ZoneOption[]; selected: string | null; onPick: (o: ZoneOption) => void }) {
  return (
    <View style={styles.list}>
      {options.map((o, i) => {
        const on = o.id === selected;
        return (
          <Pressable key={o.id} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onPick(o)} style={[styles.row, i > 0 && styles.rowLine, on && styles.rowOn]}>
            <Text style={styles.rowText} numberOfLines={1}>
              {o.name}
            </Text>
            {o.where ? <Text style={styles.rowWhere}>{o.where}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { flex: 1, minWidth: 0, minHeight: 44, alignItems: 'flex-start', justifyContent: 'center' },
  lead: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.faint },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
  name: { flexShrink: 1, fontSize: 16, lineHeight: 20, fontFamily: fonts.ui.extrabold, color: colors.ink },
  list: { borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surface },
  row: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 14 },
  rowLine: { borderTopWidth: 1, borderTopColor: colors.selectedSoft },
  rowOn: { backgroundColor: colors.selectedSoft, borderRadius: radius.sm },
  rowText: { flexShrink: 1, fontSize: 14, fontFamily: fonts.ui.bold, color: colors.ink },
  rowWhere: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.faint },
});
