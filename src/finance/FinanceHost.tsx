import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { BlurTargetContext, BlurTargetView } from './blur';
import { FinanceOverlay, type FinanceParams } from './FinanceOverlay';

// Capa de Empre Finance sobre toda la app (3.46 F3). Envuelve la navegación en un `BlurTargetView` para que, en
// Android, el vidrio de la bandeja (`BlurView` con `blurTarget`) desenfoque lo que hay detrás, igual que en iPhone.
// La bandeja se abre desde cualquier lado con `requestFinance` (doble toque, enlace empre://finance, acceso rápido);
// si ya está abierta, no se abre otra.

let opener: ((p: FinanceParams) => void) | null = null;

/** Abre la bandeja. Devuelve false si la capa aún no está montada (quien llama puede abrir la ruta /finance). */
export function requestFinance(params: FinanceParams = {}): boolean {
  if (!opener) return false;
  opener(params);
  return true;
}

export function FinanceHost({ children }: { children: ReactNode }) {
  const target = useRef<View>(null);
  const [open, setOpen] = useState<{ n: number; params: FinanceParams } | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    opener = (params) => setOpen((current) => current ?? { n: ++seq.current, params }); // una sola bandeja a la vez
    return () => {
      opener = null;
    };
  }, []);

  const Target = BlurTargetView;
  return (
    <BlurTargetContext.Provider value={Target ? target : null}>
      {Target ? (
        <Target ref={target} style={styles.fill} collapsable={false}>
          {children}
        </Target>
      ) : (
        <View style={styles.fill}>{children}</View>
      )}
      {open ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <FinanceOverlay key={open.n} params={open.params} onClosed={() => setOpen(null)} />
        </View>
      ) : null}
    </BlurTargetContext.Provider>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
