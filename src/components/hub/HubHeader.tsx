import { Ionicons } from '@/components/Icon';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { Cover } from '@/components/Cover';
import { ProgressRing } from '@/components/hub/ProgressRing';
import { SkeletonBlock } from '@/components/Skeleton';
import { colors, fonts, typeScale } from '@/theme';

interface Missing {
  title: string;
  sub: string;
  done: number;
  total: number;
}

interface Props {
  name: string;
  logo?: string | null;
  /** La portada del negocio: va de fondo arriba, como en su perfil. Sin portada, el dibujo de su categoría. */
  cover?: string | null;
  category?: string | null;
  categoryIcon?: string | null;
  /** «Abierto · cierra 8 pm» (o la categoría si no tiene horario). */
  status?: string | null;
  /** «En revisión» si aún no está verificado. */
  state?: string | null;
  /** Cuánto del perfil está completo, de 0 a 100. */
  pct: number;
  /** Solo las cifras que existen: sin datos, sin cifra. */
  stats: { value: string; label: string }[];
  missing: Missing | null;
  /** Mientras llegan las cifras y lo que falta: su lugar en gris, para que nada salte al llegar. */
  loading?: boolean;
  /** El nombre; con varios negocios, abre la lista para cambiar (ver HubName). */
  nameRow: ReactNode;
  onBack: () => void;
  onSeeProfile: () => void;
  onMissing: () => void;
}

/**
 * La cabecera de Mi negocio (lienzo v115, como el perfil de Instagram y su propio perfil): la portada de fondo con
 * volver y «Ver perfil»; el logo dentro de un anillo que se llena con lo que ya completaste; las cifras; el nombre y su
 * estado; y una línea con lo que falta, que abre la lista. Completo, el anillo se cierra y la línea se va.
 */
export function HubHeader({ name, logo, cover, category, categoryIcon, status, state, pct, stats, missing, loading, nameRow, onBack, onSeeProfile, onMissing }: Props) {
  return (
    <View style={styles.wrap}>
      <Cover photo={cover} category={category} icon={categoryIcon} style={styles.cover}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={onBack} style={styles.back}>
          <Ionicons name="chevron-back" size={20} color={colors.ink} />
        </Pressable>
        <Pressable accessibilityRole="link" accessibilityLabel={`Ver el perfil de ${name} como lo ven tus clientes`} onPress={onSeeProfile} hitSlop={6} style={styles.see}>
          <Text style={styles.seeText}>Ver perfil</Text>
        </Pressable>
      </Cover>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={missing ? `Tu perfil: ${missing.done} de ${missing.total} listo. Ver lo que falta` : `Ver el perfil de ${name}`}
          onPress={missing ? onMissing : onSeeProfile}
          style={styles.ringBg}
        >
          <ProgressRing size={80} pct={loading ? 0 : pct}>
            <Avatar uri={logo} name={name} size={66} />
          </ProgressRing>
        </Pressable>
        <View style={styles.stats}>
          {loading
            ? [0, 1, 2].map((i) => (
                <View key={i} style={styles.stat}>
                  <SkeletonBlock width={28} height={18} borderRadius={6} />
                  <SkeletonBlock width={56} height={12} borderRadius={6} style={{ marginTop: 4 }} />
                </View>
              ))
            : stats.map((s) => (
                <View key={s.label} style={styles.stat} accessible accessibilityLabel={`${s.value} ${s.label}`}>
                  <Text style={styles.statValue}>{s.value}</Text>
                  <Text style={styles.statLabel} numberOfLines={1}>
                    {s.label}
                  </Text>
                </View>
              ))}
        </View>
      </View>
      <View style={styles.who}>
        {nameRow}
        {state || status ? (
          <View style={styles.stateRow}>
            {state ? (
              <View style={styles.chip}>
                <Text style={styles.chipText}>{state}</Text>
              </View>
            ) : null}
            {status ? (
              <Text style={styles.status} numberOfLines={1}>
                {status}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
      {missing && !loading ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${missing.title}: ${missing.sub}. Ver la lista`}
          onPress={onMissing}
          style={({ pressed }) => [styles.missing, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.missingCount}>{`${missing.done}/${missing.total}`}</Text>
          <View style={styles.missingText}>
            <Text style={styles.missingTitle}>{missing.title}</Text>
            <Text style={styles.missingSub} numberOfLines={1}>
              {missing.sub}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** El nombre del negocio. Con varios, abre la lista para cambiar (la flecha lo dice). */
export function HubName({ name, onPress }: { name: string; onPress?: () => void }) {
  const text = (
    <Text style={styles.name} numberOfLines={1} accessibilityRole="header">
      {name}
    </Text>
  );
  if (!onPress) return <View style={styles.nameRow}>{text}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${name}. Cambiar de negocio`} onPress={onPress} hitSlop={6} style={styles.nameRow}>
      {text}
      <Ionicons name="chevron-down" size={16} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  cover: { height: 136, borderRadius: 20, overflow: 'hidden' },
  back: { position: 'absolute', top: 10, left: 10, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  see: { position: 'absolute', top: 14, right: 10, minHeight: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: 'center', backgroundColor: colors.surface },
  seeText: { ...typeScale.body, fontFamily: fonts.ui.semibold, color: colors.ink },
  // El anillo se monta sobre el borde de la portada, con un aro del color del fondo para que se lea encima de la foto.
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 16, marginTop: -54, paddingHorizontal: 8 },
  ringBg: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  // Las cifras quedan justo debajo de la portada (el anillo sí se monta sobre su borde).
  stats: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', gap: 4, paddingBottom: 2 },
  stat: { flex: 1, alignItems: 'center', minWidth: 0 },
  statValue: { ...typeScale.name, color: colors.ink, fontVariant: ['tabular-nums'] },
  statLabel: { ...typeScale.label, fontFamily: fonts.ui.medium, color: colors.muted },
  who: { minWidth: 0, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', maxWidth: '100%', minHeight: 28 },
  name: { ...typeScale.name, flexShrink: 1, color: colors.ink },
  stateRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.sand },
  chipText: { ...typeScale.label, color: colors.ink },
  status: { ...typeScale.body, flexShrink: 1, color: colors.muted },
  missing: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.well },
  missingCount: { ...typeScale.body, minWidth: 32, fontFamily: fonts.ui.semibold, color: colors.ink, fontVariant: ['tabular-nums'] },
  missingText: { flex: 1, minWidth: 0 },
  missingTitle: { ...typeScale.title, color: colors.ink },
  missingSub: { ...typeScale.body, color: colors.muted },
});
