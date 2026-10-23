import type { ExpoConfig } from 'expo/config';

// Los identificadores (bundleIdentifier / package) son provisionales:
// cámbialos antes de publicar en las tiendas.
// Dictado de «Mi negocio». Es opcional: si el paquete aún no está instalado, la app compila igual y la hoja de dictado
// funciona escribiendo (o con el micrófono del teclado). Se instala con: npx expo install expo-speech-recognition
const speechPlugin: NonNullable<ExpoConfig['plugins']> = [];
try {
  (require as unknown as { resolve: (id: string) => string }).resolve('expo-speech-recognition');
  speechPlugin.push([
    'expo-speech-recognition',
    {
      microphonePermission: 'Empre usa el micrófono para que puedas dictar tus ventas y gastos.',
      speechRecognitionPermission: 'Empre usa el reconocimiento de voz para convertir lo que dictas en texto.',
      androidSpeechServicePackages: ['com.google.android.googlequicksearchbox'],
    },
  ]);
} catch {
  // sin el paquete: sin plugin
}

const config: ExpoConfig = {
  name: 'Empre',
  slug: 'empre',
  scheme: 'empre',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  owner: 'gioleonp',
  extra: {
    eas: {
      projectId: '20ce8d48-19b2-4f50-805f-a5eb9044eefe',
    },
  },
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
    'expo-web-browser',
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
    [
      'expo-camera',
      {
        cameraPermission: 'Empre usa la cámara para escanear códigos QR.',
        recordAudioAndroid: false,
      },
    ],
    [
      'expo-notifications',
      {
        // Ícono/color del ícono pequeño de la notificación en Android. Usa el
        // color de marca; el ícono real se agrega más adelante (por ahora cae
        // al ícono por defecto de la app).
        color: '#F58220',
      },
    ],
    ...speechPlugin,
  ],
};

export default config;
