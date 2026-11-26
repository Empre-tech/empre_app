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

// Sin la llave de Google Maps, Android cierra la app apenas abre un mapa (Empre Finder, el mapa del perfil del
// negocio). En EAS (preview / production) la build falla aquí en vez de entregar un APK que se cierra. La llave se crea
// una vez con: npx eas-cli env:create --name GOOGLE_MAPS_API_KEY --environment preview --environment production
const mapsKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
// app.config.ts corre en Node; el proyecto no trae los tipos de Node, así que se declara solo lo que se usa.
declare const require: (id: string) => { existsSync: (path: string) => boolean };
const { existsSync } = require('fs');
const googleServices = process.env.GOOGLE_SERVICES_JSON || (existsSync('./google-services.json') ? './google-services.json' : undefined);
const easProfile = process.env.EAS_BUILD_PROFILE;
if (easProfile && easProfile !== 'development' && !mapsKey) {
  throw new Error(
    `Falta GOOGLE_MAPS_API_KEY para la build "${easProfile}": sin ella la app se cierra al abrir un mapa. ` +
      'Créala en EAS: npx eas-cli env:create --name GOOGLE_MAPS_API_KEY --environment preview --environment production --visibility sensitive',
  );
}

// Login con Google (opcional, como el dictado): el plugin registra en iOS el esquema que usa el cliente iOS de
// OAuth. Sin el paquete instalado la app compila igual y el botón «Continuar con Google» no aparece.
const GOOGLE_IOS_URL_SCHEME = 'com.googleusercontent.apps.610757440726-huba2mai3bqoaksnjnj4s38lqp6kttik';
const googlePlugin: NonNullable<ExpoConfig['plugins']> = [];
try {
  (require as unknown as { resolve: (id: string) => string }).resolve('@react-native-google-signin/google-signin');
  googlePlugin.push(['@react-native-google-signin/google-signin', { iosUrlScheme: GOOGLE_IOS_URL_SCHEME }]);
} catch {
  // sin el paquete: sin plugin
}

const config: ExpoConfig = {
  name: 'Empre',
  slug: 'empre',
  scheme: 'empre',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
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
    // Firebase (notificaciones push en Android): en EAS llega como variable de tipo archivo GOOGLE_SERVICES_JSON; en un
    // build local, el archivo google-services.json en la raíz (no se sube a git). Sin él, el build sigue, pero Android no
    // recibe notificaciones.
    ...(googleServices ? { googleServicesFile: googleServices } : {}),
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#D42020',
    },
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'],
    config: {
      // Solo necesaria en builds propios (EAS/dev client); Expo Go ya trae una.
      googleMaps: { apiKey: mapsKey },
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
        photosPermission: 'Empre necesita acceder a tus fotos para que puedas subir la imagen de tu perfil, de tu negocio o de tus productos.',
        cameraPermission: 'Empre usa la cámara para escanear códigos QR y tomar fotos de tus productos.',
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission: 'Empre usa la cámara para escanear códigos QR y tomar fotos de tus productos.',
        recordAudioAndroid: false,
      },
    ],
    [
      // La pantalla de carga con el logo nuevo (la «e» blanca sobre el rojo de la marca), igual al ícono.
      'expo-splash-screen',
      {
        image: './assets/brand/empre-mark.png',
        imageWidth: 150,
        backgroundColor: '#FF1D25',
      },
    ],
    [
      'expo-notifications',
      {
        // Android pinta el ícono de la notificación en un solo color: la silueta del logo, en el rojo de la marca.
        icon: './assets/brand/empre-mark.png',
        color: '#FF1D25',
      },
    ],
    ...speechPlugin,
    ...googlePlugin,
  ],
};

export default config;
