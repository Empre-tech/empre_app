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
