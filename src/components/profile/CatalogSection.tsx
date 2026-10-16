import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { catalogApi } from '@/api/catalog';
import { CATALOG_PREVIEW, freshnessNote, priceText, serviceLabel } from '@/lib/catalog';
import { useNow } from '@/lib/useNow';
import { colors, fonts, radius, spacing } from '@/theme';

interface Props {
  entityId: string;
  isOwner: boolean;
}

/**
 * «Servicios»: lo que el negocio ofrece habitualmente, con su precio habitual. Va en el perfil (no en el mapa).
 * Sin servicios no se dibuja nada para el público; el dueño ve un acceso para empezar. Un servicio sin precio no
 * muestra «$0»: dice «Consultar». Bajo la lista, una nota de qué tan vigentes están los precios.
 */
export function CatalogSection({ entityId, isOwner }: Props) {
  const router = useRouter();
  const [all, setAll] = useState(false);
  const now = useNow(60_000);
  const catalog = useQuery({ queryKey: ['catalog', entityId], queryFn: () => catalogApi.list(entityId), enabled: Boolean(entityId), staleTime: 60_000 });

  const items = catalog.data ?? [];
  const edit = () => router.push({ pathname: '/business/catalog/[id]', params: { id: entityId } });

  if (items.length === 0) {
    if (!isOwner || catalog.isLoading) return null;
    return (
      <Pressable accessibilityRole="button" onPress={edit} style={styles.ownerLink}>
        <Ionicons name="pricetags-outline" size={16} color={colors.primary} />
        <Text style={styles.ownerLinkText}>Añadir servicios y precios</Text>
      </Pressable>
    );
  }

  const shown = all ? items : items.slice(0, CATALOG_PREVIEW);
  const note = freshnessNote(items, now);

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text style={styles.title}>Servicios</Text>
        {isOwner ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Editar el catálogo de servicios" onPress={edit} hitSlop={8}>
            <Text style={styles.link}>Editar</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.card}>
        {shown.map((item, i) => {
          const price = priceText(item);
          return (
            <View key={item.id} accessible accessibilityLabel={serviceLabel(item)} style={[styles.row, i > 0 && styles.rowBorder]}>
              <View style={styles.rowText}>
                <Text style={styles.name}>{item.name}</Text>
                {item.description ? (
                  <Text style={styles.desc} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}
              </View>
              <Text style={price ? styles.price : styles.consult}>{price ?? 'Consultar'}</Text>
            </View>
          );
        })}
      </View>
      {items.length > CATALOG_PREVIEW ? (
        <Pressable accessibilityRole="button" onPress={() => setAll((v) => !v)} style={styles.more}>
          <Text style={styles.link}>{all ? 'Ver menos' : `Ver los ${items.length}`}</Text>
        </Pressable>
      ) : null}
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm, marginTop: spacing.lg },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { fontSize: 17, fontFamily: fonts.display.bold, color: colors.ink },
  link: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.primary },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, paddingHorizontal: spacing.md },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.md },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.line },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 15, fontFamily: fonts.ui.bold, color: colors.ink },
  desc: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  price: { fontSize: 15, fontFamily: fonts.display.bold, color: colors.ink },
  consult: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.muted },
  more: { minHeight: 44, justifyContent: 'center' },
  note: { fontSize: 12, fontFamily: fonts.ui.medium, color: colors.muted },
  ownerLink: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  ownerLinkText: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.primary },
});
