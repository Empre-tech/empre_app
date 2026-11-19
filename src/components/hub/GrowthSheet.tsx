import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GrowthGroups } from '@/components/profile/GrowthCard';
import type { GrowthTarget, GrowthView } from '@/lib/growth';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts, spacing, typeScale } from '@/theme';

/**
 * Lo que falta para completar el perfil (lienzo v115): se abre desde el anillo de Mi negocio o su línea. Cada punto
 * dice qué cambia y lleva directo a hacerlo.
 */
export function GrowthSheet({ visible, view, onClose, onGo }: { visible: boolean; view: GrowthView | undefined; onClose: () => void; onGo: (target: GrowthTarget) => void }) {
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  if (!view) return null;
  return (
    <Modal visible={visible} transparent animationType={reduce ? 'none' : 'slide'} statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.md }]} accessibilityViewIsModal>
          <View style={styles.handle} />
          <Text style={styles.title} accessibilityRole="header">
            {`Completa tu perfil · ${view.done} de ${view.total}`}
          </Text>
          <Text style={styles.lead}>Cada punto cambia algo que tus clientes ven.</Text>
          <ScrollView style={styles.list} bounces={false}>
            <GrowthGroups
              view={view}
              onGo={(target) => {
                onClose();
                onGo(target);
              }}
            />
            <Text style={styles.note}>Nada de esto te sube en el orden: lo que cambia es lo que el cliente ve de ti.</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(43,38,34,0.28)' },
  sheet: { maxHeight: '88%', paddingHorizontal: spacing.md, paddingTop: 10, gap: spacing.sm, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.bg },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line },
  title: { fontSize: 20, lineHeight: 26, fontFamily: fonts.ui.semibold, color: colors.ink },
  lead: { ...typeScale.body, color: colors.muted },
  list: { flexGrow: 0, flexShrink: 1 },
  note: { ...typeScale.body, color: colors.muted, marginTop: spacing.sm, marginBottom: spacing.sm },
});
