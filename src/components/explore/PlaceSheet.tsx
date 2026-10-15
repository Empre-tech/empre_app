import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { categoryColor } from '@/lib/categoryColor';
import { resolveImageUrl } from '@/lib/image';
import { colors, fonts, radius, shadow, spacing } from '@/theme';
import { formatFeaturedDistance, type WithDistance } from './FeaturedCard';

interface Props {
  items: WithDistance[];
  bottomInset: number;
  onSelect: (entity: WithDistance) => void;
  onClose: () => void;
}

/**
 * «En este lugar»: los negocios que comparten un mismo punto (un centro
 * comercial, una esquina). El zoom nunca los separa, así que se listan, con
 * los que tienen oferta primero.
 */
export function PlaceSheet({ items, bottomInset, onSelect, onClose }: Props) {
  // Con oferta primero; dentro de cada grupo se respeta el orden del ranking.
  const ordered = [...items].sort((a, b) => Number(!!b.has_active_offer) - Number(!!a.has_active_offer));

  return (
    <View style={[styles.sheet, { paddingBottom: bottomInset + spacing.md }]} accessibilityViewIsModal>
      <View style={styles.handle} />
      <View style={styles.header}>
        <Text style={styles.title}>
          En este lugar · {ordered.length} {ordered.length === 1 ? 'negocio' : 'negocios'}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar la lista" onPress={onClose} hitSlop={10}>
          <Ionicons name="close" size={22} color={colors.muted} />
        </Pressable>
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {ordered.map((entity) => (
          <Row key={entity.id} entity={entity} onPress={() => onSelect(entity)} />
        ))}
      </ScrollView>
    </View>
  );
}

function Row({ entity, onPress }: { entity: WithDistance; onPress: () => void }) {
  const cat = categoryColor(entity.category_color);
  const thumb = entity.profile_url ? resolveImageUrl(entity.profile_url) : null;
  const icon = (entity.category_icon || 'storefront-outline') as keyof typeof Ionicons.glyphMap;
  const distance = formatFeaturedDistance(entity.distanceKm);
  const state = entity.has_hours ? (entity.is_open_now ? 'Abierto' : 'Cerrado') : null;
  const meta = [entity.category_name, distance, state].filter(Boolean).join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${entity.name}${entity.has_active_offer ? ', con oferta' : ''}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
    >
      <View style={[styles.avatar, { backgroundColor: cat.bg }]}>
        {thumb ? (
          <Image accessible={false} source={{ uri: thumb }} style={styles.avatarImage} contentFit="cover" transition={120} />
        ) : (
          <Ionicons name={icon} size={22} color={cat.fg} />
        )}
      </View>
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>
          {entity.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      {entity.has_active_offer ? (
        <View style={styles.offer}>
          <Ionicons name="flash" size={12} color={colors.ink} />
          <Text style={styles.offerText}>Oferta</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: spacing.sm,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    ...shadow,
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  title: { fontSize: 16, fontFamily: fonts.display.bold, color: colors.ink, flexShrink: 1, marginRight: spacing.sm },
  list: { maxHeight: 320 },
  listContent: { paddingHorizontal: spacing.md, gap: spacing.sm, paddingBottom: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: '100%', height: '100%' },
  text: { flex: 1, gap: 2 },
  name: { fontSize: 14, fontFamily: fonts.display.bold, color: colors.ink },
  meta: { fontSize: 12, fontFamily: fonts.ui.medium, color: colors.muted },
  // Texto en tinta sobre ámbar: el blanco no llega a 4,5:1.
  offer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  offerText: { fontSize: 11.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
});
