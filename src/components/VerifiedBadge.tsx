import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';

export function VerifiedBadge({ size = 16 }: { size?: number }) {
  return (
    <Ionicons
      name="checkmark-circle"
      size={size}
      color={colors.verified}
      accessibilityLabel="Negocio verificado"
    />
  );
}
