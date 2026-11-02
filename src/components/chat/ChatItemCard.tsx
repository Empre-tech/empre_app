import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ChatMessageItem } from '@/api/types';
import { priceText } from '@/lib/catalog';
import { mediaUrl } from '@/lib/image';
import { colors, fonts, radius, spacing } from '@/theme';

interface Props {
  item: ChatMessageItem;
  /** Dentro de una burbuja mía (fondo azul) o de la otra persona. */
  mine?: boolean;
  onPress?: () => void;
  /** Quitarla antes de enviar (solo en la vista previa del mensaje que se escribe). */
  onRemove?: () => void;
}

/** La tarjeta del producto por el que se pregunta: foto, nombre, sección y precio. */
export function ChatItemCard({ item, mine = false, onPress, onRemove }: Props) {
  const price = priceText(item) ?? 'Precio a consultar';
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${item.name}, ${price}${onPress ? '. Ver producto' : ''}`}
      onPress={onPress}
      disabled={!onPress}
      style={[styles.card, mine ? styles.cardMine : styles.cardTheirs]}
    >
      {item.photo ? (
        <Image source={{ uri: mediaUrl(item.photo) }} style={styles.thumb} contentFit="cover" transition={120} />
      ) : (
        <View style={[styles.thumb, styles.noPhoto]}>
          <Ionicons name="pricetag-outline" size={22} color={colors.primary} />
        </View>
      )}
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>
          {item.name}
        </Text>
        {item.section ? (
          <Text style={styles.section} numberOfLines={1}>
            {item.section}
          </Text>
        ) : null}
        <Text style={styles.price}>{price}</Text>
      </View>
      {onRemove ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Quitar el producto" hitSlop={10} onPress={onRemove} style={styles.remove}>
          <Ionicons name="close" size={18} color={colors.muted} />
        </Pressable>
      ) : onPress ? (
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: 6, paddingRight: spacing.sm, borderRadius: radius.md, minWidth: 220 },
  cardMine: { backgroundColor: '#fff' },
  cardTheirs: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line },
  thumb: { width: 56, height: 56, borderRadius: radius.sm },
  noPhoto: { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 1 },
  name: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  section: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted },
  price: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.ink },
  remove: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});
