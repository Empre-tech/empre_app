import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '@/theme';

interface Props {
  title: string;
  /** Cuántos hay («13 platos», «8»); se omite en Ofertas (nunca se muestran cantidades de ofertas). */
  count?: string | null;
  /** «Ver todas ›», «Ver la carta ›»… lleva a la pantalla completa del apartado. */
  link?: string | null;
  onLink?: () => void;
}

/**
 * La cabecera de TODOS los apartados del perfil (3.28, `perfil_integrado.html`): título grande, cuántos en gris y un
 * solo «Ver todo ›» a la derecha. Antes cada apartado tenía la suya (mayúsculas grises, títulos grandes, dentro o fuera
 * de la tarjeta) y el perfil se veía desordenado.
 */
export function SectionHeader({ title, count, link, onLink }: Props) {
  return (
    <View style={styles.head}>
      <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
        {title}
        {count ? <Text style={styles.count}>{'  '}{count}</Text> : null}
      </Text>
      {link && onLink ? (
        <Pressable accessibilityRole="button" accessibilityLabel={link} onPress={onLink} style={styles.link}>
          <Text style={styles.linkText}>{link} ›</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  title: { flexShrink: 1, fontSize: 18, fontFamily: fonts.display.bold, color: colors.ink },
  count: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.muted },
  link: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end', paddingLeft: 8 },
  linkText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.primary },
});
