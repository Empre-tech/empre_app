import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { EntityMap } from '@/api/types';
import { formatDistance } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';
import { Avatar } from './Avatar';
import { VerifiedBadge } from './VerifiedBadge';

interface Props {
  entity: EntityMap;
  distanceKm?: number | null;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Fila/tarjeta de negocio: se usa en la lista y en la vista previa del mapa. */
export function BusinessRow({ entity, distanceKm, onPress, style }: Props) {
  const distance = formatDistance(distanceKm);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ver perfil de ${entity.name}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, style]}
    >
      <Avatar uri={entity.profile_url} name={entity.name} size={56} />
      <View style={styles.info}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={1}>
            {entity.name}
          </Text>
          {entity.is_verified ? <VerifiedBadge /> : null}
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {[entity.category_name, distance].filter(Boolean).join(' · ')}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
  },
  pressed: { opacity: 0.85 },
  info: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1, fontSize: 16, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 14, color: colors.muted },
});
