"""Revisión rápida de accesibilidad sobre un volcado de uiautomator (lo usa scripts/finance-shots.sh).

Marca lo que se puede tocar y TalkBack no podría nombrar: sin descripción (accessibilityLabel) y sin ningún texto
dentro. También marca lo tocable de menos de 44 × 44 dp (con la densidad que se le pase). No ve el `hitSlop`
(área de toque extendida sin cambiar el tamaño): esos casos salen aunque se puedan tocar bien. Tampoco distingue lo
que está debajo de la bandeja (la pantalla de atrás) ni un chip cortado por el borde de un carrusel. Uso:

    python scripts/a11y-audit.py ui.xml <densidad_dpi> <nombre-del-estado>
"""
import sys
import xml.etree.ElementTree as ET

path, dpi, name = sys.argv[1], int(sys.argv[2]), sys.argv[3]
scale = dpi / 160
root = ET.parse(path).getroot()


def texts(node):
    yield node.get('text', '')
    yield node.get('content-desc', '')
    for child in node:
        yield from texts(child)


def size_dp(node):
    b = node.get('bounds', '[0,0][0,0]').replace('][', ',').strip('[]').split(',')
    x1, y1, x2, y2 = map(int, b)
    return (x2 - x1) / scale, (y2 - y1) / scale


problems = []
for node in root.iter('node'):
    if node.get('package') != 'co.empre.app' or node.get('clickable') != 'true':
        continue
    w, h = size_dp(node)
    label = next((t for t in texts(node) if t.strip()), '')
    if not label:
        problems.append(f'sin nombre ({w:.0f}×{h:.0f} dp en {node.get("bounds")})')
    elif min(w, h) < 43.5 and w > 0:
        problems.append(f'«{label[:30]}» mide {w:.0f}×{h:.0f} dp')

for p in problems:
    print(f'{name}: {p}')
