/**
 * Estilo del mapa base. Dos objetivos:
 * 1. Ocultar los puntos de interés de Google (negocios, parques, etc.) para
 *    que en el mapa solo se vean los negocios de Empre (documento frontend
 *    §4.5). `showsPointsOfInterest={false}` no basta en Android; el estilo sí.
 * 2. Suavizar los colores (desaturar) para que el mapa base no compita con
 *    los pines.
 */
export const MAP_STYLE = [
  // Suavizado suave (no tan lavado como antes) para que los pines destaquen.
  { elementType: 'geometry', stylers: [{ saturation: -20 }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#5b6b7d' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f8fc' }] },
  // La etiqueta de ciudad aparece muy grande y compite con los pines: aclararla.
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#8a97a6' }] },
  // Fuera los puntos de interés de Google y TODO el transporte (líneas,
  // estaciones e íconos), cuyo color choca con los pines.
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

/**
 * «Empre noche» (3.41, mockup mapa_vivo.html): fondo azul profundo, vías en turquesa tenue y agua casi negra, sin
 * puntos de interés, transporte ni barrios de Google (las zonas de Empre son las que hablan). Los pines y las burbujas
 * tienen borde blanco, así que se leen igual sobre el fondo oscuro.
 */
export const MAP_STYLE_NIGHT = [
  { elementType: 'geometry', stylers: [{ color: '#102238' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8FB3C9' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0A1626' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#A9C4D6' }] },
  { featureType: 'administrative.neighborhood', stylers: [{ visibility: 'off' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#0F1F33' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ visibility: 'on' }, { color: '#0F2A2A' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1B4E5E' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#0A1626' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#22677A' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.local', elementType: 'geometry', stylers: [{ color: '#163C4F' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#040A15' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3D6A85' }] },
];
