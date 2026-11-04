import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { catalogApi } from '@/api/catalog';
import { CatalogFilters } from '@/components/catalog/CatalogFilters';
import { CatalogItems } from '@/components/catalog/CatalogItems';
import {
  audienceChips,
  catalogCount,
  freshnessNote,
  itemsInSection,
  matchesAudience,
  publicCatalog,
  sectionChips,
  type Audience,
  type CatalogCopy,
  type ServiceItem,
} from '@/lib/catalog';
import { safeIcon } from '@/lib/icons';
import { displayIcon } from '@/lib/mapView';
import { useNow } from '@/lib/useNow';
import { colors, fonts, radius, spacing } from '@/theme';
import { SectionHeader } from './SectionHeader';

/** Cuántos se ven en el perfil: dos filas parejas de tarjetas. */
const PROFILE_PREVIEW = 4;

interface Props {
  entityId: string;
  isOwner: boolean;
  /** Textos según el tipo de negocio («Carta», «Servicios», «Productos»…). */
  copy: CatalogCopy;
  /** Color e icono de la categoría, para la marca de cada ítem. */
  color?: string | null;
  icon?: string | null;
  /** «Ver todos ›»: la pantalla del catálogo con buscador y secciones (con `section` y `audience`, ya filtrada). */
  onAll: (section?: string, audience?: Audience | null) => void;
}

/**
 * El catálogo en el perfil (3.27/3.28): se llama según el negocio (Carta, Servicios, Productos…). Las secciones son
 * filtros que se deslizan (solo las que tienen productos, en el orden del negocio, «Otros» al final) y, en ropa,
 * calzado y deporte, «Para: Hombre · Mujer · Niños». Debajo, los primeros 5 de lo elegido y «Ver los N…» abre la
 * pantalla completa con el mismo filtro. Así, con 100 secciones el perfil no crece. Tocar un ítem abre el mensaje para
 * preguntar. Sin ítems no se dibuja para el público; el dueño ve un acceso para empezar.
 */
export function CatalogSection({ entityId, isOwner, copy, color, icon, onAll }: Props) {
  const router = useRouter();
  const now = useNow(60_000);
  const catalog = useQuery({ queryKey: ['catalog', entityId, 'sections'], queryFn: () => catalogApi.listWithSections(entityId), enabled: Boolean(entityId), staleTime: 60_000 });
  const [section, setSection] = useState('');
  const [audience, setAudience] = useState<Audience | null>(null);

  const items = useMemo(() => publicCatalog(catalog.data?.items ?? []), [catalog.data]);
  const order = useMemo(() => (catalog.data?.sections ?? []).map((s) => s.name), [catalog.data]);
  const audiences = useMemo(() => (catalog.data?.audience ? audienceChips(items) : []), [catalog.data, items]);
  const forAudience = useMemo(() => items.filter((i) => matchesAudience(i.audience, audience)), [items, audience]);
  // Las secciones siempre se ven (salen de todos los productos); el conteo es el del filtro «Para».
  const chips = useMemo(() => sectionChips(items, order, forAudience), [items, order, forAudience]);
  const current = chips.some((c) => c.section === section) ? section : '';
  const list = useMemo(() => itemsInSection(forAudience, current, order), [forAudience, current, order]);
  const edit = () => router.push({ pathname: '/business/products/[id]', params: { id: entityId } });
  // Sin foto, cada producto muestra el ícono de su sección (o el de la categoría del negocio).
  const icons = useMemo(() => new Map((catalog.data?.sections ?? []).map((s) => [s.name, s.icon])), [catalog.data]);
  const iconOf = (item: ServiceItem) => safeIcon(icons.get(item.section ?? ''), safeIcon(displayIcon(icon), 'pricetag-outline'));
  const open = (item: ServiceItem) => router.push({ pathname: '/business/product', params: { entityId, itemId: item.id } });

  if (items.length === 0) {
    if (!isOwner || catalog.isLoading) return null;
    return (
      <Pressable accessibilityRole="button" onPress={edit} style={styles.ownerLink}>
        <Ionicons name="pricetags-outline" size={16} color={colors.primary} />
        <Text style={styles.ownerLinkText}>Añadir a tu {copy.noun.toLocaleLowerCase('es')}</Text>
      </Pressable>
    );
  }

  const shown = list.slice(0, PROFILE_PREVIEW);
  const note = freshnessNote(items, now);
  const more = list.length > shown.length;
  const audLabel = audiences.find((a) => a.key === audience)?.label.toLocaleLowerCase('es');
  const moreText = current
    ? `Ver los ${list.length} de ${current}${audLabel ? ` para ${audLabel}` : ''}`
    : `Ver los ${list.length}${audLabel ? ` para ${audLabel}` : ''}`;

  return (
    <View style={styles.section}>
      <SectionHeader
        title={copy.noun}
        count={catalogCount(copy, items.length)}
        link={items.length > PROFILE_PREVIEW ? (copy.noun === 'Carta' ? 'Ver la carta' : 'Ver todos') : isOwner ? 'Editar' : null}
        onLink={items.length > PROFILE_PREVIEW ? () => onAll() : edit}
      />
      <CatalogFilters
        sections={chips.length >= 2 ? chips : []}
        total={forAudience.length}
        section={current}
        onSection={setSection}
        audiences={audiences}
        audience={audience}
        onAudience={setAudience}
      />
      {shown.length > 0 ? (
        <CatalogItems items={shown} iconOf={iconOf} color={color} onOpen={open} cards />
      ) : (
        <Text style={styles.note}>Nada por aquí con este filtro.</Text>
      )}
      {more ? (
        <Pressable accessibilityRole="button" onPress={() => onAll(current || undefined, audience)} style={styles.moreBtn}>
          <Text style={styles.moreText}>{moreText}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.ink} />
        </Pressable>
      ) : null}
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  moreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 46, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  moreText: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  note: { fontSize: 12, fontFamily: fonts.ui.medium, color: colors.muted },
  ownerLink: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  ownerLinkText: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.primary },
});
