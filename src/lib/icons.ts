import { Ionicons } from '@expo/vector-icons';

export type IconName = keyof typeof Ionicons.glyphMap;

/** El ícono de una sección que manda el servidor, si existe en esta versión de la app; si no, `fallback`. */
export function safeIcon(name: string | null | undefined, fallback: IconName): IconName {
  return name && name in Ionicons.glyphMap ? (name as IconName) : fallback;
}
