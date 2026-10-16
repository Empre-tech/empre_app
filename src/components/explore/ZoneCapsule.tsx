import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import type { ZoneName } from '@/lib/zoneName';
import { colors, fonts, radius, shadow } from '@/theme';

/**
 * En qué zona estás, como primer chip de la fila bajo el buscador: «Centro Histórico · Santa Marta». Si el mapa mira otro
 * lugar o no hay ubicación, una nota corta lo aclara («a 4,2 km de ti», «sin ubicación»).
 */
export function ZoneCapsule({ name }: { name: ZoneName }) {
  const title = name.city && name.city !== name.title ? `${name.title} · ${name.city}` : name.title;
  return (
    <View
      accessible
      accessibilityLabel={name.note ? `${title}, ${name.note}` : title}
      style={styles.capsule}
    >
      <Ionicons name="location" size={14} color={colors.primary} />
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {name.note ? (
        <Text style={styles.note} numberOfLines={1}>
          {name.note}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  capsule: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.96)',
    ...shadow,
  },
  title: { flexShrink: 1, fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  note: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted },
});
