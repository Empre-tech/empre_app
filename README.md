# Empre — App móvil

App móvil (React Native + Expo + TypeScript) para descubrir negocios locales de Cartagena en un mapa,
ver su perfil, chatear en tiempo real y publicar tu propio negocio. Consume el backend
[`empre_backend`](https://github.com/Empre-tech/empre_backend) (Go + Gin + Postgres).

## Puesta en marcha (en cualquier PC)

Necesitas: **Node 20.19+**, **Git**, **Docker Desktop** (para el backend) y la app **Expo Go** en tu celular.

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

Escanea el QR con Expo Go. La app **detecta sola** dónde está el backend (la misma PC que sirve la app,
puerto 8080), así que no hace falta crear `.env` ni escribir IPs. El celular y la PC deben estar en la misma red Wi‑Fi.

Esto alcanza para todo **excepto las notificaciones push** (Expo Go ya no las soporta): ver la sección [Notificaciones push](#notificaciones-push) para ese caso.

> Importante: **no ejecutes `npm audit fix --force`** en este proyecto. Mezcla versiones de Expo y lo rompe.
> Los avisos de `npm audit` son de herramientas de desarrollo y no afectan la app.
> Si alguna vez las versiones se desalinean: `npx expo install --fix`.

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
EAS — **Expo Go no funciona para esto** (Expo le quitó el soporte de push remoto). Para probarlas:

1. `npx expo install expo-notifications expo-device` (ya están en `package.json`; correr solo si hace falta reinstalar).
2. `npx eas-cli@latest init` una vez, para vincular el proyecto a tu cuenta de Expo — esto genera un
   `extra.eas.projectId` que hay que pegar a mano en `app.config.ts` (usa configuración dinámica, así que EAS no
   puede escribirlo solo). El proyecto actual (`gioleonp/empre`) es personal: si otra persona del equipo va a
   compilar, necesita que la agreguen como colaboradora en [expo.dev](https://expo.dev), o crear su propio
   proyecto de EAS y actualizar el `projectId`.
3. Generar un development build (reemplaza a Expo Go para este proyecto):
   - Android: `npx expo run:android` (compila localmente, necesita Android Studio/el SDK de Android).
   - iOS: no se puede compilar localmente desde Windows (hace falta Xcode/Mac). La alternativa es
     `npx eas-cli build --profile development --platform ios`, que compila en la nube — para instalarlo en un
     iPhone físico hace falta una cuenta de Apple Developer Program (de pago) para el certificado/provisioning.
4. Con el development build instalado, corre `npx expo start --dev-client` en vez de `npx expo start` y ábrelo
   desde ahí (ya no se abre con el QR de Expo Go).

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
