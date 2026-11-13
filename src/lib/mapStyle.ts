/**
 * Estilo del mapa base: el ancla negra de Empre (tablero «Empre Finder»). Tres objetivos:
 * 1. Ocultar los puntos de interés de Google (negocios, parques, etc.) para que en el mapa solo se vean los
 *    negocios de Empre (documento frontend §4.5). `showsPointsOfInterest={false}` no basta en Android; el estilo sí.
 * 2. Mapa en negro (#111318) con calles grafito y zonas verdes muy oscuras: lo abierto brilla en verde encima.
 * 3. Etiquetas en gris claro, sin competir con los pines.
 */
export const MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#2B2622' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8E929A' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#2B2622' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#22252B' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#CBCED4' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#15171C' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ visibility: 'on' }, { color: '#0B3D30' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#22252B' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1C1F25' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2A2D33' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8E929A' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0E1A24' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#6B7079' }] },
];
