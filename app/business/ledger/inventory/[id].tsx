import { Redirect, useLocalSearchParams } from 'expo-router';

/** El inventario ahora vive junto a los productos. */
export default function InventoryRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={{ pathname: '/business/products/[id]', params: { id: id ?? '' } }} />;
}
