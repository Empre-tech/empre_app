import { useRouter } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Ionicons } from '@/components/Icon';
import { ProTag } from '@/components/pro/ProTag';
import { ProPerkList } from '@/components/pro/ProPerkList';
import { PRO_PRICE_AMOUNT } from '@/lib/proPlan';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts, spacing } from '@/theme';

/**
 * «Pásate a Empre Pro» (tablero «Base y Empre Pro», teléfono 3): sale al tocar algo con la corona. Dice qué suma Pro,
 * el precio, y que lo que ya tienes sigue igual. Pagar es en Mi negocio > Suscripción (Wompi); con varios negocios,
 * se elige cuál, porque Pro va por negocio.
 */
export function GoProSheet({
  visible,
  onClose,
  businesses,
}: {
  visible: boolean;
  onClose: () => void;
  /** Los negocios que pueden pasarse (los que están en Base). */
  businesses: { id: string; name: string }[];
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();

  const go = (id: string) => {
    onClose();
    router.push({ pathname: '/business/subscription/[id]', params: { id } });
  };

  return (
    <Modal visible={visible} transparent animationType={reduce ? 'none' : 'slide'} statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.md }]} accessibilityViewIsModal>
          <View style={styles.handle} />
          <View style={styles.head}>
            <ProTag />
            <Text style={styles.title} accessibilityRole="header">
              Pásate a Empre Pro
            </Text>
          </View>
          <Text style={styles.lead}>Lo que ya tienes sigue igual. Con Pro se suma:</Text>

          {/* La lista se desplaza en teléfonos bajos; el precio y el botón quedan siempre a la vista. */}
          <ScrollView style={styles.perks} bounces={false}>
            <ProPerkList />
          </ScrollView>

          <View style={styles.price}>
            <Text style={styles.priceName}>Empre Pro</Text>
            <Text style={styles.priceAmount} accessibilityLabel={`${PRO_PRICE_AMOUNT} pesos al mes, por negocio`}>
              {PRO_PRICE_AMOUNT}
              <Text style={styles.priceUnit}> al mes</Text>
            </Text>
          </View>

          {businesses.length <= 1 ? (
            <Button title="Pásate a Pro" disabled={!businesses.length} onPress={() => businesses[0] && go(businesses[0].id)} />
          ) : (
            <>
              <Text style={styles.which}>Pro va por negocio. ¿Para cuál?</Text>
              {businesses.map((b) => (
                <Pressable
                  key={b.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Pasar ${b.name} a Empre Pro`}
                  onPress={() => go(b.id)}
                  style={({ pressed }) => [styles.biz, pressed && styles.pressed]}
                >
                  <Ionicons name="storefront-outline" size={18} color={colors.ink} />
                  <Text style={styles.bizName} numberOfLines={1}>
                    {b.name}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </Pressable>
              ))}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(43,38,34,0.28)' },
  sheet: { maxHeight: '92%', paddingHorizontal: spacing.md, paddingTop: 10, gap: spacing.sm, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.bg },
  perks: { flexGrow: 0, flexShrink: 1 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { fontSize: 20, lineHeight: 26, fontFamily: fonts.ui.semibold, color: colors.ink },
  lead: { fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.muted },
  price: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: spacing.sm, paddingBottom: 2, borderTopWidth: 1, borderTopColor: colors.line },
  priceName: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink },
  priceAmount: { fontSize: 20, fontFamily: fonts.ui.semibold, color: colors.ink },
  priceUnit: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  which: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  biz: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.brandRef },
  bizName: { flex: 1, fontSize: 15, fontFamily: fonts.ui.semibold, color: colors.ink },
  pressed: { opacity: 0.8 },
});
