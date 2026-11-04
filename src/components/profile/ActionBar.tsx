import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { cardShadow, colors, fonts, spacing } from '@/theme';

interface Props {
  name: string;
  bottomInset: number;
  /** Con agenda encendida, «Reservar» es la acción principal. */
  onBook?: () => void;
  onMessage: () => void;
  /** Sin teléfono válido no hay «Llamar». */
  onCall?: () => void;
}

/** Alto aproximado de la barra (para dejar margen al contenido del perfil). */
export const ACTION_BAR_HEIGHT = 92;

/** La barra de quien visita: «Reservar» si el negocio tiene agenda (si no, «Mensaje» es la principal) y «Llamar». */
export function ActionBar({ name, bottomInset, onBook, onMessage, onCall }: Props) {
  return (
    <View style={[styles.bar, { bottom: Math.max(bottomInset, spacing.md) }]} accessibilityRole="toolbar">
      {onBook ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Reservar en ${name}`} onPress={onBook} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
          <Ionicons name="calendar-outline" size={18} color="#fff" />
          <Text style={styles.primaryText}>Reservar</Text>
        </Pressable>
      ) : (
        <Pressable accessibilityRole="button" accessibilityLabel={`Escribirle a ${name}`} onPress={onMessage} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
          <Ionicons name="chatbubble-outline" size={18} color="#fff" />
          <Text style={styles.primaryText}>Mensaje</Text>
        </Pressable>
      )}
      {onBook ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Escribirle a ${name}`} onPress={onMessage} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
          <Ionicons name="chatbubble-outline" size={20} color={colors.ink} />
          <Text style={styles.secondaryText}>Mensaje</Text>
        </Pressable>
      ) : null}
      {onCall ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Llamar" onPress={onCall} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
          <Ionicons name="call-outline" size={20} color={colors.ink} />
          <Text style={styles.secondaryText}>Llamar</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 12,
    right: 12,
    height: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    borderRadius: 24,
    backgroundColor: colors.surface,
    ...cardShadow,
    shadowOpacity: 0.16,
  },
  primary: { flex: 2, height: 50, borderRadius: 18, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  primaryText: { fontSize: 15.5, fontFamily: fonts.ui.extrabold, color: '#fff' },
  secondary: { flex: 1, height: 52, alignItems: 'center', justifyContent: 'center', gap: 2 },
  secondaryText: { fontSize: 11, fontFamily: fonts.ui.extrabold, color: colors.ink, textAlign: 'center' },
  pressed: { opacity: 0.7 },
});
