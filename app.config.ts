import type { ExpoConfig } from 'expo/config';

// Los identificadores (bundleIdentifier / package) son provisionales:
// cámbialos antes de publicar en las tiendas.
const config: ExpoConfig = {
  name: 'Empre',
  slug: 'empre',
  scheme: 'empre',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'co.empre.app',
  },
  android: {
    package: 'co.empre.app',
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'],
    config: {
      // Solo necesaria en builds propios (EAS/dev client); Expo Go ya trae una.
      googleMaps: { apiKey: process.env.GOOGLE_MAPS_API_KEY },
    },
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Empre usa tu ubicación para mostrarte los negocios más cercanos.',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Empre necesita acceder a tus fotos para que puedas subir la imagen de tu perfil o de tu negocio.',
      },
    ],
  ],
};

export default config;
