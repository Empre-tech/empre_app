import React from 'react';
import { View } from 'react-native';
const MapView = ({ children, style }) => (
  <View style={[style, { backgroundColor: '#E7EEF4' }]}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 26, padding: 34, paddingTop: 70 }}>{children}</View>
  </View>
);
export const Marker = ({ children }) => <View>{children}</View>;
export const Polyline = () => null;
export const Circle = () => null;
export const Polygon = () => null;
export const Callout = () => null;
export const PROVIDER_GOOGLE = 'google';
export const PROVIDER_DEFAULT = null;
export default MapView;
