# Empre — App móvil

App móvil (React Native + Expo + TypeScript) para descubrir negocios locales de Cartagena en un mapa,
ver su perfil, chatear en tiempo real y publicar tu propio negocio. Consume el backend
[`empre_backend`](https://github.com/Empre-tech/empre_backend) (Go + Gin + Postgres).

## Puesta en marcha (en cualquier PC)

Necesitas: **Node 20.19+**, **Git**, **Docker Desktop** (para el backend) y **Android Studio** (para
compilar el development build del celular — ver más abajo). Para probar la app en el celular, el equipo usa un
**development build propio** (no Expo Go) — ver la sección
["Correr el development build"](#correr-el-development-build-lo-que-usa-el-equipo) más abajo apenas termines
el paso 2. Si solo quieres algo rápido para mirar la UI sin el mapa/push/IA funcionando del todo, Expo Go
también sirve (paso 2) y no necesita Android Studio.

> **Windows**: Docker Desktop necesita WSL2 (Docker te avisa y te guía si no lo tienes). Usa **PowerShell** o
> una terminal de WSL para los comandos; donde el comando cambie entre bash y PowerShell, ya está anotado abajo.

### 1. Backend (repo `empre_backend`)

```bash
git clone https://github.com/Empre-tech/empre_backend.git
cd empre_backend
cp .env.example .env        # en PowerShell: copy .env.example .env
# Edita .env con las credenciales de Supabase, S3 y un JWT_SECRET propio (pídelas al equipo)
docker compose up --build
```

El API queda en `http://localhost:8080` (Swagger en `/api/swagger/index.html`). Las categorías por defecto
se crean solas la primera vez.

### 2. App (este repo)

```bash
git clone <url-de-este-repo> empre_app
cd empre_app
npm install
npm run typecheck           # debe terminar sin errores
npx expo start
```

Escanea el QR con Expo Go (celular físico). La app **detecta sola** dónde está el backend (la misma PC que
sirve la app, puerto 8080), así que no hace falta crear `.env` ni escribir IPs. El celular y la PC deben estar
en la misma red Wi‑Fi. Si prefieres no usar tu celular, sigue la sección de abajo para abrirla en un emulador.

**Esto es solo para una mirada rápida.** Expo Go no soporta notificaciones push, y el asistente de IA por chat y
algunas cosas del WebSocket en segundo plano tampoco funcionan igual — para probar la app completa (que es lo
que usa el equipo día a día), sigue la siguiente sección.

> Importante: **no ejecutes `npm audit fix --force`** en este proyecto. Mezcla versiones de Expo y lo rompe.
> Los avisos de `npm audit` son de herramientas de desarrollo y no afectan la app.
> Si alguna vez las versiones se desalinean: `npx expo install --fix`.

### 3. (Opcional) Usar el emulador de Android en vez del celular

Si no tienes celular a mano o prefieres probar en tu PC:

1. Instala [Android Studio](https://developer.android.com/studio) y, dentro de él, abre **Device Manager** y
   crea un dispositivo virtual (cualquier "Pixel" con Android 13+ funciona bien).
2. Inícialo desde Device Manager (▶) **antes** de correr `npx expo start`, o déjalo que Expo lo abra por ti.
3. Con `npx expo start` corriendo, presiona **`a`** en esa terminal — abre la app en el emulador automáticamente
   (no hace falta escanear QR; el emulador también detecta solo el backend en `http://10.0.2.2:8080`, como ya
   dice `.env.example`).

**Si Android dice que "ya hay un emulador corriendo" y no abre uno nuevo**: casi siempre es un proceso viejo que
quedó colgado de una sesión anterior.
- Windows: abre el **Administrador de tareas**, busca `qemu-system-x86_64.exe` (o `emulator.exe`) y termínalo;
  luego vuelve a abrir el emulador desde Device Manager.
- Mac/Linux: `adb devices` para ver qué quedó activo, y `adb -s <device-id> emu kill` (o `killall qemu-system-x86_64`)
  para cerrarlo.
Después de cerrarlo, abre el emulador de nuevo desde Android Studio y repite `npx expo start` → `a`.

## Correr el development build (lo que usa el equipo)

Es un APK propio con todas las capacidades nativas (mapa con Google Maps, notificaciones push, el asistente de
IA, etc.) — sigue teniendo hot reload como Expo Go, pero sin sus limitaciones. **Lo compilamos localmente** con
`npx expo run:android`, así que sí hace falta tener Android Studio/el SDK de Android instalado (no usamos
`eas build` en la nube para esto).

1. Instala [Android Studio](https://developer.android.com/studio) (trae el SDK de Android). No hace falta crear
   ningún dispositivo virtual — vas a usar tu celular físico por USB.
2. En tu celular Android, activa las **Opciones de desarrollador** (Ajustes → Acerca del teléfono → toca 7 veces
   "Número de compilación") y dentro de ellas activa **Depuración USB**. Conecta el celular a la PC por cable y
   acepta el aviso de "¿Permitir depuración USB?" que aparece en el teléfono.
3. Clona este repo, instala dependencias y agrega la API key de Google Maps a tu `.env`:
   ```bash
   git clone <url-de-este-repo> empre_app
   cd empre_app
   npm install
   cp .env.example .env        # en PowerShell: copy .env.example .env
   # Edita .env y descomenta/completa: GOOGLE_MAPS_API_KEY=TU_LLAVE_AQUI (pídesela al equipo)
   ```
4. Compila e instala en tu celular:
   ```bash
   npx expo run:android
   ```
   La primera vez tarda varios minutos (descarga dependencias nativas y compila con Gradle). Al terminar instala
   la app en tu celular automáticamente y la abre — vas a ver un ícono separado de Expo Go.
5. De ahí en adelante, para seguir trabajando basta con `npx expo start --dev-client` (en vez de `npx expo start`)
   y abrir esa misma app en el celular — hot reload funciona igual que con Expo Go.

Solo hay que repetir el paso 4 (`npx expo run:android`) cuando cambien **dependencias nativas** (un paquete nuevo
de Expo, agregar/cambiar algo en `app.config.ts`, etc.) — un cambio normal de código JS/TSX se ve con hot reload
sin recompilar nada.

### Google Maps API key (si el mapa crashea al abrir la app)

Si al abrir la pantalla "Explorar" la app se cierra sola y en los logs de Android ves algo como:

```
java.lang.IllegalStateException: API key not found. Check that
<meta-data android:name="com.google.android.geo.API_KEY" .../> is in the <application> element of AndroidManifest.xml
```

significa que compilaste sin `GOOGLE_MAPS_API_KEY` en el `.env`. A diferencia de `EXPO_PUBLIC_API_URL` (que se
puede cambiar después sin recompilar), esta llave se **inyecta en el proyecto nativo de Android en el momento de
compilar** (`app.config.ts` la lee de `process.env.GOOGLE_MAPS_API_KEY`), así que agregarla al `.env` después de
que ya instalaste el APK no lo arregla: hay que volver a correr `npx expo run:android` para que se regenere el
`AndroidManifest.xml` con la llave adentro, y eso reinstala la app en tu celular.

La llave sale de [Google Cloud Console](https://console.cloud.google.com/) con la API **Maps SDK for Android**
habilitada — pídesela al equipo en vez de crear una propia, para no duplicar configuración.

## Qué incluye

- **Auth**: registro, login, recuperar contraseña; tokens en `expo-secure-store`, renovación automática del access token.
- **Explorar**: mapa de Cartagena con pines agrupados según el zoom, filtro por categoría y subcategoría
  (se recentra en tu ubicación al aplicar un filtro), búsqueda por nombre/categoría, lista ordenada por
  distancia con calificación (estrellas y cantidad de reseñas) y vista previa al tocar un pin. Se puede explorar sin cuenta.
- **Perfil de negocio** estilo Instagram: banner, foto, sello de verificado, calificación, descripción, cómo llegar
  y llamar (barra de acciones), y dos pestañas — **Publicaciones** (galería a sangre) y **Reseñas**.
- **Publicaciones**: galería estilo Instagram (fotos y videos cortos) con celda "+" para publicar sin salir de la
  vista, miniatura de video en la cuadrícula (bucle mudo, con un badge de "play") y visor a pantalla completa
  (deslizar entre publicaciones; el video reproduce solo mientras es la diapositiva activa, silenciado por
  defecto con botón para activar el sonido). Al publicar, una hoja muestra la vista previa grande, un botón
  "Mejorar con IA" para el texto, y una barra de progreso real de la subida. Descripción editable y borrado por
  el dueño.
- **Reseñas**: calificación de 1 a 5 estrellas y comentario; cada usuario puede escribir, editar o borrar su
  propia reseña de un negocio.
- **Favoritos**: marcar/desmarcar un negocio (ícono de corazón), con su propia lista en la pestaña Perfil.
- **Crear y editar negocios**: datos, categoría y subcategorías, ubicación en el mapa (tocar o arrastrar el pin),
  foto de perfil, banner y galería, horario de atención (con "cerrado" y "24 horas" por día, un modo "mismo
  horario todos los días" por defecto para no tener que llenar 7 filas iguales, y "copiar a todos los días" si ya
  divergen) y modalidad de servicio (en el lugar / a domicilio / ambos). Eliminar negocio.
- **Horarios**: el perfil del negocio muestra un badge "Abierto ahora"/"Cerrado ahora" y el horario completo
  desplegable; el mapa y la lista muestran el mismo estado junto al negocio, y Filtros tiene un toggle
  "Abiertos ahora" para mostrar solo los que están abiertos en este momento.
- **Asistente de IA para crear negocios**: al tocar "Crear negocio" se puede elegir entre el formulario manual o
  describirle el negocio a la IA en una conversación (`/business/new-ai`); la IA sugiere nombre, categoría,
  descripción, modalidad y horario, y al final lleva al mismo formulario de siempre, ya prellenado, para revisar
  y editar antes de guardar — la IA nunca crea el negocio directamente. Requiere que el backend tenga `AI_API_KEY`
  configurada (ver el README del backend); sin eso, la opción de IA simplemente no debe usarse (el backend
  responde 503).
- **"Mejorar con IA" para textos**: el botón (`src/components/AIWritingAssist.tsx`) aparece junto a la
  descripción del negocio (al crear o editar) y junto al texto de cada publicación; abre una hoja con 2-3 opciones
  generadas para elegir una con un toque (o pedir otras), nunca se aplica nada sin que el dueño lo confirme.
  Usa el mismo backend/API key que el asistente conversacional.
- **Foto de perfil del usuario**: toca tu avatar en la pestaña Perfil.
- **Chat en tiempo real** (WebSocket) con historial, reconexión automática y lista de conversaciones; funciona
  tanto para clientes como para el dueño del negocio.
- **Notificaciones push**: nuevo mensaje de chat (si no estás con la conversación abierta), reseña nueva en tu
  negocio, favorito nuevo y cambio de verificación. Requiere un development build, ver más abajo.
- Las fotos se convierten a JPEG y se reducen antes de subirlas. Las publicaciones de galería también aceptan un
  video corto (hasta 60 segundos, según lo detecta el celular; el backend además limita el peso a 60 MB) — se sube
  tal cual lo grabó el celular, sin recomprimir. Requiere el paquete `expo-video` (`npx expo install expo-video`,
  ver más abajo).

## Publicaciones con video

El visor de publicaciones usa `expo-video` para reproducir los videos de la galería. Si no está instalado
(`Cannot find module 'expo-video'` en TypeScript, o al abrir la app), instálalo una vez con:

```
npx expo install expo-video
```

Este comando ajusta `package.json` a la versión compatible con el SDK de Expo que tenga el proyecto en ese momento.

## Notificaciones push

Usan el servicio de push de Expo, así que el token solo se puede generar en una app vinculada a un proyecto de
EAS — **Expo Go no funciona para esto** (Expo le quitó el soporte de push remoto). Necesitas el development build
descrito en ["Correr el development build"](#correr-el-development-build-lo-que-usa-el-equipo); con eso instalado
ya tienes todo lo que hace falta para probarlas, no hay pasos adicionales.

El registro del token es automático: al iniciar sesión, `usePushNotifications` (`src/notifications/`) pide permiso,
obtiene el token de Expo y lo manda a `POST /api/users/push-token`; al cerrar sesión lo da de baja con `DELETE` del
mismo endpoint, así el celular deja de recibir notificaciones de esa cuenta. Tocar una notificación navega directo
a la conversación de chat o al perfil del negocio, según el tipo (`chat`, `review`, `favorite`, `verification`) que
viene en el `data` de la notificación.

## Limitaciones conocidas (dependen del backend)

- Los negocios nuevos quedan **pendientes** de verificación; el flujo de verificación de identidad
  (documento + selfie) aún no existe en el backend, así que no hay pantalla para eso.
- `is_read` no se actualiza: no hay indicador de mensajes no leídos.
- Las URLs de las imágenes son firmadas y caducan a los 15 minutos; se renuevan al recargar los datos.

## Estructura

```
app/                    Rutas (Expo Router)
  (auth)/               login, register, forgot-password
  (tabs)/               index (Explorar), chats, profile
  business/[id].tsx     Perfil del negocio
  business/new.tsx      Crear negocio
  business/edit/[id].tsx  Editar negocio
  chat/[entityId].tsx   Conversación
src/
  api/                  client.ts (fetch + refresh), endpoints.ts, types.ts (espejo de los DTOs del backend)
  auth/                 AuthContext + almacenamiento seguro de tokens
  chat/                 ChatProvider: un solo WebSocket compartido, con reconexión
  notifications/        Registro del token push, navegación al tocar una notificación
  components/           Button, TextField, BusinessForm, LocationPickerModal, ...
  lib/                  geo, cluster, imágenes, formato, utilidades
  config.ts, theme.ts   URL del backend (autodetección) / colores
```

## Notas

- Los colores, textos e identificadores de app (`co.empre.app`) son provisionales.
- El mapa usa `react-native-maps` (Apple Maps en iOS, Google Maps en Android). No funciona en web.
- Nunca subas `.env` a Git; en este repo está ignorado.

## Publicar en las tiendas (más adelante)

El equipo compila el development build localmente (ver
["Correr el development build"](#correr-el-development-build-lo-que-usa-el-equipo)), así que normalmente no hace
falta tocar EAS para nada. El `eas.json` del repo ya trae un perfil `production`
(`eas build --profile production`) listo para cuando llegue el momento de subir la app a Play Store / App Store —
eso sí compila en la nube de Expo, pero es un paso aparte que no afecta el día a día de desarrollo.

## Suscripción de negocios (Wompi)

Los dueños de negocio pueden pagar un plan mensual ("Empre Pro") desde `Mi negocio > Suscripción
del negocio`. El pago se hace en el Widget Web Checkout de Wompi (se abre en el navegador del
sistema vía `expo-web-browser`, nunca dentro de un WebView propio, así Empre nunca toca los datos
de la tarjeta).

Para que funcione:

1. Crea una cuenta de comercio en https://comercios.wompi.co (hay un ambiente **sandbox** para
   probar sin mover dinero real).
2. En el backend, llena en `.env`: `WOMPI_PUBLIC_KEY`, `WOMPI_INTEGRITY_SECRET`,
   `WOMPI_EVENTS_SECRET` (ver `empre_backend/.env.example`).
3. En el panel de Wompi, configura la URL de eventos (webhook) apuntando a
   `https://<tu-backend-público>/api/payments/wompi/webhook` — en desarrollo, la URL del túnel de
   cloudflared que ya usas para el backend.
4. Sin esas llaves, la pantalla de suscripción sigue existiendo pero el botón de pago devuelve un
   error claro ("los pagos no están configurados todavía").

El flujo completo: la app pide un checkout al backend → el backend genera una referencia única y la
firma de integridad que exige Wompi → la app abre el widget con esos datos → el dueño paga → Wompi
llama al webhook del backend con el resultado (firmado, se verifica antes de aplicarlo) → el backend
activa la suscripción por 30 días. Renovar antes de que venza extiende desde la fecha de vencimiento
actual, nunca desde hoy.
