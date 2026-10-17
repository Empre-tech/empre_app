import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { DiscoverSection, DiscoverSectionId } from '@/api/types';
import { SkeletonRows } from '@/components/Skeleton';
import { scopeText, type SearchScope } from '@/lib/discover';
import { reelTiles, type ReelTile } from '@/lib/photoStrip';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts, radius, shadow, spacing } from '@/theme';
import { DiscoverCard, MiniCard, MiniRow, type CardModel } from './ExploreCards';
import { DiscoverSkeleton, FadeIn, UpdatingBar } from './LoadingMotion';
import { PhotoReel } from './PhotoReel';
import { ZoneAll, ZoneDiscover } from './ZonePanel';
import { PEEK_REEL, type FeaturedSheetState } from './useFeaturedSheet';

type Status = 'loading' | 'error' | 'ok';

interface Props {
  sheet: FeaturedSheetState;
  bottomInset: number;
  /** Mientras el dedo mueve el mapa, el panel compacto baja un poco (no cambia de estado). */
  tucked: boolean;
  header: { title: string; subtitle: string };
  avatars: { key: string; color: string; letter: string }[];
  searching: boolean;
  query: string;
  view: 'discover' | 'results';
  onView: (view: 'discover' | 'results') => void;
  selectedId: string | null;
  onSelect: (model: CardModel) => void;
  /** Descubre (armado por el servidor). */
  sections: { status: Status; data: DiscoverSection[]; models: (item: DiscoverSection['items'][number], sectionId: DiscoverSectionId) => CardModel; onRetry: () => void };
  /** «Ver más» de una sección: la lista filtrada. */
  sectionFilter: { id: DiscoverSectionId; title: string; status: Status; items: CardModel[] } | null;
  onSeeSection: (id: DiscoverSectionId) => void;
  onClearSection: () => void;
  /**
   * Sin búsqueda: los destacados (negocios directamente en tu zona) y los adicionales (cerca, fuera de tu
   * zona). Todos suma los dos; Descubre, con pocos negocios, muestra los destacados como fichas.
   */
  zone: {
    status: Status;
    items: CardModel[];
    extras: CardModel[];
    filterActive: boolean;
    onRetry: () => void;
    /** Encabezado de lo que se ve («En Centro Histórico», «Cerca de ti»). */
    place?: string;
    /** Sin nada a la vista: traer los más cercanos al mapa. */
    nearest?: { count: number; onShow: () => void };
  };
  /** Tocar una foto (de la tira o de una tarjeta): abre el visor en esa foto. */
  onPhoto: (model: CardModel, index: number) => void;
  /** Llega algo nuevo con lo anterior todavía a la vista (3.26): barra fina arriba y lo anterior atenuado. */
  updating?: boolean;
  /** Abre el perfil de un negocio (la franja de oferta de una ficha). */
  onOpenProfile: (id: string) => void;
  /** Quita los filtros activos (categoría, distancia, «abiertos ahora»). */
  onClearFilters: () => void;
  /** Aleja el mapa para ver más negocios de la ciudad. */
  onWiden: () => void;
  /** Búsqueda. */
  results: { status: Status; items: CardModel[]; related: CardModel[]; relatedLabel: string; scope: SearchScope; onRetry: () => void; onClear: () => void; onSearchCity: () => void };
}

/**
 * El panel único de explorar. Sin búsqueda ofrece «Descubre» (secciones que arma
 * el servidor) y «Todos»; con búsqueda, los resultados primero y Descubre a un
 * toque sin perder la consulta. Compacto, intermedio y expandido son el mismo
 * panel a distinta altura; nunca se abre solo por mover el mapa.
 */
export function ExploreSheet(p: Props) {
  const { anchor, height, snapTo, panHandlers } = p.sheet;
  const reduce = useReduceMotion();
  const [tuck] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const to = p.tucked && anchor === 'peek' ? 46 : 0;
    if (reduce) tuck.setValue(to);
    // Sin driver nativo: la misma vista anima su alto (que el driver nativo no admite) y no se pueden mezclar.
    else Animated.timing(tuck, { toValue: to, duration: 180, useNativeDriver: false }).start();
  }, [p.tucked, anchor, reduce, tuck]);

  // La tira del compacto: fotos de los destacados (Descubre primero, luego la zona), sin búsqueda.
  const { data: secData, models: toCard } = p.sections;
  const reelSource = useMemo(() => {
    if (p.searching) return [];
    const fromSections = secData.flatMap((sec) => sec.items.map((it) => toCard(it, sec.id)));
    return [...fromSections, ...p.zone.items];
  }, [p.searching, secData, toCard, p.zone.items]);
  const tiles = useMemo(() => reelTiles(reelSource), [reelSource]);
  const { setPeekExtra } = p.sheet;
  const hasReel = tiles.length > 0;
  useEffect(() => {
    setPeekExtra(hasReel ? PEEK_REEL : 0);
  }, [hasReel, setPeekExtra]);
  const openTile = (t: ReelTile) => {
    const m = reelSource.find((x) => x.id === t.id);
    if (m) p.onPhoto(m, t.index);
  };
  const badge = (id: string) => {
    const m = reelSource.find((x) => x.id === id);
    return { color: m?.color.fg ?? colors.primary, letter: m?.name.charAt(0) ?? '' };
  };

  if (anchor === 'hidden') return null;
  const compact = anchor === 'peek';
  const toggle = () => snapTo(compact ? 'medium' : 'peek');

  return (
    <Animated.View style={[styles.sheet, { height, paddingBottom: compact ? 0 : p.bottomInset, transform: [{ translateY: tuck }] }]}>
      {/* Asa + encabezado: el contenedor recibe el arrastre y el botón interior el toque
          (un toque alterna compacto ⇄ intermedio). Separados, no compiten por el dedo. */}
      <View {...panHandlers}>
        <Pressable
        onPress={toggle}
        accessibilityRole="adjustable"
        accessibilityLabel={`${p.header.title}. ${p.header.subtitle}`}
        accessibilityValue={{ text: compact ? 'compacto' : anchor === 'medium' ? 'intermedio' : 'expandido' }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }, { name: 'activate' }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'increment') snapTo(compact ? 'medium' : 'full');
          else if (e.nativeEvent.actionName === 'decrement') snapTo(anchor === 'full' ? 'medium' : 'peek');
          else toggle();
        }}
        style={styles.grab}
      >
        <View style={styles.handle} />
        <View style={styles.headRow}>
          <View style={styles.headText}>
            <Text style={styles.title} numberOfLines={1}>
              {p.header.title}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {p.header.subtitle}
            </Text>
          </View>
          {compact && !p.searching && !hasReel ? (
            <View style={styles.avatars} accessible={false}>
              {p.avatars.slice(0, 3).map((a, i) => (
                <View key={a.key} style={[styles.avatar, { backgroundColor: a.color, marginLeft: i === 0 ? 0 : -8 }]}>
                  <Text style={styles.avatarText}>{a.letter}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel={compact ? 'Expandir panel' : 'Contraer panel'} onPress={toggle} hitSlop={8} style={styles.chevron}>
            <Ionicons name={compact ? 'chevron-up' : 'chevron-down'} size={18} color={colors.ink} />
          </Pressable>
        </View>
        </Pressable>
      </View>

      {p.updating ? <UpdatingBar /> : null}
      {compact ? <PhotoReel tiles={tiles} badge={badge} onPhoto={openTile} /> : null}
      {compact ? null : (
        <View style={[styles.bodyWrap, p.updating && styles.dim]} accessibilityState={{ busy: Boolean(p.updating) }}>
          <Body {...p} />
        </View>
      )}
    </Animated.View>
  );
}

function Tabs({ searching, view, onView, count }: { searching: boolean; view: 'discover' | 'results'; onView: (v: 'discover' | 'results') => void; count: number }) {
  const tabs: ['discover' | 'results', string][] = searching
    ? [['results', `Resultados (${count})`], ['discover', 'Descubre']]
    : [['discover', 'Descubre'], ['results', `Todos (${count})`]];
  return (
    <View style={styles.seg} accessibilityRole="tablist">
      {tabs.map(([v, label]) => (
        <Pressable key={v} accessibilityRole="tab" accessibilityState={{ selected: view === v }} onPress={() => onView(v)} style={[styles.segItem, view === v && styles.segOn]}>
          <Text style={[styles.segText, view === v && styles.segTextOn]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Hint({ text, action, onAction, warn }: { text: string; action: string; onAction: () => void; warn?: boolean }) {
  return (
    <View style={[styles.hint, warn && styles.hintWarn]}>
      <Text style={[styles.hintText, warn && styles.hintTextWarn]} numberOfLines={2}>
        {text}
      </Text>
      <Pressable accessibilityRole="button" onPress={onAction} hitSlop={8}>
        <Text style={[styles.hintAction, warn && styles.hintTextWarn]}>{action}</Text>
      </Pressable>
    </View>
  );
}

function Body(p: Props) {
  const anchor = p.sheet.anchor;
  const mid = anchor === 'medium';
  const count = p.searching ? p.results.items.length : p.zone.items.length + p.zone.extras.length;
  const tabs = <Tabs searching={p.searching} view={p.view} onView={p.onView} count={count} />;

  // ---- Descubre ----
  if (p.view === 'discover') {
    const keep = p.searching ? <Hint text={`Tu búsqueda «${p.query}» sigue activa`} action="Volver a resultados" onAction={() => p.onView('results')} /> : null;
    const { status, data } = p.sections;
    let content: React.ReactNode;
    // Primera carga (3.26): esqueleto mientras falte cualquiera de las dos respuestas. Nunca un «No hay destacados» falso.
    const firstLoad = (status === 'loading' && data.length === 0) || (p.zone.status === 'loading' && p.zone.items.length === 0 && data.length === 0);
    if (firstLoad) {
      content = <DiscoverSkeleton />;
    } else if (p.zone.status === 'error' && (status === 'error' || data.length === 0) && p.zone.items.length === 0) {
      content = (
        <View style={styles.errBox} accessibilityRole="alert">
          <Text style={styles.errText}>No pudimos cargar los negocios.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              p.zone.onRetry();
              p.sections.onRetry();
            }}
            style={({ pressed }) => [styles.errBtn, pressed && { opacity: 0.8 }]}
          >
            <Text style={styles.errBtnText}>Reintentar</Text>
          </Pressable>
        </View>
      );
    } else if (status === 'error') {
      content = (
        <>
          <Hint warn text="No pudimos cargar Descubre. Aquí tienes la lista." action="Reintentar" onAction={p.sections.onRetry} />
          {p.zone.items.map((m) => (
            <MiniRow key={m.id} model={m} selected={p.selectedId === m.id} onPress={() => p.onSelect(m)} />
          ))}
        </>
      );
    } else if (data.length === 0) {
      // Ninguna sección llega a 3 negocios: «En esta zona» con una ficha por negocio (nunca un callejón sin salida).
      content = (
        <ZoneDiscover
          items={p.zone.items}
          extras={p.zone.extras}
          filterActive={p.zone.filterActive}
          place={p.zone.place}
          nearest={p.zone.nearest}
          selectedId={p.selectedId}
          onSelect={p.onSelect}
          onOpenProfile={p.onOpenProfile}
          onPhoto={p.onPhoto}
          onClearFilters={p.onClearFilters}
          onWiden={p.onWiden}
          onSeeAll={() => p.onView('results')}
        />
      );
    } else {
      const shown = mid ? data.slice(0, 1) : data;
      content = (
        <>
          {shown.map((sec) => (
            <View key={sec.id}>
              <View style={styles.secHead}>
                <Text style={styles.secTitle}>{sec.title}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={`Ver más: ${sec.title}`} onPress={() => p.onSeeSection(sec.id)} hitSlop={8}>
                  <Text style={styles.link}>Ver más ›</Text>
                </Pressable>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hscroll} contentContainerStyle={styles.hrow}>
                {sec.items.map((it) => {
                  const m = p.sections.models(it, sec.id);
                  return <DiscoverCard key={`${sec.id}-${m.id}`} model={m} selected={p.selectedId === m.id} onPress={() => p.onSelect(m)} onPhoto={(i) => p.onPhoto(m, i)} />;
                })}
              </ScrollView>
            </View>
          ))}
          {mid && data.length > 1 ? (
            <Pressable accessibilityRole="button" onPress={() => p.sheet.snapTo('full')} style={styles.more}>
              <Text style={styles.link}>Ver todo Descubre</Text>
            </Pressable>
          ) : null}
        </>
      );
    }
    // Lo nuevo entra con un fundido (la llave cambia solo cuando cambian los negocios mostrados).
    const sig = firstLoad ? 'loading' : data.length > 0 ? data.map((sec) => `${sec.id}:${sec.items.map((it) => it.entity_id).join('.')}`).join('|') : `zona:${p.zone.items.map((m) => m.id).join('.')}`;
    return (
      <ScrollView style={styles.body} scrollEnabled={!mid} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
        {tabs}
        {keep}
        <FadeIn key={sig}>{content}</FadeIn>
      </ScrollView>
    );
  }

  // ---- Resultados de búsqueda ----
  if (p.searching) {
    const r = p.results;
    if (r.status === 'loading') return <View style={styles.body}>{tabs}<SkeletonRows count={3} /></View>;
    if (r.status === 'error') {
      return (
        <View style={[styles.body, styles.state]} accessibilityRole="alert">
          <Text style={styles.stateTitle}>No pudimos cargar los resultados</Text>
          <Text style={styles.stateText}>Revisa tu conexión. Tu búsqueda «{p.query}» sigue aquí.</Text>
          <View style={styles.btnRow}>
            <Pressable accessibilityRole="button" onPress={r.onRetry} style={styles.primary}><Text style={styles.primaryText}>Reintentar</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={r.onClear} style={styles.secondary}><Text style={styles.secondaryText}>Borrar búsqueda</Text></Pressable>
          </View>
        </View>
      );
    }
    if (r.items.length === 0) {
      return (
        <View style={styles.body}>
          {tabs}
          <View style={styles.state}>
            <Text style={styles.stateTitle}>No encontramos «{p.query}» {scopeText(r.scope)}</Text>
            <Text style={styles.stateText}>Prueba con otra palabra{r.scope !== 'all' ? ' o busca más lejos' : ''}.</Text>
            <View style={styles.btnRow}>
              {r.scope !== 'all' ? (
                <Pressable accessibilityRole="button" onPress={r.onSearchCity} style={styles.primary}><Text style={styles.primaryText}>Buscar más lejos</Text></Pressable>
              ) : null}
              <Pressable accessibilityRole="button" onPress={r.onClear} style={styles.secondary}><Text style={styles.secondaryText}>Borrar búsqueda</Text></Pressable>
            </View>
          </View>
        </View>
      );
    }
    // Los cercanos arriba; los lejanos (si hay) van aparte, bajo «Más lejos», y no en el carrusel.
    const nearItems = r.items.filter((m) => !m.far);
    const farItems = r.items.filter((m) => m.far);
    if (mid) {
      return (
        <View style={styles.body}>
          {tabs}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hscroll} contentContainerStyle={styles.hrow}>
            {nearItems.map((m) => <MiniCard key={m.id} model={m} selected={p.selectedId === m.id} onPress={() => p.onSelect(m)} />)}
          </ScrollView>
          <Pressable accessibilityRole="button" onPress={() => p.sheet.snapTo('full')} style={styles.more}>
            <Text style={styles.link}>
              Ver los {nearItems.length}
              {farItems.length ? ` y ${farItems.length} más lejos` : ''}
              {r.related.length ? ' y recomendaciones' : ''}
            </Text>
          </Pressable>
        </View>
      );
    }
    return (
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
        {tabs}
        <Group title="Coinciden con tu búsqueda" count={nearItems.length} />
        {nearItems.map((m) => <MiniRow key={m.id} model={m} selected={p.selectedId === m.id} onPress={() => p.onSelect(m)} />)}
        {farItems.length ? (
          <>
            <Group title="Más lejos" count={farItems.length} />
            {farItems.map((m) => <MiniRow key={m.id} model={m} selected={p.selectedId === m.id} onPress={() => p.onSelect(m)} />)}
          </>
        ) : null}
        {r.related.length ? (
          <>
            <Group title="También podría interesarte" count={r.related.length} />
            {r.related.map((m) => <MiniRow key={m.id} model={{ ...m, line: r.relatedLabel }} selected={p.selectedId === m.id} onPress={() => p.onSelect(m)} />)}
          </>
        ) : null}
      </ScrollView>
    );
  }

  // ---- Todos (sin búsqueda), o «Ver más» de una sección ----
  const filter = p.sectionFilter;
  const list = filter ? filter.items : p.zone.items;
  const filterHint = filter ? <Hint text={`Mostrando: ${filter.title}`} action="Quitar" onAction={p.onClearSection} /> : null;
  const loading = filter ? filter.status === 'loading' && list.length === 0 : p.zone.status === 'loading' && list.length === 0;
  if (loading) return <View style={styles.body}>{tabs}{filterHint}<SkeletonRows count={3} /></View>;
  const extras = filter ? [] : p.zone.extras;
  const everything = [...list, ...extras];
  if (everything.length === 0 && filter) {
    return (
      <View style={styles.body}>
        {tabs}
        {filterHint}
        <View style={styles.state}>
          <Text style={styles.stateTitle}>Nada para mostrar aquí</Text>
          <Text style={styles.stateText}>Mueve el mapa o cambia de vista.</Text>
        </View>
      </View>
    );
  }
  if (mid) {
    return (
      <View style={styles.body}>
        {tabs}
        {filterHint}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hscroll} contentContainerStyle={styles.hrow}>
          {everything.map((m) => <MiniCard key={m.id} model={m} selected={p.selectedId === m.id} onPress={() => p.onSelect(m)} />)}
        </ScrollView>
        <Pressable accessibilityRole="button" onPress={() => p.sheet.snapTo('full')} style={styles.more}>
          <Text style={styles.link}>Ver los {everything.length}</Text>
        </Pressable>
      </View>
    );
  }
  if (!filter) {
    return (
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
        {tabs}
        <ZoneAll
          items={list}
          extras={extras}
          filterActive={p.zone.filterActive}
          place={p.zone.place}
          nearest={p.zone.nearest}
          selectedId={p.selectedId}
          onSelect={p.onSelect}
          onOpenProfile={p.onOpenProfile}
          onPhoto={p.onPhoto}
          onClearFilters={p.onClearFilters}
          onWiden={p.onWiden}
          onSeeAll={() => p.onView('results')}
        />
      </ScrollView>
    );
  }
  return (
    <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
      {tabs}
      {filterHint}
      {list.map((m) => <MiniRow key={m.id} model={m} selected={p.selectedId === m.id} onPress={() => p.onSelect(m)} />)}
    </ScrollView>
  );
}

function Group({ title, count }: { title: string; count: number }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      <Text style={styles.groupCount}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg + 2,
    borderTopRightRadius: radius.lg + 2,
    overflow: 'hidden',
    ...shadow,
  },
  grab: { paddingTop: spacing.sm, paddingBottom: spacing.sm, paddingLeft: spacing.lg, paddingRight: spacing.md },
  handle: { width: 38, height: 5, borderRadius: 3, backgroundColor: colors.line, alignSelf: 'center', marginBottom: spacing.sm },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headText: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontFamily: fonts.display.bold, color: colors.ink },
  subtitle: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted },
  avatars: { flexDirection: 'row' },
  avatar: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 10, fontFamily: fonts.ui.extrabold, color: '#fff' },
  chevron: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  bodyWrap: { flex: 1 },
  dim: { opacity: 0.55 },
  bodyContent: { paddingBottom: spacing.lg },
  seg: { flexDirection: 'row', gap: 6, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  segItem: { height: 34, paddingHorizontal: 13, borderRadius: radius.pill, backgroundColor: colors.bg, justifyContent: 'center' },
  segOn: { backgroundColor: colors.ink },
  segText: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.ink },
  segTextOn: { color: '#fff' },
  hint: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.primarySoft },
  hintWarn: { backgroundColor: '#FBE4E4' },
  hintText: { flex: 1, fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.primaryDark },
  hintTextWarn: { color: '#8E2A2A' },
  hintAction: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.primary, textDecorationLine: 'underline' },
  secHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  secTitle: { fontSize: 15, fontFamily: fonts.display.bold, color: colors.ink },
  link: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.primary },
  hscroll: { flexGrow: 0 },
  hrow: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  more: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  group: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 6 },
  groupTitle: { fontSize: 12, fontFamily: fonts.ui.extrabold, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.muted },
  groupCount: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted },
  state: { alignItems: 'center', gap: 6, paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  stateTitle: { fontSize: 15, fontFamily: fonts.display.bold, color: colors.ink, textAlign: 'center' },
  stateText: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center' },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.sm },
  primary: { minHeight: 44, paddingHorizontal: spacing.lg, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: '#fff' },
  secondary: { minHeight: 44, paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  errBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: '#FBE4E4' },
  errText: { flex: 1, fontSize: 13, fontFamily: fonts.ui.bold, color: '#8E2A2A' },
  errBtn: { minHeight: 44, paddingHorizontal: spacing.md, borderRadius: radius.sm, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  errBtnText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
});
