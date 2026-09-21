import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { resolveImageUrl } from '@/lib/image';
import { initials } from '@/lib/text';
import { colors } from '@/theme';

interface Props {
  uri?: string | null;
  name: string;
  size?: number;
}

export function Avatar({ uri, name, size = 48 }: Props) {
  const src = resolveImageUrl(uri);
  const dimension = { width: size, height: size, borderRadius: size / 2 };

  if (!src) {
    return (
      <View style={[styles.fallback, dimension]}>
        <Text style={[styles.initials, { fontSize: size * 0.36 }]}>{initials(name)}</Text>
      </View>
    );
  }

  return <Image source={{ uri: src }} style={[styles.image, dimension]} contentFit="cover" transition={150} />;
}

const styles = StyleSheet.create({
  image: { backgroundColor: colors.surface },
  fallback: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  initials: { color: colors.muted, fontWeight: '700' },
});
