/**
 * Estilo del mapa base (Empre Finder): los colores estándar de Google Maps, tal cual. Solo se ocultan los negocios y
 * lugares de Google, para que en el mapa se vean únicamente los negocios de Empre (documento frontend §4.5);
 * `showsPointsOfInterest={false}` no basta en Android, el estilo sí. Los parques siguen a la vista para ubicarse.
 */
export const MAP_STYLE = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', stylers: [{ visibility: 'on' }] },
  { featureType: 'poi.park', elementType: 'labels', stylers: [{ visibility: 'off' }] },
];
