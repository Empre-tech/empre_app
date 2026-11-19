import { StyleSheet, Text, View } from 'react-native';
import { CrownIcon } from '@/components/Icon';
import { colors, fonts } from '@/theme';

/** La marca de lo que es de Empre Pro: corona y «Pro» sobre arena (nunca negro). Va junto a lo que queda en gris en Base. */
export function ProTag() {
  return (
    <View style={styles.tag} accessible={false}>
      <CrownIcon size={13} color={colors.ink} />
      <Text style={styles.text}>Pro</Text>
    </View>
  );
}

/** Lo de Pro en Base: se ve, en gris (sin color), y no se esconde. */
export const LOCKED_OPACITY = 0.42;

const styles = StyleSheet.create({
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.sand },
  text: { fontSize: 12, lineHeight: 16, fontFamily: fonts.ui.semibold, color: colors.ink },
});
