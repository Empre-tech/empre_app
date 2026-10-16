import { StyleSheet, Text, View } from 'react-native';

import type { PromotionCardModel } from '@/lib/promotion';
import { colors, fonts, radius, spacing } from '@/theme';

interface Props {
  model: PromotionCardModel;
  /** Dato extra de una promoción de antes del editor (descuento o precio); no aplica a las nuevas. */
  badge?: string;
}

/**
 * La tarjeta de una promoción, según su plantilla. La usan la vista previa del editor y el perfil del negocio: lo que
 * ves al crearla es lo que se publica. Nunca lleva el motivo interno.
 *
 * - Celebración: el mensaje manda, sin precios.
 * - Servicio estrella: el servicio y su precio habitual.
 * - Paquete: lo que incluye, con el precio habitual de cada servicio.
 */
export function PromotionCardView({ model, badge }: Props) {
  const label = [model.title, model.message, ...model.services.map((s) => (s.price ? `${s.name}, ${s.price}` : s.name)), model.until]
    .filter(Boolean)
    .join('. ');
  const star = model.template === 'servicio_estrella' ? model.services[0] : undefined;

  return (
    <View accessible accessibilityLabel={label} style={[styles.card, model.template === 'celebracion' && styles.cardCelebration]}>
      <View style={styles.top}>
        <Text style={styles.title} numberOfLines={2}>
          {model.title || 'Tu título'}
        </Text>
        {badge ? <Text style={styles.badge}>{badge}</Text> : null}
      </View>

      {star ? (
        <View style={styles.star}>
          <Text style={styles.starName}>{star.name}</Text>
          {star.price ? <Text style={styles.starPrice}>Precio habitual {star.price}</Text> : null}
        </View>
      ) : null}

      {model.template === 'paquete' && model.services.length > 0 ? (
        <View style={styles.pack}>
          <Text style={styles.packLabel}>Incluye</Text>
          {model.services.map((s) => (
            <View key={s.name} style={styles.packRow}>
              <Text style={styles.packName}>{s.name}</Text>
              {s.price ? <Text style={styles.packPrice}>{s.price}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}

      {model.message ? <Text style={styles.message}>{model.message}</Text> : null}
      {model.until ? <Text style={styles.until}>{model.until}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: spacing.sm },
  cardCelebration: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  title: { flex: 1, fontSize: 17, fontFamily: fonts.display.bold, color: colors.ink },
  badge: { fontSize: 15, fontFamily: fonts.display.bold, color: colors.primary },
  star: { gap: 2 },
  starName: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  starPrice: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.muted },
  pack: { gap: 4, paddingTop: 2 },
  packLabel: { fontSize: 12, fontFamily: fonts.ui.extrabold, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.muted },
  packRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  packName: { flex: 1, fontSize: 14, fontFamily: fonts.ui.bold, color: colors.ink },
  packPrice: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.muted },
  message: { fontSize: 14, fontFamily: fonts.ui.medium, color: colors.ink },
  until: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted },
});
