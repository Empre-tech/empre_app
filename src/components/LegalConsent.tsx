import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@/components/Icon';
import { openLegal } from '@/lib/legal';
import { colors, fonts, spacing } from '@/theme';

/**
 * La casilla de la autorización (Ley 1581 de 2012, art. 9): previa, expresa e informada. Va sin marcar y enlaza a la
 * Política de tratamiento de datos y a los Términos. Sin marcarla no se crea la cuenta.
 */
export function LegalConsent({ value, onChange, error }: { value: boolean; onChange: (v: boolean) => void; error?: string | null }) {
  return (
    <View style={{ gap: 4 }}>
      <View style={styles.row}>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: value }} accessibilityLabel="Tengo 18 años o más y acepto la Política de tratamiento de datos y los Términos" onPress={() => onChange(!value)} hitSlop={8}>
          <Ionicons name={value ? 'checkbox' : 'square-outline'} size={24} color={value ? colors.primary : error ? colors.danger : colors.muted} />
        </Pressable>
        <Text style={styles.text} onPress={() => onChange(!value)}>
          Tengo 18 años o más y acepto la{' '}
          <Text style={styles.link} accessibilityRole="link" onPress={() => openLegal('privacy')}>
            Política de tratamiento de datos
          </Text>{' '}
          y los{' '}
          <Text style={styles.link} accessibilityRole="link" onPress={() => openLegal('terms')}>
            Términos
          </Text>
          .
        </Text>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  text: { flex: 1, fontSize: 13.5, lineHeight: 20, fontFamily: fonts.ui.medium, color: colors.ink },
  link: { fontFamily: fonts.ui.bold, color: colors.primaryDark, textDecorationLine: 'underline' },
  error: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.danger },
});
