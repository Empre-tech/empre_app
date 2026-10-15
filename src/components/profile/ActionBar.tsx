import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius, spacing } from '@/theme';

interface Props {
  onMessage: () => void;
  onDirections?: () => void;
  onCall?: () => void;
}

/** Barra fija al pie para el visitante: Mensaje (principal), Cómo llegar y Llamar. */
export function ActionBar({ onMessage, onDirections, onCall }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom + spacing.sm }]}>
      <Pressable accessibilityRole="button" onPress={onMessage} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
        <Ionicons name="chatbubble-ellipses" size={18} color="#fff" />
        <Text style={styles.primaryText}>Mensaje</Text>
      </Pressable>
      {onDirections ? (
        <Pressable accessibilityRole="button" onPress={onDirections} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
          <Ionicons name="navigate-outline" size={18} color={colors.ink} />
          <Text style={styles.secondaryText}>Cómo llegar</Text>
        </Pressable>
      ) : null}
      {onCall ? (
        <Pressable accessibilityRole="button" onPress={onCall} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
          <Ionicons name="call-outline" size={18} color={colors.ink} />
          <Text style={styles.secondaryText}>Llamar</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.sm, paddingHorizontal: spacing.lg, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line },
  primary: { flex: 1.3, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.md, backgroundColor: colors.primary },
  primaryText: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: '#fff' },
  secondary: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  secondaryText: { fontSize: 13.5, fontFamily: fonts.ui.bold, color: colors.ink },
  pressed: { opacity: 0.85 },
});
