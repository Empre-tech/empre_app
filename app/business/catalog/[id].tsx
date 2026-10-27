import { Redirect, useLocalSearchParams } from 'expo-router';

/** El catálogo ahora vive en «Productos»: producto e inventario son una sola pantalla. */
export default function CatalogRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={{ pathname: '/business/products/[id]', params: { id: id ?? '' } }} />;
}
