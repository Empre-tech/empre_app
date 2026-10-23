import { useQuery } from '@tanstack/react-query';
import { StyleSheet, Text, View } from 'react-native';
import { offersApi, statusApi } from '@/api/offers';
import { statusChips } from '@/lib/profile';
import { colors, fonts, radius, spacing } from '@/theme';

interface Props {
  entityId: string;
  hasHours: boolean;
  isOpen: boolean;
  /** Sin el chip de abierto/cerrado (la portada ya lo dice con la hora): solo disponibilidad y canjes. */
  extrasOnly?: boolean;
}

/**
 * Fila viva bajo el nombre: abierto/cerrado, la disponibilidad que el negocio
 * publicó (el servidor la oculta pasadas 6 h) y los canjes confirmados de la
 * semana. Cada chip dice su estado en texto además del color.
 */
export function StatusChips({ entityId, hasHours, isOpen, extrasOnly }: Props) {
  const status = useQuery({ queryKey: ['status', entityId], queryFn: () => statusApi.get(entityId), enabled: Boolean(entityId) });
  const activity = useQuery({ queryKey: ['activity', entityId], queryFn: () => offersApi.activity(entityId), enabled: Boolean(entityId) });

  const all = statusChips({ hasHours, isOpen, availability: status.data?.availability, weekRedemptions: activity.data });
  const chips = extrasOnly ? all.filter((c) => c.key !== 'open' && c.key !== 'closed') : all;
  if (chips.length === 0) return null;

  return (
    <View style={styles.row}>
      {chips.map((chip) => (
        <View key={chip.key} style={[styles.chip, chip.key === 'open' && styles.open, chip.key === 'closed' && styles.closed, chip.key === 'availability' && styles.availability]}>
          {chip.key === 'open' || chip.key === 'closed' ? <View style={[styles.dot, chip.key === 'open' ? styles.dotOpen : styles.dotClosed]} /> : null}
          <Text style={[styles.text, chip.key === 'open' && styles.textOpen, chip.key === 'closed' && styles.textClosed, chip.key === 'availability' && styles.textAvailability]}>{chip.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.primarySoft },
  open: { backgroundColor: colors.successSoft },
  closed: { backgroundColor: colors.dangerSoft },
  availability: { backgroundColor: colors.accentSoft },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dotOpen: { backgroundColor: colors.success },
  dotClosed: { backgroundColor: colors.danger },
  text: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.primaryDark },
  textOpen: { color: colors.successInk },
  textClosed: { color: colors.dangerInk },
  textAvailability: { color: colors.accentInk },
});
