#!/usr/bin/env bash
# Capturas de la pestaña Ofertas del barrio (3.48) en el emulador, para compararlas con el mockup
# docs/mockups/ofertas_donde_buscar.html. Necesita el backend local con los datos de cmd/seeddemo y cmd/seedbarrio,
# Metro en el 8081 y la ubicación del emulador en el Centro de Santa Marta (este script la pone).
#
#   scripts/offers-shots.sh                       # capturas en docs/mockups/despues/ofertas
#   LOGIN=1 scripts/offers-shots.sh               # inicia sesión antes con demo01 (para «Este mes ahorraste»)
#   SIZE=1080x2400 DENSITY=480 scripts/offers-shots.sh ../docs/mockups/despues/ofertas/360
#   FONT=1.3 scripts/offers-shots.sh ../docs/mockups/despues/ofertas/letra-130
set -euo pipefail
export MSYS_NO_PATHCONV=1
export PYTHONIOENCODING=utf-8

ADB=${ADB:-"${LOCALAPPDATA:-}/Android/Sdk/platform-tools/adb.exe"}
command -v "$ADB" >/dev/null 2>&1 || ADB=adb
OUT=${1:-"$(dirname "$0")/../../docs/mockups/despues/ofertas"}
PKG=co.empre.app
METRO=${METRO:-http://10.0.2.2:8081}
WAIT=${WAIT:-3}
EMAIL=${EMAIL:-demo01@empre.app}
PASS=${PASS:-demo1234}
mkdir -p "$OUT"

"$ADB" emu geo fix -74.2110 11.2408 >/dev/null 2>&1 || true # Centro Histórico, Santa Marta
source "$(dirname "$0")/shots-common.sh"
if [ -n "${LOGIN:-}" ]; then login_demo; fi

# Baja la pantalla una vez (de abajo hacia arriba, 1400 px).
down() {
  adb shell input swipe 720 2500 720 1100 500
  sleep 1.5
}

echo "Capturas en $OUT"
tap_text ", Ofertas" >/dev/null 2>&1 || open_url "empre://offers" # la pestaña, por su nombre accesible
shot 01-franja-y-vecinos "Tus vecinos hoy"
down
shot 02-mosaico "Hoy en"
down
shot 03-rutas-y-cuadras "Rutas del barrio"
down
shot 04-vecinos-recomiendan
down
shot 05-antoja-y-barrios
down
shot 06-lista
# Historia de un vecino: se vuelve arriba y se toca el primer círculo.
open_url "empre://offers"
sleep 1
for _ in 1 2 3 4 5 6; do adb shell input swipe 720 900 720 2600 300; done
sleep 1
tap_text "Historia de" && shot 07-historia "Escribirle a"
adb shell input keyevent KEYCODE_BACK
echo "Listo."
