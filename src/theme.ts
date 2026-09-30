// Identidad visual de Empre: amigable y luminosa, tomada del logo. El azul de
// "EMP" es el color principal (acciones, enlaces, selección), el naranja de
// "RE" es el acento que da calidez (destacados, insignias, llamadas a la
// acción secundarias) y el verde azulado del pin se reserva para confianza y
// verificación. Todas las pantallas y componentes leen de aquí, así que un
// cambio aquí se propaga a toda la app.
export const colors = {
  primary: '#2468C6', // azul "EMP": acción principal (botones, selección, enlaces)
  primaryDark: '#1A4F9C',
  primarySoft: '#E8F0FB', // fondo suave para chips/estados activos en azul
  accent: '#F58220', // naranja "RE": calidez, destacados, insignias
  accentDark: '#D96A0C',
  accentSoft: '#FFF1E3',
  ink: '#16233A', // azul tinta, no negro puro
  muted: '#66768D', // gris azulado para texto secundario
  line: '#E1E8F2', // bordes/separadores
  bg: '#F5F8FC', // fondo base (blanco azulado suave)
  surface: '#FFFFFF', // tarjetas y superficies
  verified: '#0B8A8F', // verde azulado del pin: verificado y confianza
  verifiedSoft: '#E2F4F4',
  danger: '#D64545',
  success: '#2E9E5B',
  warning: '#C98A12', // ámbar, para "pendiente"
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 10, md: 14, lg: 20, pill: 999 } as const;

/**
 * Nunito (redondeada y cercana, para nombres de negocio y títulos) + Manrope
 * (para toda la interfaz). Se cargan en app/_layout.tsx con expo-font; hasta
 * que cargan, RN usa la fuente del sistema como respaldo automático.
 */
export const fonts = {
  display: {
    medium: 'Nunito_600SemiBold',
    semibold: 'Nunito_700Bold',
    bold: 'Nunito_800ExtraBold',
  },
  ui: {
    regular: 'Manrope_400Regular',
    medium: 'Manrope_500Medium',
    semibold: 'Manrope_600SemiBold',
    bold: 'Manrope_700Bold',
    extrabold: 'Manrope_800ExtraBold',
  },
} as const;
