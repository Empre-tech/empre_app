import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StockMode } from '@/api/ledger';
import { Chip } from '@/components/ledger/parts';
import { LOCKED_OPACITY, ProTag } from '@/components/pro/ProTag';
import { MODE_LABEL } from '@/lib/inventory';
import { useEntityPlan } from '@/lib/useProPlan';
import { colors, fonts, radius, spacing } from '@/theme';

/** Lo que se dice cuando alguien en Base toca «Cantidad exacta». */
export const EXACT_IS_PRO = 'Contar cuántos hay es de Empre Pro. En Base llevas el semáforo: hay, queda poco o se acabó.';

/**
 * Cómo se lleva la cuenta (2026-11-22): semáforo o cantidad exacta. Ya no se ofrece «Sin control». La cantidad exacta
 * es de Empre Pro: en Base se ve en gris con la corona y, al tocarla, dice por qué.
 */
export function TrackModeChips({ entityId, value, onPick }: { entityId: string; value: string; onPick: (m: StockMode) => void }) {
  const plan = useEntityPlan(entityId);
  const [note, setNote] = useState(false);
  return (
    <View style={{ gap: spacing.xs }}>
      <View style={styles.wrap}>
        <Chip label={MODE_LABEL.light} selected={value === 'light'} onPress={() => onPick('light')} />
        {plan.base && value !== 'exact' ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`${MODE_LABEL.exact}. Es de Empre Pro`} onPress={() => setNote(true)} style={styles.locked}>
            <Text style={[styles.lockedText, { opacity: LOCKED_OPACITY }]}>{MODE_LABEL.exact}</Text>
            <ProTag />
          </Pressable>
        ) : (
          <Chip label={MODE_LABEL.exact} selected={value === 'exact'} onPress={() => onPick('exact')} />
        )}
      </View>
      {note ? <Text style={styles.note}>{EXACT_IS_PRO}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  locked: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.well },
  lockedText: { fontSize: 13.5, fontFamily: fonts.ui.semibold, color: colors.ink },
  note: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.ui.medium, color: colors.muted },
});
