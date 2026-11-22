import { Ionicons } from '@/components/Icon';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { priceText, type ServiceItem } from '@/lib/catalog';
import { colors, fonts, radius, spacing } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

interface Props {
  /** Lo que el negocio muestra a sus clientes (sin variantes ni retirados). */
  items: ServiceItem[];
  status: { text: string } | null;
  location: string;
  rating: { text: string; hasScore: boolean };
  isOwner: boolean;
  hasOffers: boolean;
  hasPhotos: boolean;
  onCatalog: () => void;
  onInfo: () => void;
  onReviews: () => void;
  onNewOffer?: () => void;
  onPhotos?: () => void;
}

/**
 * El resumen de Inicio (2026-11-22): un vistazo a cada apartado del perfil (lo que ofrece, cuándo abre y dónde queda,
 * qué dicen las reseñas), cada uno lleva a su pestaña. Así Inicio nunca sale vacío aunque el negocio no tenga ofertas
 * ni fotos. Al dueño le dice además qué lo llenaría.
 */
export function InicioSummary(p: Props) {
  const top = p.items.slice(0, 3);
  const nudges: { key: string; text: string; icon: IconName; onPress?: () => void }[] = p.isOwner
    ? [
        ...(!p.hasOffers && p.onNewOffer ? [{ key: 'offer', text: 'Publica una oferta: sale aquí y en Ofertas', icon: 'pricetag-outline' as IconName, onPress: p.onNewOffer }] : []),
        ...(!p.hasPhotos && p.onPhotos ? [{ key: 'photos', text: 'Sube fotos de tu negocio', icon: 'camera-outline' as IconName, onPress: p.onPhotos }] : []),
      ]
    : [];
  return (
    <View style={{ gap: spacing.md }}>
      {nudges.length ? (
        <View style={styles.card}>
          <Text style={styles.eyebrow}>Así ven tus clientes tu Inicio</Text>
          {nudges.map((n) => (
            <Pressable key={n.key} accessibilityRole="button" onPress={n.onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <View style={styles.icon}>
                <Ionicons name={n.icon} size={18} color={colors.primaryDark} />
              </View>
              <Text style={[styles.rowText, { flex: 1 }]}>{n.text}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
          ))}
        </View>
      ) : null}

      {p.items.length > 0 ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Lo que ofrece: ${p.items.length}. Ver el catálogo`} onPress={p.onCatalog} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
          <View style={styles.head}>
            <Text style={styles.title}>Lo que ofrece</Text>
            <Text style={styles.link}>{`Ver ${p.items.length}`}</Text>
          </View>
          {top.map((it) => (
            <View key={it.id} style={styles.item}>
              <Text style={[styles.rowText, { flex: 1 }]} numberOfLines={1}>
                {it.name}
              </Text>
              <Text style={styles.price}>{priceText(it) ?? 'Consultar'}</Text>
            </View>
          ))}
        </Pressable>
      ) : null}

      <Pressable accessibilityRole="button" onPress={p.onInfo} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
        <View style={styles.head}>
          <Text style={styles.title}>Horario y ubicación</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.muted} />
        </View>
        <View style={styles.row}>
          <Ionicons name="time-outline" size={18} color={colors.muted} />
          <Text style={styles.rowText}>{p.status?.text ?? 'Sin horario publicado'}</Text>
        </View>
        {p.location ? (
          <View style={styles.row}>
            <Ionicons name="location-outline" size={18} color={colors.muted} />
            <Text style={[styles.rowText, { flex: 1 }]} numberOfLines={2}>
              {p.location}
            </Text>
          </View>
        ) : null}
      </Pressable>

      <Pressable accessibilityRole="button" onPress={p.onReviews} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
        <View style={styles.head}>
          <Text style={styles.title}>Reseñas</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.muted} />
        </View>
        <Text style={styles.rowText}>{p.rating.text}</Text>
        {!p.rating.hasScore && !p.isOwner ? <Text style={styles.meta}>Cuéntale a otros cómo te fue.</Text> : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  pressed: { backgroundColor: colors.well },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.muted, letterSpacing: 0.5, textTransform: 'uppercase' },
  title: { fontSize: 16, fontFamily: fonts.display.bold, color: colors.ink },
  link: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 32 },
  rowText: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 36, borderTopWidth: 1, borderTopColor: colors.line },
  price: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  icon: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  meta: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
});
