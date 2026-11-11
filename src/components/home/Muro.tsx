import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Cover } from '@/components/Cover';
import { colors, fonts } from '@/theme';

export interface MuroPin {
  key: string;
  photo?: string | null;
  category?: string | null;
  icon?: string | null;
  title: string;
  /** Precio ya formateado, o una línea corta («Tu historia · 2014»). */
  sub?: string | null;
  /** Etiqueta coral de oferta (-20 %, 2x1). */
  tag?: string | null;
  /** Ficha sobre la foto: una hora libre (violeta), algo nuevo (negro con verde) o un año de su historia. */
  chip?: { text: string; tone: 'agenda' | 'new' | 'story' } | null;
  /** Quién lo vende y a cuántos minutos (en el muro de muchos negocios). */
  who?: string | null;
  near?: string | null;
  onPress: () => void;
}

// Alturas que se repiten para que el muro no se vea en filas (foto alta, cuadrada, apaisada).
const RATIOS = [0.75, 1, 0.8, 0.75, 1, 0.8];

const CHIP = {
  agenda: { bg: colors.agendaSoft, fg: colors.agenda },
  new: { bg: colors.night, fg: colors.glow },
  story: { bg: 'rgba(17,19,24,0.78)', fg: '#FFFFFF' },
} as const;

function Pin({ p, ratio }: { p: MuroPin; ratio: number }) {
  const label = [p.title, p.sub, p.tag ? `oferta ${p.tag}` : null, p.chip?.text, p.who, p.near].filter(Boolean).join(', ');
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={p.onPress} style={({ pressed }) => [styles.pin, pressed && { opacity: 0.88 }]}>
      <Cover photo={p.photo} category={p.category} icon={p.icon} iconSize={40} style={[styles.photo, { aspectRatio: ratio }]}>
        {p.tag ? (
          <View style={styles.tag}>
            <Text style={styles.tagText}>{p.tag}</Text>
          </View>
        ) : null}
        {p.chip ? (
          <View style={[styles.chip, p.chip.tone === 'story' ? styles.chipTop : styles.chipBottom, { backgroundColor: CHIP[p.chip.tone].bg }]}>
            <Text style={[styles.chipText, { color: CHIP[p.chip.tone].fg }]}>{p.chip.text}</Text>
          </View>
        ) : null}
      </Cover>
      <Text style={styles.title} numberOfLines={2}>
        {p.title}
      </Text>
      {p.sub ? <Text style={styles.sub}>{p.sub}</Text> : null}
      {p.who ? (
        <Text style={styles.who} numberOfLines={1}>
          {p.who}
          {p.near ? <Text style={styles.near}> · {p.near}</Text> : null}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * El muro tipo Pinterest de Empre: dos columnas, fotos de alturas distintas y el texto debajo, sin tarjetas.
 * Sirve para el inicio (lo que ofrecen muchos negocios cerca) y para el perfil de un negocio (su historia y sus servicios).
 */
export function Muro({ pins }: { pins: MuroPin[] }) {
  const cols: { p: MuroPin; ratio: number }[][] = [[], []];
  pins.forEach((p, i) => cols[i % 2].push({ p, ratio: RATIOS[i % RATIOS.length] }));
  return (
    <View style={styles.muro}>
      {cols.map((col, c) => (
        <View key={c} style={styles.col}>
          {col.map(({ p, ratio }) => (
            <Pin key={p.key} p={p} ratio={ratio} />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  muro: { flexDirection: 'row', gap: 10 },
  col: { flex: 1, gap: 14 },
  pin: { gap: 4 },
  photo: { width: '100%', height: undefined, borderRadius: 16, overflow: 'hidden' },
  tag: { position: 'absolute', left: 8, top: 8, paddingHorizontal: 8, paddingVertical: 2, borderTopLeftRadius: 3, borderBottomLeftRadius: 3, borderTopRightRadius: 8, borderBottomRightRadius: 8, backgroundColor: colors.accent },
  tagText: { fontFamily: fonts.ui.extrabold, fontSize: 11.5, color: colors.ink },
  chip: { position: 'absolute', left: 8, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
  chipTop: { top: 8 },
  chipBottom: { bottom: 8 },
  chipText: { fontFamily: fonts.ui.extrabold, fontSize: 11.5 },
  title: { fontFamily: fonts.ui.extrabold, fontSize: 13, lineHeight: 17, color: colors.ink, paddingHorizontal: 2 },
  sub: { fontFamily: fonts.ui.extrabold, fontSize: 13, color: colors.ink, paddingHorizontal: 2, marginTop: -2 },
  who: { fontFamily: fonts.ui.bold, fontSize: 11.5, color: colors.muted, paddingHorizontal: 2 },
  near: { fontFamily: fonts.ui.extrabold, color: colors.brand },
});
