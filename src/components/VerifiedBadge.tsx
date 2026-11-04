import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius } from '@/theme';

export function VerifiedBadge({ size = 16, withLabel = false }: { size?: number; withLabel?: boolean }) {
  if (withLabel) {
    return (
      <View style={styles.pill} accessible accessibilityLabel="Negocio verificado">
        <Ionicons name="checkmark-circle" size={size} color={colors.verified} />
        <Text style={styles.label}>Verificado</Text>
      </View>
    );
  }
  return (
    <Ionicons
      name="checkmark-circle"
      size={size}
      color={colors.verified}
      accessibilityLabel="Negocio verificado"
    />
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.verifiedSoft,
  },
  label: {
    fontSize: 12,
    fontFamily: fonts.ui.extrabold,
    color: colors.verified,
  },
});
