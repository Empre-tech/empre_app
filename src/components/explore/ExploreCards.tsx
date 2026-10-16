import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { resolveImageUrl } from '@/lib/image';
import type { Pill } from '@/lib/discover';
import { colors, fonts, radius, spacing } from '@/theme';

/** Lo que necesita cualquier tarjeta o fila del panel, venga de discovery o de Descubre. */
export interface CardModel {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  /** Foto de perfil (filas y tarjetas compactas). */
  image?: string | null;
  /** Portada (tarjetas de Descubre). Sin portada sale el círculo con el icono. */
  cover?: string | null;
  color: { bg: string; fg: string };
  icon: string;
  /** true/false si tiene horario; null si no lo configuró. */
  open: boolean | null;
  distance: string | null;
  sub: string;
  /** Tercera línea: motivo de coincidencia, frase corta o «Abierto · hasta…». */
  line?: string;
  pill?: Pill | null;
  /** Tiene un QR activo del usuario: la pastilla pasa a verde. */
  mine?: boolean;
}

function Circle({ model, size }: { model: CardModel; size: number }) {
  const src = model.image ? resolveImageUrl(model.image) : null;
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: model.color.fg }]}>
      {src ? (
        <Image accessible={false} source={{ uri: src }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />
      ) : (
        <Ionicons name={model.icon as keyof typeof Ionicons.glyphMap} size={size * 0.46} color="#fff" />
      )}
    </View>
  );
}

/** Pastilla única: ⚡ y el tiempo de la oferta, «Nuevo · hace 2 h», o «Tu QR». Nunca una cantidad. */
export function PillView({ pill, mine, floating }: { pill?: Pill | null; mine?: boolean; floating?: boolean }) {
  if (mine) {
    return (
      <View style={[styles.pill, styles.pillMine, floating && styles.pillFloating]}>
        <Ionicons name="qr-code" size={11} color="#1D6B3D" />
        <Text style={[styles.pillText, styles.pillTextMine]}>Tu QR</Text>
      </View>
    );
  }
  if (!pill) return null;
  const offer = pill.kind === 'offer';
  return (
    <View style={[styles.pill, offer ? styles.pillOffer : styles.pillNew, floating && styles.pillFloating]}>
      {offer ? <Ionicons name="flash" size={11} color={colors.ink} /> : null}
      <Text style={[styles.pillText, !offer && styles.pillTextNew]}>{pill.text}</Text>
    </View>
  );
}

function StatusText({ open }: { open: boolean | null }) {
  if (open === null) return null;
  return <Text style={open ? styles.open : styles.closed}>{open ? 'Abierto' : 'Cerrado'}</Text>;
}

/** Tarjeta de Descubre: portada (o círculo si el negocio no subió una), una sola razón y nada más. */
export function DiscoverCard({ model, selected, onPress }: { model: CardModel; selected?: boolean; onPress: () => void }) {
  const cover = model.cover ? resolveImageUrl(model.cover) : null;
  const label = [model.name, model.sub, model.distance, model.pill?.text, model.line].filter(Boolean).join(', ');
  const text = (
    <View style={styles.dcText}>
      <Text style={styles.dcName} numberOfLines={1}>
        {model.name}
      </Text>
      <Text style={styles.dcMeta} numberOfLines={1}>
        {[model.sub, model.distance].filter(Boolean).join(' · ')}
      </Text>
      {model.line ? (
        <Text style={[styles.dcMeta, model.line.startsWith('Abierto') && styles.open]} numberOfLines={1}>
          {model.line}
        </Text>
      ) : null}
    </View>
  );
  if (!cover) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.dcard, styles.dcardNoPhoto, selected && styles.selected, pressed && styles.pressed]}>
        <View style={styles.dcTop}>
          <Circle model={{ ...model, image: null }} size={40} />
          <PillView pill={model.pill} mine={model.mine} />
        </View>
        {text}
      </Pressable>
    );
  }
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.dcard, pressed && styles.pressed]}>
      <View style={[styles.cover, { backgroundColor: model.color.bg }, selected && styles.coverSelected]}>
        <Image accessible={false} source={{ uri: cover }} style={styles.coverImage} contentFit="cover" transition={150} />
        <PillView pill={model.pill} mine={model.mine} floating />
      </View>
      {text}
    </Pressable>
  );
}

/** Tarjeta compacta (intermedio de Todos y de resultados): círculo, pastilla, nombre y estado. */
export function MiniCard({ model, selected, onPress }: { model: CardModel; selected?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[model.name, model.distance, model.line].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => [styles.mini, selected && styles.selected, pressed && styles.pressed]}
    >
      <View style={styles.dcTop}>
        <Circle model={model} size={40} />
        <PillView pill={model.pill} mine={model.mine} />
      </View>
      <Text style={styles.dcName} numberOfLines={1}>
        {model.name}
      </Text>
      <Text style={styles.dcMeta} numberOfLines={1}>
        <StatusText open={model.open} />
        {model.open !== null && model.distance ? ' · ' : ''}
        {model.distance ?? ''}
      </Text>
      <Text style={[styles.dcMeta, model.line ? styles.why : null]} numberOfLines={1}>
        {model.line || model.sub}
      </Text>
    </Pressable>
  );
}

/** Fila del panel expandido: círculo, nombre, estado · subcategoría · distancia, motivo y pastilla. */
export function MiniRow({ model, selected, onPress }: { model: CardModel; selected?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[model.name, model.open === null ? null : model.open ? 'Abierto' : 'Cerrado', model.sub, model.distance, model.line].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => [styles.row, selected && styles.selected, pressed && styles.pressed]}
    >
      <Circle model={model} size={46} />
      <View style={styles.rowText}>
        <Text style={styles.rowName} numberOfLines={1}>
          {model.name}
        </Text>
        <Text style={styles.dcMeta} numberOfLines={1}>
          <StatusText open={model.open} />
          {model.open !== null ? ' · ' : ''}
          {[model.sub, model.distance].filter(Boolean).join(' · ')}
        </Text>
        {model.line ? (
          <Text style={[styles.dcMeta, styles.why]} numberOfLines={1}>
            {model.line}
          </Text>
        ) : null}
      </View>
      <PillView pill={model.pill} mine={model.mine} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 24, paddingHorizontal: 9, borderRadius: radius.pill, alignSelf: 'flex-start' },
  pillFloating: { position: 'absolute', left: 8, bottom: 8 },
  pillOffer: { backgroundColor: colors.accent },
  pillNew: { backgroundColor: colors.ink },
  pillMine: { backgroundColor: '#E3F4EA' },
  pillText: { fontSize: 11, fontFamily: fonts.ui.extrabold, color: colors.ink },
  pillTextNew: { color: '#fff' },
  pillTextMine: { color: '#1D6B3D' },
  open: { color: '#1D6B3D', fontFamily: fonts.ui.bold },
  closed: { color: '#9B2C2C', fontFamily: fonts.ui.bold },
  why: { color: colors.primaryDark },
  pressed: { opacity: 0.85 },
  selected: { borderColor: colors.primary, borderWidth: 1.5 },
  dcard: { width: 216 },
  dcardNoPhoto: { borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.lg, padding: spacing.md, backgroundColor: colors.surface },
  dcTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm },
  cover: { height: 112, borderRadius: radius.lg, overflow: 'hidden' },
  coverSelected: { borderWidth: 3, borderColor: colors.primary },
  coverImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  dcText: { paddingTop: spacing.sm, paddingHorizontal: 2, gap: 1 },
  dcName: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  dcMeta: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted },
  mini: { width: 168, padding: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, gap: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.sm, marginHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: 'transparent' },
  rowText: { flex: 1, minWidth: 0, gap: 1 },
  rowName: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
});
