# Funciones comunes de los scripts de capturas en el emulador (finance-shots.sh, offers-shots.sh). Se cargan con
# `source` después de definir ADB, OUT, PKG, METRO, WAIT, EMAIL y PASS. Al cargarse: concede permisos, conecta la app
# de desarrollo a Metro, cierra los diálogos que tapan la app y prepara la revisión de accesibilidad (accesibilidad.txt).
# shellcheck shell=bash

adb() { "$ADB" "$@"; }

open_url() { adb shell am start -a android.intent.action.VIEW -d "'$1'" "$PKG" >/dev/null; }
# Cierra Finance del todo (y la voz o el panel, si están abiertos) antes del siguiente estado: si el enlace llega con
# Finance abierto, la pantalla conserva su estado y la captura sale repetida.
back() {
  for _ in $(seq 1 5); do
    adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || true
    adb exec-out cat /sdcard/ui.xml 2>/dev/null | grep -qE 'Hoy te quedó|Hoy quedaría|Ver todo en Empre|Mantén para registrar|Agrega algo a la venta|Agrega un gasto|Aún no tienes un negocio|Cerrar Empre Finance' || return 0
    adb shell input keyevent KEYCODE_BACK
    sleep 1.2
  done
}
audit() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || return 0
  adb exec-out cat /sdcard/ui.xml > "$OUT/.ui.xml" 2>/dev/null || return 0
  python "$(dirname "$0")/a11y-audit.py" "$OUT/.ui.xml" "$DPI" "$1" >> "$OUT/accesibilidad.txt" || true
  rm -f "$OUT/.ui.xml"
}
shot() {
  local name=$1
  [ -n "${2:-}" ] && wait_for "$2"
  sleep "$WAIT"
  adb exec-out screencap -p > "$OUT/$name.png"
  audit "$name"
  echo "  ✓ $name"
}

# Toca el primer elemento cuyo texto, pista o descripción contiene $1 (con el árbol de uiautomator).
tap_text() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null
  local xml bounds
  xml=$(adb exec-out cat /sdcard/ui.xml)
  bounds=$(printf '%s' "$xml" | tr '>' '\n' | grep -E "(text|hint|content-desc)=\"[^\"]*$1" | head -1 | sed -E 's/.*bounds="\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]".*/\1 \2 \3 \4/')
  [ -n "$bounds" ] || { echo "No encontré «$1» en pantalla" >&2; return 1; }
  read -r x1 y1 x2 y2 <<<"$bounds"
  adb shell input tap $(((x1 + x2) / 2)) $(((y1 + y2) / 2))
}

# Espera hasta que en pantalla aparezca el texto $1 (máximo 60 s): el emulador puede tardar en dibujar.
wait_for() {
  for _ in $(seq 1 30); do
    adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || true
    local xml
    xml=$(adb exec-out cat /sdcard/ui.xml 2>/dev/null || true)
    printf '%s' "$xml" | grep -q "$1" && return 0
    # Diálogos que aparecen solos y tapan la app: la bienvenida del menú de desarrollo y la precisión de ubicación.
    if printf '%s' "$xml" | grep -q 'text="Continue"'; then tap_text "Continue" || true; fi
    if printf '%s' "$xml" | grep -q 'text="No thanks"'; then tap_text "No thanks" || true; fi
    sleep 2
  done
  echo "  (no apareció «$1»)" >&2
}
restore() {
  if [ -n "${SIZE:-}" ]; then adb shell wm size reset; adb shell wm density reset; fi
  if [ -n "${FONT:-}" ]; then adb shell settings put system font_scale 1.0; fi
  adb shell svc wifi enable >/dev/null 2>&1 || true
  adb shell svc data enable >/dev/null 2>&1 || true
}
trap restore EXIT

: > "$OUT/accesibilidad.txt"
if [ -n "${FONT:-}" ]; then adb shell settings put system font_scale "$FONT"; fi
if [ -n "${SIZE:-}" ]; then
  adb shell wm size "$SIZE"
  [ -n "${DENSITY:-}" ] && adb shell wm density "$DENSITY"
fi
# Después de cambiar el tamaño: la última línea es la densidad que usa la pantalla ahora («Override» si hay una).
DPI=$(adb shell wm density | tr -d '\r' | awk -F": " '{print $NF}' | tail -1)

# Espera a que la app termine de cargar el código desde Metro (la primera vez puede tardar varios minutos).
wait_ready() {
  for _ in $(seq 1 90); do
    adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || true
    local xml
    xml=$(adb exec-out cat /sdcard/ui.xml 2>/dev/null || true)
    if printf '%s' "$xml" | grep -q 'text="[^"]\{3,\}"' && ! printf '%s' "$xml" | grep -qE 'Loading from|Bundling|Cargando'; then return 0; fi
    sleep 2
  done
  echo "La app no terminó de cargar en 3 minutos" >&2
  return 1
}

# Permisos concedidos de antemano: así no aparecen diálogos del sistema encima de las capturas.
for perm in ACCESS_FINE_LOCATION ACCESS_COARSE_LOCATION RECORD_AUDIO POST_NOTIFICATIONS; do
  adb shell pm grant "$PKG" "android.permission.$perm" >/dev/null 2>&1 || true
done

if [ -z "${SKIP_CONNECT:-}" ]; then
  echo "Conectando la app de desarrollo a $METRO…"
  open_url "empre://expo-development-client/?url=$(printf '%s' "$METRO" | sed 's/:/%3A/g; s#/#%2F#g')"
  wait_ready || true
fi
# La primera vez, el menú de desarrollo muestra su bienvenida («Continue») encima de todo.
tap_text "Continue" 2>/dev/null || true
# Google pide «Precisión de ubicación»: se rechaza (lo más privado) para que no tape la app.
tap_text "No thanks" 2>/dev/null || tap_text "No, gracias" 2>/dev/null || true
sleep 1


login_demo() {
  echo "Iniciando sesión con $EMAIL…"
  # Por la pestaña Perfil (un enlace directo a /login dejaba la pantalla en blanco en la app de desarrollo).
  wait_for "Perfil"; tap_text "Perfil"; sleep 2
  wait_for "Iniciar sesión"; tap_text "Iniciar sesión"; sleep 2
  # Se borra el campo antes de escribir y se comprueba lo escrito: el teclado del emulador a veces repite la primera letra.
  type_into() {
    tap_text "$1"
    adb shell input keyevent KEYCODE_MOVE_END
    for _ in $(seq 1 40); do adb shell input keyevent KEYCODE_DEL; done
    adb shell input text "$2"
  }
  wait_for "tu@correo.com"
  for _ in 1 2 3; do
    type_into "tu@correo.com" "$EMAIL"
    adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
    adb exec-out cat /sdcard/ui.xml | grep -q "text=\"$EMAIL\"" && break
  done
  type_into "••••••" "$PASS"
  adb shell input keyevent KEYCODE_ENTER # la contraseña envía el formulario
  wait_for "$EMAIL"
}
