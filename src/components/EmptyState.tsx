import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { colors, fonts, spacing } from '@/theme';

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  /** Qué falta, en una frase corta. */
  title: string;
  /** Por qué pasa o cómo se llena; opcional. */
  body?: string;
  /** Salida concreta; sin ella el vacío es solo informativo. */
  action?: { title: string; onPress: () => void };
}

/**
 * Vacío por niveles: contenedor squircle en tinta suave + icono + título, con explicación y acción solo cuando
 * ayudan. Reemplaza los textos sueltos para que todas las pantallas vacías se vean y se lean igual.
 */
export function EmptyState({ icon, title, body, action }: Props) {
  return (
    <View style={styles.wrap} accessible accessibilityLabel={body ? `${title}. ${body}` : title}>
      <View style={styles.icon}>
        <Ionicons name={icon} size={26} color={colors.ink} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {action ? <Button title={action.title} variant="secondary" onPress={action.onPress} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  icon: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: colors.selectedSoft,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 16.5, fontFamily: fonts.display.bold, color: colors.ink, textAlign: 'center' },
  body: { fontSize: 13.5, lineHeight: 19, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center', marginBottom: spacing.xs },
});
