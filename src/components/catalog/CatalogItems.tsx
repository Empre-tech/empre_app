import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { categoryColor } from '@/lib/categoryColor';
import { prefersCards, priceText, serviceLabel, type ServiceItem } from '@/lib/catalog';
import type { IconName } from '@/lib/icons';
import { mediaUrl } from '@/lib/image';
import { colors, fonts, radius, spacing } from '@/theme';

interface Props {
  items: ServiceItem[];
  /** El ícono de la sección de cada ítem (lo que se ve cuando no tiene foto). */
  iconOf: (item: ServiceItem) => IconName;
  /** Color de la categoría del negocio, para el fondo del ícono. */
  color?: string | null;
  onOpen: (item: ServiceItem) => void;
}

/**
 * Los productos que ve el cliente. Si al menos la mitad de lo que se muestra tiene foto, van en tarjetas de dos
 * columnas (la portada grande); si no, en lista con una miniatura. Sin foto, el ícono de su sección.
 */
export function CatalogItems({ items, iconOf, color, onOpen }: Props) {
  if (items.length === 0) return null;
  if (prefersCards(items)) {
    return (
      <View style={styles.grid}>
        {items.map((item) => (
          <CatalogCard key={item.id} item={item} icon={iconOf(item)} color={color} onPress={() => onOpen(item)} />
        ))}
      </View>
    );
  }
  return (
    <View style={styles.card}>
      {items.map((item, i) => (
        <CatalogRow key={item.id} item={item} icon={iconOf(item)} color={color} first={i === 0} onPress={() => onOpen(item)} />
      ))}
    </View>
  );
}

/** Una fila: miniatura (portada o ícono de la sección), nombre, descripción y precio (o «Consultar»). */
export function CatalogRow({ item, icon, color, onPress, first }: { item: ServiceItem; icon: IconName; color?: string | null; onPress: () => void; first?: boolean }) {
  const price = priceText(item);
  const cover = item.photos?.[0];
  const cat = categoryColor(color);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${serviceLabel(item)}. Ver detalle`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !first && styles.rowBorder, pressed && styles.pressed]}
    >
      {cover ? (
        <Image source={{ uri: mediaUrl(cover) }} style={styles.thumb} contentFit="cover" transition={150} accessibilityIgnoresInvertColors />
      ) : (
        <View style={[styles.thumb, { backgroundColor: cat.bg, alignItems: 'center', justifyContent: 'center' }]}>
          <Ionicons name={icon} size={20} color={cat.fg} />
        </View>
      )}
      <View style={styles.rowText}>
        <Text style={styles.name}>{item.name}</Text>
        {item.sold_out ? <Text style={styles.out}>Agotado</Text> : item.description ? (
          <Text style={styles.desc} numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}
      </View>
      <Text style={price ? styles.price : styles.consult}>{price ?? 'Consultar'}</Text>
    </Pressable>
  );
}

/** Una tarjeta: la portada grande (o el ícono de su sección), nombre y precio. */
function CatalogCard({ item, icon, color, onPress }: { item: ServiceItem; icon: IconName; color?: string | null; onPress: () => void }) {
  const price = priceText(item);
  const cover = item.photos?.[0];
  const n = item.photos?.length ?? 0;
  const cat = categoryColor(color);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${serviceLabel(item)}. Ver detalle`} onPress={onPress} style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
      <View style={[styles.tileImg, !cover && { backgroundColor: cat.bg }]}>
        {cover ? (
          <Image source={{ uri: mediaUrl(cover) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
        ) : (
          <View style={styles.tileIcon}>
            <Ionicons name={icon} size={34} color={cat.fg} />
          </View>
        )}
        {item.sold_out ? (
          <View style={styles.outBadge}>
            <Text style={styles.outBadgeText}>Agotado</Text>
          </View>
        ) : null}
        {n > 1 ? (
          <View style={styles.countBadge}>
            <Ionicons name="images-outline" size={12} color="#fff" />
            <Text style={styles.countText}>{n}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.tileText}>
        <Text style={styles.tileName} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={price ? styles.tilePrice : styles.consult}>{price ?? 'Consultar'}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, paddingHorizontal: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, minHeight: 56 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.line },
  pressed: { opacity: 0.85 },
  thumb: { width: 44, height: 44, borderRadius: radius.sm, overflow: 'hidden' },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 15, fontFamily: fonts.ui.bold, color: colors.ink },
  desc: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  out: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.danger },
  price: { fontSize: 15, fontFamily: fonts.display.bold, color: colors.ink },
  consult: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.sm },
  tile: { width: '48.5%', backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  tileImg: { aspectRatio: 1, backgroundColor: colors.bg },
  tileIcon: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  outBadge: { position: 'absolute', left: 8, top: 8, paddingHorizontal: 8, height: 22, borderRadius: 11, backgroundColor: '#FDECEC', justifyContent: 'center' },
  outBadgeText: { fontSize: 11, fontFamily: fonts.ui.extrabold, color: '#B3261E' },
  countBadge: { position: 'absolute', right: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, height: 22, borderRadius: 11, backgroundColor: 'rgba(22,35,58,0.72)' },
  countText: { fontSize: 11, fontFamily: fonts.ui.extrabold, color: '#fff' },
  tileText: { padding: spacing.sm, paddingHorizontal: 12, gap: 2 },
  tileName: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  tilePrice: { fontSize: 15, fontFamily: fonts.display.bold, color: colors.ink },
});
