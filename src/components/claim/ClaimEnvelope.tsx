import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from 'react-native';
import type { OfferClaim as Claim } from '@/api/types';
import { Button } from '@/components/Button';
import { EmpreSymbol } from '@/components/EmpreSymbol';
import { formatWindow } from '@/lib/offer';
import { colors, fonts, radius, spacing } from '@/theme';

/** Justo después de reclamar: el sobre cerrado. Abrirlo lleva al QR. */
export function ClaimEnvelope({ claim, onOpen }: { claim: Claim; onOpen: () => void }) {
  const [enter] = useState(() => new Animated.Value(0));
  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (cancelled) return;
        if (reduce) enter.setValue(1);
        else Animated.spring(enter, { toValue: 1, useNativeDriver: true, friction: 7 }).start();
      })
      .catch(() => enter.setValue(1));
    return () => {
      cancelled = true;
    };
  }, [enter]);

  const minutes = claim.offer?.claim_window_minutes;
  return (
    <View style={styles.wrap}>
      <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.envelope, { opacity: enter, transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }]}>
        <View style={styles.flapLeft} />
        <View style={styles.flapRight} />
        <View style={styles.seal}>
          <EmpreSymbol product="offers" size={42} />
        </View>
      </Animated.View>
      <Text style={styles.title} accessibilityRole="header">
        Tu oferta está lista
      </Text>
      <Text style={styles.body}>
        {claim.entity_name ? `${claim.entity_name} te guardó un cupo.` : 'Te guardamos un cupo.'}
        {minutes ? ` Tienes ${formatWindow(minutes)} para usarla en el local.` : ''}
      </Text>
      <Button title="Abrir el sobre" onPress={onOpen} style={styles.btn} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.xxl },
  envelope: { width: 280, height: 186, borderRadius: radius.lg, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  flapLeft: { position: 'absolute', left: -30, top: -70, width: 190, height: 190, backgroundColor: '#0B1A36', transform: [{ rotate: '45deg' }] },
  flapRight: { position: 'absolute', right: -30, top: -70, width: 190, height: 190, backgroundColor: '#0B1A36', transform: [{ rotate: '45deg' }] },
  seal: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  title: { marginTop: spacing.md, fontSize: 24, fontFamily: fonts.display.bold, color: colors.ink, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center' },
  btn: { alignSelf: 'stretch', marginTop: spacing.md },
});
