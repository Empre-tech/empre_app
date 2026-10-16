import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { capFichas, extrasTeaser, groupFeatured, zoneState } from '@/lib/discover';
import { colors, fonts, radius, spacing } from '@/theme';
import type { CardModel } from './ExploreCards';
import { ZoneCard } from './ZoneCard';

interface Common {
  selectedId: string | null;
  onSelect: (model: CardModel) => void;
  onOpenProfile: (id: string) => void;
}

interface Props extends Common {
  /** Destacados: los negocios directamente en la zona que se ve. */
  items: CardModel[];
  /** Adicionales: cerca pero fuera de tu zona. */
  extras: CardModel[];
  /** Hay un filtro activo (categoría, distancia o «abiertos ahora»). */
  filterActive: boolean;
  onClearFilters: () => void;
  /** Aleja el mapa para ver más negocios de la ciudad. */
  onWiden: () => void;
  /** Pasa a la pestaña Todos. */
  onSeeAll: () => void;
}

function GroupHead({ title, note, tone }: { title: string; note?: string; tone?: 'offer' | 'open' | 'extra' }) {
  return (
    <View style={styles.groupHead} accessibilityRole="header">
      <View style={[styles.dot, tone === 'offer' && styles.dotOffer, tone === 'open' && styles.dotOpen, tone === 'extra' && styles.dotExtra]} />
      <Text style={styles.groupTitle}>{title}</Text>
      {note ? <Text style={styles.groupNote}>{note}</Text> : null}
    </View>
  );
}

function FilterNote({ count, onClear }: { count: number; onClear: () => void }) {
  return (
    <View style={styles.filterNote} accessibilityRole="alert">
      <Text style={styles.filterNoteText}>
        Con tu filtro: {count} {count === 1 ? 'negocio' : 'negocios'}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Quitar filtro" onPress={onClear} style={styles.filterNoteHit}>
        <Text style={styles.filterNoteAction}>Quitar filtro</Text>
      </Pressable>
    </View>
  );
}

/** Las fichas, agrupadas (con oferta, abiertos, cerrados…) desde 4; con menos, una sola lista. */
function Fichas({ items, selectedId, onSelect, onOpenProfile }: Common & { items: CardModel[] }) {
  return (
    <>
      {groupFeatured(items).map((g) => (
        <View key={g.id}>
          {g.title ? <GroupHead title={g.title} note={String(g.items.length)} tone={g.id === 'offer' ? 'offer' : g.id === 'open' ? 'open' : undefined} /> : null}
          {g.items.map((m) => (
            <ZoneCard key={m.id} model={m} selected={selectedId === m.id} onPress={() => onSelect(m)} onOpenProfile={onOpenProfile} />
          ))}
        </View>
      ))}
    </>
  );
}

/** Sin destacados: nunca un callejón sin salida. */
function EmptyZone({ extras, filterActive, onClearFilters, onWiden, onSeeAll }: Pick<Props, 'filterActive' | 'onClearFilters' | 'onWiden' | 'onSeeAll'> & { extras: number }) {
  const text = filterActive ? 'Con tu filtro no hay negocios en esta zona.' : extras > 0 ? 'Pero hay negocios cerca, un poco más allá de tu zona.' : 'Mueve el mapa o mira toda la ciudad.';
  const primary: 'extras' | 'filters' | 'widen' = extras > 0 ? 'extras' : filterActive ? 'filters' : 'widen';
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name="map-outline" size={26} color={colors.primary} />
      </View>
      <Text style={styles.emptyTitle}>Ninguno destacado en tu zona</Text>
      <Text style={styles.emptyText}>{text}</Text>
      <View style={styles.btns}>
        {extras > 0 ? (
          <Pressable accessibilityRole="button" onPress={onSeeAll} style={[styles.btn, primary === 'extras' ? styles.btnPrimary : styles.btnSecondary]}>
            <Text style={[styles.btnText, primary === 'extras' ? styles.btnTextPrimary : null]}>
              {extras === 1 ? 'Ver el negocio cerca de ti' : `Ver los ${extras} negocios cerca de ti`}
            </Text>
          </Pressable>
        ) : null}
        {filterActive ? (
          <Pressable accessibilityRole="button" onPress={onClearFilters} style={[styles.btn, primary === 'filters' ? styles.btnPrimary : styles.btnSecondary]}>
            <Text style={[styles.btnText, primary === 'filters' ? styles.btnTextPrimary : null]}>Quitar filtros</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" onPress={onWiden} style={[styles.btn, primary === 'widen' ? styles.btnPrimary : styles.btnSecondary]}>
          <Text style={[styles.btnText, primary === 'widen' ? styles.btnTextPrimary : null]}>Ampliar a toda la ciudad</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Descubre cuando ninguna sección llega a 3 negocios (variante B del mockup `en_esta_zona.html`):
 * los destacados de tu zona como fichas (hasta 6), un aviso si hay adicionales cerca, y salidas claras
 * si no hay ninguno.
 */
export function ZoneDiscover(p: Props) {
  const state = zoneState(p.items.length, p.extras.length);
  if (state !== 'list') return <EmptyZone extras={p.extras.length} filterActive={p.filterActive} onClearFilters={p.onClearFilters} onWiden={p.onWiden} onSeeAll={p.onSeeAll} />;
  const { shown, hidden } = capFichas(p.items);
  const teaser = extrasTeaser(p.extras.length);
  return (
    <>
      {p.filterActive ? <FilterNote count={p.items.length} onClear={p.onClearFilters} /> : null}
      <GroupHead title="Destacados en tu zona" note={String(p.items.length)} />
      <Fichas items={shown} selectedId={p.selectedId} onSelect={p.onSelect} onOpenProfile={p.onOpenProfile} />
      {hidden > 0 ? (
        <Pressable accessibilityRole="button" onPress={p.onSeeAll} style={[styles.btn, styles.btnSecondary, styles.btnCenter]}>
          <Text style={styles.btnText}>Ver los {p.items.length}</Text>
        </Pressable>
      ) : null}
      {teaser ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${teaser}. Ver en Todos`} onPress={p.onSeeAll} style={styles.more}>
          <View style={styles.moreText}>
            <Text style={styles.moreTitle}>{teaser}</Text>
            <Text style={styles.moreSub}>Fuera de tu zona</Text>
          </View>
          <Text style={styles.moreAction}>Ver en Todos</Text>
        </Pressable>
      ) : null}
    </>
  );
}

/** Todos: los destacados de tu zona y, aparte, los adicionales cerca (otras zonas). */
export function ZoneAll(p: Props) {
  if (p.items.length + p.extras.length === 0) return <EmptyZone extras={0} filterActive={p.filterActive} onClearFilters={p.onClearFilters} onWiden={p.onWiden} onSeeAll={p.onSeeAll} />;
  return (
    <>
      {p.filterActive ? <FilterNote count={p.items.length + p.extras.length} onClear={p.onClearFilters} /> : null}
      <GroupHead title="Destacados en tu zona" note={String(p.items.length)} tone="open" />
      {p.items.length > 0 ? (
        <Fichas items={p.items} selectedId={p.selectedId} onSelect={p.onSelect} onOpenProfile={p.onOpenProfile} />
      ) : (
        <View style={styles.noneHere}>
          <Text style={styles.moreTitle}>Ninguno en tu zona</Text>
          <Text style={styles.moreSub}>Mira los adicionales de abajo.</Text>
        </View>
      )}
      {p.extras.length > 0 ? (
        <>
          <GroupHead title="Adicionales cerca" note={`${p.extras.length} · fuera de tu zona`} tone="extra" />
          {p.extras.map((m) => (
            <ZoneCard key={m.id} model={m} selected={p.selectedId === m.id} onPress={() => p.onSelect(m)} onOpenProfile={p.onOpenProfile} />
          ))}
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.muted },
  dotOffer: { backgroundColor: colors.accent },
  dotOpen: { backgroundColor: '#2E9E5B' },
  dotExtra: { backgroundColor: colors.primary },
  groupTitle: { fontSize: 12, fontFamily: fonts.ui.extrabold, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.muted },
  groupNote: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted },
  filterNote: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: spacing.md, marginBottom: 4, paddingLeft: spacing.md, paddingRight: spacing.xs, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  filterNoteText: { flex: 1, fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.primaryDark },
  filterNoteHit: { minHeight: 44, paddingHorizontal: spacing.md, justifyContent: 'center' },
  filterNoteAction: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.primaryDark, textDecorationLine: 'underline' },
  more: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, marginHorizontal: spacing.md, marginBottom: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.line },
  moreText: { flex: 1 },
  moreTitle: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  moreSub: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  moreAction: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.primaryDark, textDecorationLine: 'underline' },
  noneHere: { marginHorizontal: spacing.md, marginBottom: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.line },
  empty: { alignItems: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  emptyTitle: { fontSize: 16, fontFamily: fonts.display.bold, color: colors.ink, textAlign: 'center' },
  emptyText: { marginTop: 4, marginBottom: 14, fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center' },
  btns: { alignSelf: 'stretch', gap: spacing.sm, alignItems: 'center' },
  btn: { minHeight: 44, paddingHorizontal: spacing.lg, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  btnCenter: { alignSelf: 'center', marginBottom: spacing.sm },
  btnPrimary: { backgroundColor: colors.primary },
  btnSecondary: { borderWidth: 1.5, borderColor: colors.line, backgroundColor: 'transparent' },
  btnText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink, textAlign: 'center' },
  btnTextPrimary: { color: '#fff' },
});
