import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { entitiesApi } from '@/api/endpoints';
import { ledgerApi } from '@/api/ledger';
import { VoiceSheet } from '@/components/ledger/VoiceSheet';
import { SystemHead, SystemTitle } from '@/components/system/parts';
import { colors, fonts, softShadow } from '@/theme';

export type FinanceSpace = 'hoy' | 'plata' | 'cuentas' | 'rentabilidad';

const SPACES: { key: FinanceSpace; label: string; flex: number }[] = [
  { key: 'hoy', label: 'Hoy', flex: 3 },
  { key: 'plata', label: 'Plata', flex: 3 },
  { key: 'cuentas', label: 'Cuentas', flex: 3.4 },
  { key: 'rentabilidad', label: 'Rentabilidad', flex: 4.6 },
];

/** Lo que se repite arriba en cada espacio de Finanzas: de qué negocio, dictar, el título y los cuatro espacios. */
export function FinanceTop({ entityId, space, title }: { entityId: string; space: FinanceSpace; title: string }) {
  const router = useRouter();
  const [voiceOpen, setVoiceOpen] = useState(false);
  const entity = useQuery({ queryKey: ['entity', entityId], queryFn: () => entitiesApi.get(entityId), enabled: Boolean(entityId), staleTime: 60_000 });
  const items = useQuery({ queryKey: ['ledger', entityId, 'items'], queryFn: () => ledgerApi.items(entityId), enabled: Boolean(entityId), staleTime: 60_000 });

  const go = (key: FinanceSpace) => {
    if (key === space) return;
    const params = { id: entityId };
    // Cambiar de espacio no apila pantallas: «Volver» siempre sale de Finanzas.
    if (key === 'hoy') router.replace({ pathname: '/business/ledger/[id]', params });
    else if (key === 'plata') router.replace({ pathname: '/business/ledger/plata/[id]', params });
    else if (key === 'cuentas') router.replace({ pathname: '/business/ledger/debts/[id]', params });
    else router.replace({ pathname: '/business/ledger/rentabilidad/[id]', params });
  };

  return (
    <View style={styles.top}>
      <SystemHead
        lead="Finanzas de"
        name={entity.data?.name}
        right={
          <Pressable accessibilityRole="button" accessibilityLabel="Dictar una venta o gasto" onPress={() => setVoiceOpen(true)} style={styles.mic}>
            <Ionicons name="mic-outline" size={20} color={colors.ink} />
          </Pressable>
        }
      />
      <SystemTitle>{title}</SystemTitle>
      <View accessibilityRole="tablist" accessibilityLabel="Espacios de Empre Finance" style={styles.spaces}>
        {SPACES.map((s) => {
          const on = s.key === space;
          return (
            <Pressable key={s.key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => go(s.key)} style={[styles.space, { flex: s.flex }, on && styles.spaceOn]}>
              <Text style={styles.spaceText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                {s.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <VoiceSheet entityId={entityId} visible={voiceOpen} onClose={() => setVoiceOpen(false)} hints={(items.data ?? []).map((i) => i.name)} />
    </View>
  );
}

/** Tres cifras en fila, con su etiqueta. */
export function Mini3({ items }: { items: [string, string][] }) {
  return (
    <View style={styles.minis}>
      {items.map(([label, value]) => (
        <View key={label} style={styles.mini}>
          <Text style={styles.miniLabel} numberOfLines={1}>
            {label}
          </Text>
          <Text style={styles.miniValue} numberOfLines={1} adjustsFontSizeToFit>
            {value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { gap: 14 },
  mic: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, ...softShadow },
  spaces: { minHeight: 52, flexDirection: 'row', gap: 2, padding: 4, borderRadius: 16, backgroundColor: colors.surface, ...softShadow },
  space: { minWidth: 0, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2, borderRadius: 12 },
  spaceOn: { borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.selectedSoft },
  spaceText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  minis: { flexDirection: 'row', gap: 12 },
  mini: { flex: 1, minWidth: 0, gap: 1 },
  miniLabel: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  miniValue: { fontSize: 16, fontFamily: fonts.ui.extrabold, color: colors.ink, fontVariant: ['tabular-nums'] },
});
