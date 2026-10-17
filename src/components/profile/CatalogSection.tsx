import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { catalogApi } from '@/api/catalog';
import { categoryColor } from '@/lib/categoryColor';
import { CATALOG_PREVIEW, catalogCount, freshnessNote, priceText, serviceLabel, type CatalogCopy, type ServiceItem } from '@/lib/catalog';
import { displayIcon } from '@/lib/mapView';
import { useNow } from '@/lib/useNow';
import { colors, fonts, radius, spacing } from '@/theme';
import { SectionHeader } from './SectionHeader';

interface Props {
  entityId: string;
  isOwner: boolean;
  /** Textos según el tipo de negocio («Carta», «Servicios», «Productos»…). */
  copy: CatalogCopy;
  /** Color e icono de la categoría, para la marca de cada ítem. */
  color?: string | null;
  icon?: string | null;
  /** Tocar un ítem: preguntar por él al negocio. */
  onAsk: (item: ServiceItem) => void;
  /** «Ver todos ›»: la pantalla del catálogo con buscador y secciones. */
  onAll: () => void;
}

/** Una fila del catálogo: marca de la categoría, nombre, descripción y precio habitual (o «Consultar»). */
export function CatalogRow({ item, color, icon, onPress, first }: { item: ServiceItem; color?: string | null; icon?: string | null; onPress: () => void; first?: boolean }) {
  const price = priceText(item);
  const cat = categoryColor(color);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${serviceLabel(item)}. Preguntar al negocio`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !first && styles.rowBorder, pressed && styles.pressed]}
    >
      <View style={[styles.mark, { backgroundColor: cat.bg }]}>
        <Ionicons name={displayIcon(icon) as keyof typeof Ionicons.glyphMap} size={18} color={cat.fg} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.name}>{item.name}</Text>
        {item.description ? (
          <Text style={styles.desc} numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}
      </View>
      <Text style={price ? styles.price : styles.consult}>{price ?? 'Consultar'}</Text>
    </Pressable>
  );
}

/**
 * El catálogo en el perfil (3.27/3.28): se llama según el negocio (Carta, Servicios, Productos…), muestra hasta 5 ítems
 * y «Ver todos ›» abre su pantalla con buscador y secciones. Tocar un ítem abre el mensaje para preguntar. Es el
 * catálogo habitual: las ofertas van en su propio apartado y aquí no se mezclan. Sin ítems no se dibuja para el
 * público; el dueño ve un acceso para empezar.
 */
export function CatalogSection({ entityId, isOwner, copy, color, icon, onAsk, onAll }: Props) {
  const router = useRouter();
  const now = useNow(60_000);
  const catalog = useQuery({ queryKey: ['catalog', entityId], queryFn: () => catalogApi.list(entityId), enabled: Boolean(entityId), staleTime: 60_000 });

  const items = catalog.data ?? [];
  const edit = () => router.push({ pathname: '/business/catalog/[id]', params: { id: entityId } });

  if (items.length === 0) {
    if (!isOwner || catalog.isLoading) return null;
    return (
      <Pressable accessibilityRole="button" onPress={edit} style={styles.ownerLink}>
        <Ionicons name="pricetags-outline" size={16} color={colors.primary} />
        <Text style={styles.ownerLinkText}>Añadir a tu {copy.noun.toLocaleLowerCase('es')}</Text>
      </Pressable>
    );
  }

  const shown = items.slice(0, CATALOG_PREVIEW);
  const note = freshnessNote(items, now);
  const more = items.length > CATALOG_PREVIEW;

  return (
    <View style={styles.section}>
      <SectionHeader
        title={copy.noun}
        count={catalogCount(copy, items.length)}
        link={more ? (copy.noun === 'Carta' ? 'Ver la carta' : 'Ver todos') : isOwner ? 'Editar' : null}
        onLink={more ? onAll : edit}
      />
      <View style={styles.card}>
        {shown.map((item, i) => (
          <CatalogRow key={item.id} item={item} color={color} icon={icon} first={i === 0} onPress={() => onAsk(item)} />
        ))}
      </View>
      <Text style={styles.note}>{[note, 'toca uno para preguntar'].filter(Boolean).join(' · ')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, paddingHorizontal: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, minHeight: 56 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.line },
  pressed: { opacity: 0.8 },
  mark: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 15, fontFamily: fonts.ui.bold, color: colors.ink },
  desc: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  price: { fontSize: 15, fontFamily: fonts.display.bold, color: colors.ink },
  consult: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.muted },
  note: { fontSize: 12, fontFamily: fonts.ui.medium, color: colors.muted },
  ownerLink: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  ownerLinkText: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.primary },
});
