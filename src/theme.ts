// Identidad visual de Empre (2026-10-29, lienzo «Empre · La app completa»):
// blanco de base, todo el texto en negro y UN color principal, el rojo
// #F03232, solo para lo seleccionado y las acciones (pestaña activa, chip
// elegido, botón principal, interruptores). La mandarina queda de acento para
// ofertas e insignias y el verde para «abierto» y «verificado». Todas las
// pantallas leen de aquí: un cambio aquí se propaga a toda la app.
export const colors = {
  primary: '#F03232', // rojo: acción principal y selección (texto blanco encima, 4:1; en negrita grande pasa AA)
  primaryDark: '#C81E1E', // rojo oscuro para texto rojo sobre blanco o sobre primarySoft (6:1)
  primarySoft: '#FDE6E6', // fondo suave de lo seleccionado
  accent: '#FF9500', // mandarina: ofertas e insignias (texto negro encima)
  accentDark: '#E07F00',
  // Mandarina oscura para TEXTO: 4,9:1 sobre blanco. El accent (2,2:1) no llega a AA como texto.
  accentInk: '#9A4F00',
  accentSoft: '#FFEED6',
  ink: '#000000', // todo el texto
  muted: '#5C5C5C', // texto secundario (6,7:1 sobre blanco)
  line: '#E6E6E6', // bordes y separadores
  bg: '#FFFFFF', // fondo base: blanco
  surface: '#FFFFFF', // tarjetas (se separan del fondo con sombra suave)
  verified: '#0B7F5F', // verde: verificado y confianza
  verifiedSoft: '#E3F4EC',
  danger: '#D62828',
  success: '#1E8A4C',
  warning: '#B7791F', // ámbar, para "pendiente"
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 10, md: 14, lg: 20, pill: 999 } as const;

/**
 * Tipografía: la elegida es Neue Haas Grotesk (licencia comercial de Monotype).
 * Mientras no estén sus archivos en assets/fonts, toda la app usa Manrope, una
 * grotesca que sí está instalada: los títulos ya no usan Nunito (redondeada).
 * Para cambiar a Neue Haas basta con cargar sus archivos en app/_layout.tsx y
 * apuntar estos nombres a ellos. Se cargan con expo-font; hasta que cargan, RN
 * usa la fuente del sistema como respaldo automático.
 */
export const fonts = {
  display: {
    medium: 'Manrope_600SemiBold',
    semibold: 'Manrope_700Bold',
    bold: 'Manrope_800ExtraBold',
  },
  ui: {
    regular: 'Manrope_400Regular',
    medium: 'Manrope_500Medium',
    semibold: 'Manrope_600SemiBold',
    bold: 'Manrope_700Bold',
    extrabold: 'Manrope_800ExtraBold',
  },
} as const;

/** Sombra de las tarjetas sobre fondo blanco (como en la vitrina). */
export const cardShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.08,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 3,
} as const;

/** Sombra suave de los controles que flotan sobre el mapa. */
export const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.15,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 4,
} as const;
