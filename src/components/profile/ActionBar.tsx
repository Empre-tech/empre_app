import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '@/theme';

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

/** La barra flotante de quien visita: «Reservar» si el negocio tiene agenda (si no, «Mensaje» es la principal) y acciones secundarias en pastilla táctil. */
export function ActionBar({ name, bottomInset, onBook, onMessage, onCall }: Props) {
  return (
    <View style={[styles.bar, { paddingBottom: bottomInset + 16 }]} accessibilityRole="toolbar">
      {onBook ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Reservar en ${name}`} onPress={onBook} style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}>
          <Text style={styles.primaryText}>Reservar</Text>
        </Pressable>
      ) : (
        <Pressable accessibilityRole="button" accessibilityLabel={`Escribirle a ${name}`} onPress={onMessage} style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}>
          <Text style={styles.primaryText}>Mensaje</Text>
        </Pressable>
      )}
      {onBook ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Escribirle a ${name}`} onPress={onMessage} style={({ pressed }) => [styles.secondary, pressed && styles.secondaryPressed]}>
          <Text style={styles.secondaryText}>Mensaje</Text>
        </Pressable>
      ) : null}
      {onCall ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Llamar" onPress={onCall} style={({ pressed }) => [styles.secondary, pressed && styles.secondaryPressed]}>
          <Text style={styles.secondaryText}>Llamar</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 8, paddingTop: 12, paddingHorizontal: 14, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.hairline },
  primary: { flex: 1.3, minHeight: 52, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  primaryPressed: { backgroundColor: colors.primaryDark },
  primaryText: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: '#fff' },
  secondary: { flex: 1, minHeight: 52, borderRadius: 16, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  secondaryPressed: { opacity: 0.8 },
  secondaryText: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink, textAlign: 'center' },
});
