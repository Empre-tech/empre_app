import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useEntitySections, type SectionKind, type SectionPick } from '@/api/sections';
import { SectionSheet } from '@/components/catalog/SectionSheet';
import { Chip } from '@/components/ledger/parts';
import { colors, spacing } from '@/theme';

interface Props {
  entityId: string;
  kind: SectionKind;
  value: SectionPick | null;
  onChange: (s: SectionPick) => void;
}

/**
 * Elegir sección en una hoja pequeña: las secciones del negocio como fichas (un toque elige) y «Más…» para el resto
 * del catálogo o pedir una que no está. No hay «sin sección» ni sección escrita a mano.
 */
export function SectionChooser({ entityId, kind, value, onChange }: Props) {
  const mine = useEntitySections(entityId, kind);
  const [sheet, setSheet] = useState(false);
  const list = mine.data ?? [];
  const known = value ? list.some((s) => s.id === value.id) : true;
  if (mine.isLoading) return <ActivityIndicator color={colors.primary} style={{ alignSelf: 'flex-start' }} />;
  return (
    <View style={styles.wrap} accessibilityRole="radiogroup">
      {list.map((s) => (
        <Chip key={s.id} label={s.name} selected={value?.id === s.id} onPress={() => onChange({ id: s.id, name: s.name })} />
      ))}
      {value && !known ? <Chip label={value.name} selected onPress={() => setSheet(true)} /> : null}
      <Chip label="Más…" icon="add" selected={false} onPress={() => setSheet(true)} />
      <SectionSheet visible={sheet} entityId={entityId} kind={kind} value={value?.id} onPick={onChange} onClose={() => setSheet(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
