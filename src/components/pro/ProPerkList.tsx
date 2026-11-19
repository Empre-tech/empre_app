import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@/components/Icon';
import { FEATURES } from '@/config';
import { proGroups, type ProGroup } from '@/lib/proPlan';
import { colors, fonts } from '@/theme';

const GROUP_ICON: Record<ProGroup['key'], keyof typeof Ionicons.glyphMap> = {
  finance: 'wallet-outline',
  ai: 'sparkles-outline',
  inventory: 'cube-outline',
  agenda: 'calendar-outline',
};

/**
 * Lo que suma Empre Pro, por área (Empre Finance primero). Corto en la hoja «Pásate a Empre Pro»: el área y en una
 * línea lo que suma. Con `detail` (pantalla Tu plan): lo que tienes en Base y cada cosa que suma Pro con su detalle.
 */
export function ProPerkList({ detail }: { detail?: boolean }) {
  return (
    <View>
      {proGroups({ agenda: FEATURES.agenda }).map((g) => (
        <View key={g.key} style={styles.group} accessible={!detail} accessibilityLabel={detail ? undefined : `${g.title}: ${g.short}`}>
          <View style={styles.head}>
            <View style={styles.icon}>
              <Ionicons name={GROUP_ICON[g.key]} size={18} color={colors.ink} />
            </View>
            <View style={styles.texts}>
              <Text style={styles.title} accessibilityRole={detail ? 'header' : undefined}>
                {g.title}
              </Text>
              {detail ? (g.base ? <Text style={styles.base}>{g.base}</Text> : null) : <Text style={styles.sub}>{g.short}</Text>}
            </View>
          </View>
          {detail
            ? g.items.map((it) => (
                <View key={it.title} style={styles.item} accessible accessibilityLabel={`Con Pro: ${it.title}. ${it.sub}`}>
                  <Ionicons name="add" size={16} color={colors.ink} style={styles.plus} />
                  <View style={styles.texts}>
                    <Text style={styles.itemTitle}>{it.title}</Text>
                    <Text style={styles.sub}>{it.sub}</Text>
                  </View>
                </View>
              ))
            : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { paddingVertical: 10, gap: 8, borderTopWidth: 1, borderTopColor: colors.line },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.well },
  texts: { flex: 1, gap: 1 },
  title: { fontSize: 15, lineHeight: 20, fontFamily: fonts.ui.semibold, color: colors.ink },
  base: { fontSize: 12, lineHeight: 16, fontFamily: fonts.ui.medium, color: colors.muted },
  sub: { fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.muted },
  // Lo que suma Pro, alineado con el texto del área (no con el ícono): se lee como su lista.
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingLeft: 48 },
  plus: { marginTop: 2 },
  itemTitle: { fontSize: 14, lineHeight: 19, fontFamily: fonts.ui.semibold, color: colors.ink },
});
