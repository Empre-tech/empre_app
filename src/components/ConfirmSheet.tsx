import { Ionicons } from '@/components/Icon';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { colors, fonts, radius, spacing } from '@/theme';

export interface ConfirmPoint {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  text: string;
}

/**
 * Una confirmación como hoja de abajo (2026-11-24), en vez de la alerta nativa de Android: título, qué va a pasar en
 * puntos con ícono, y los dos botones grandes. Para cambios que conviene pensar un segundo (cambiar de tipo, quitar).
 */
export function ConfirmSheet({
  visible,
  title,
  points,
  confirmLabel,
  cancelLabel = 'Cancelar',
  loading,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  title: string;
  points: ConfirmPoint[];
  confirmLabel: string;
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]} accessibilityViewIsModal>
          <View style={styles.grab} />
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <View style={{ gap: spacing.sm }}>
            {points.map((p) => (
              <View key={p.text} style={styles.point}>
                <View style={styles.icon}>
                  <Ionicons name={p.icon} size={18} color={colors.ink} />
                </View>
                <Text style={styles.pointText}>{p.text}</Text>
              </View>
            ))}
          </View>
          <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
            <Button title={confirmLabel} loading={loading} onPress={onConfirm} />
            <Button title={cancelLabel} variant="ghost" onPress={onClose} disabled={loading} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(43,38,34,0.32)' },
  sheet: { gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.bg },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line },
  title: { fontSize: 20, lineHeight: 26, fontFamily: fonts.display.bold, color: colors.ink },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  icon: { width: 34, height: 34, borderRadius: radius.md, backgroundColor: colors.well, alignItems: 'center', justifyContent: 'center' },
  pointText: { flex: 1, fontSize: 14.5, lineHeight: 20, fontFamily: fonts.ui.medium, color: colors.ink, paddingTop: 6 },
});
