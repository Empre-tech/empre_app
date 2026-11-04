// Identidad visual de Empre (lienzo «Empre», rojo «Opción C», 2026-11-02):
// el rojo para las acciones, tinta azul sobre gris claro para lo elegido, naranja
// solo en ofertas e insignias y teal para «abierto», «verificado» y lo bueno.
// Todas las pantallas leen de aquí: un cambio aquí se propaga a toda la app.
export const colors = {
  primary: '#D42020', // rojo: botón principal (texto blanco encima, 5,3:1)
  primaryDark: '#B91C1C', // rojo para enlaces y texto sobre blanco o primarySoft (6,5:1)
  primaryPressed: '#8F1515',
  primarySoft: '#FDECEC', // fondo suave rojo
  brand: '#F03232', // rojo de marca: logo, foco, línea de pestaña y datos de ventas
  selected: '#0E2346', // lo elegido va en tinta...
  selectedSoft: '#EEF2F7', // ...sobre este gris claro
  accent: '#FF8A1F', // naranja: ofertas e insignias (texto en tinta encima)
  accentDark: '#E07F00',
  // Naranja oscuro para TEXTO: 4,9:1 sobre blanco. El accent no llega a AA como texto.
  accentInk: '#9A4F00',
  accentSoft: '#FFF1E6',
  ink: '#0E2346', // todo el texto
  muted: '#4C5C74', // texto secundario (7:1 sobre blanco)
  line: '#D5DEEA', // bordes y separadores
  bg: '#F4F7FB', // fondo de las pantallas
  surface: '#FFFFFF', // tarjetas
  verified: '#0A6E6A', // teal: verificado, abierto y lo bueno
  verifiedSoft: '#E3F5F3',
  danger: '#B3261E',
  success: '#0A6E6A',
  warning: '#C2410C', // se acaba pronto o va tarde
  hairline: '#E3E9F2', // borde de las tarjetas y de la barra de abajo
  faint: '#5B6B82', // etiquetas pequeñas y pestañas sin elegir
  placeholder: '#8796AB', // texto de relleno del buscador
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 10, md: 14, lg: 20, pill: 999 } as const;

/**
 * Tipografía, la misma del lienzo «Empre»: títulos en Nunito 900 y el resto en Manrope.
 * Se cargan con expo-font en app/_layout.tsx; hasta que cargan, RN usa la fuente del sistema.
 */
export const fonts = {
  display: {
    medium: 'Nunito_700Bold',
    semibold: 'Nunito_800ExtraBold',
    bold: 'Nunito_900Black',
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

/** Sombra del lienzo para tarjetas sobre el gris: 0 2px 10px, tinta al 5 %. */
export const softShadow = {
  shadowColor: '#0E2346',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 2 },
  elevation: 1,
} as const;

/** Sombra suave de los controles que flotan sobre el mapa. */
export const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.15,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 4,
} as const;
