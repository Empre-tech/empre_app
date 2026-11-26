import { Linking, Platform } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';
import { productBase, PRO_TIER_PRODUCT } from '@/lib/storePro';

// Compras de las tiendas con RevenueCat (2026-11-26): Google Play en Android y la App Store en iPhone, con el mismo
// código. La llave pública de cada tienda va en EAS (EXPO_PUBLIC_REVENUECAT_ANDROID_KEY / _IOS_KEY). Sin llave, o en
// un build sin el módulo nativo (Expo Go), las compras no están disponibles y la pantalla lo dice.

type PurchasesModule = typeof import('react-native-purchases').default;

let mod: PurchasesModule | null | undefined;
let configured = false;
let loggedAs: string | null = null;

function apiKey(): string {
  const key = Platform.OS === 'ios' ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
  return (key ?? '').trim();
}

function purchases(): PurchasesModule | null {
  if (mod !== undefined) return mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = (require('react-native-purchases') as { default: PurchasesModule }).default;
  } catch {
    mod = null;
  }
  return mod;
}

/** Hay compras de la tienda en este build (módulo nativo y llave). */
export function storeAvailable(): boolean {
  return (Platform.OS === 'android' || Platform.OS === 'ios') && Boolean(apiKey()) && purchases() !== null;
}

/** Configura RevenueCat y entra con el id del usuario de Empre: así el servidor sabe de quién es la compra. */
async function ready(userId: string): Promise<PurchasesModule> {
  const P = purchases();
  if (!P || !apiKey()) throw new Error('Las compras no están disponibles en esta versión de la app.');
  if (!configured) {
    P.configure({ apiKey: apiKey(), appUserID: userId });
    configured = true;
    loggedAs = userId;
  } else if (loggedAs !== userId) {
    await P.logIn(userId);
    loggedAs = userId;
  }
  return P;
}

/** Al cerrar sesión: la próxima compra queda a nombre de quien entre. */
export async function storeLogout(): Promise<void> {
  if (!configured || !loggedAs) return;
  const P = purchases();
  if (!P) return;
  loggedAs = null;
  try {
    await P.logOut();
  } catch {
    // Sin sesión de RevenueCat no hay nada que cerrar.
  }
}

export interface TierPackage {
  tier: number;
  price: string;
  pkg: PurchasesPackage;
}

/** Los niveles de Pro que ofrece la tienda, con su precio real (de la oferta actual de RevenueCat). */
export async function tierPackages(userId: string): Promise<TierPackage[]> {
  const P = await ready(userId);
  const offerings = await P.getOfferings();
  const pkgs = [...(offerings.current?.availablePackages ?? []), ...Object.values(offerings.all ?? {}).flatMap((o) => o.availablePackages)];
  const out: TierPackage[] = [];
  for (const [tierStr, productId] of Object.entries(PRO_TIER_PRODUCT)) {
    const pkg = pkgs.find((p) => productBase(p.product.identifier) === productId);
    if (pkg) out.push({ tier: Number(tierStr), price: pkg.product.priceString, pkg });
  }
  return out;
}

export type BuyResult = 'bought' | 'cancelled';

/**
 * Compra o cambia de nivel. En Android, cambiar de nivel reemplaza la suscripción anterior (si no, quedarían dos):
 * subir aplica ya con el tiempo restante acreditado; bajar aplica al renovar. En iPhone lo hace la App Store sola
 * (los niveles van en el mismo grupo de suscripciones).
 */
export async function buyTier(userId: string, tp: TierPackage, current?: { productId: string; tier: number } | null): Promise<BuyResult> {
  const P = await ready(userId);
  try {
    if (Platform.OS === 'android' && current?.productId && current.tier > 0 && current.tier !== tp.tier) {
      // PRORATION_MODE: 1 = inmediato con el tiempo restante acreditado; 6 = al renovar.
      const prorationMode = tp.tier > current.tier ? 1 : 6;
      await P.purchasePackage(tp.pkg, null, { oldProductIdentifier: current.productId.split(':')[0], prorationMode } as never);
    } else {
      await P.purchasePackage(tp.pkg);
    }
    return 'bought';
  } catch (e) {
    if ((e as { userCancelled?: boolean })?.userCancelled) return 'cancelled';
    throw new Error(e instanceof Error && e.message ? e.message : 'No se pudo completar la compra.');
  }
}

/** «Restaurar compras» (lo pide Apple): vuelve a asociar las compras de esta cuenta de la tienda al usuario. */
export async function restoreStore(userId: string): Promise<void> {
  const P = await ready(userId);
  await P.restorePurchases();
}

/** Abre la administración de suscripciones de la tienda (cancelar, cambiar el medio de pago). */
export async function manageStore(productId?: string | null): Promise<void> {
  if (Platform.OS === 'android') {
    const sku = productId ? `&sku=${encodeURIComponent(productBase(productId))}` : '';
    await Linking.openURL(`https://play.google.com/store/account/subscriptions?package=co.empre.app${sku}`);
    return;
  }
  const P = purchases();
  if (P && configured) {
    await P.showManageSubscriptions();
    return;
  }
  await Linking.openURL('https://apps.apple.com/account/subscriptions');
}
