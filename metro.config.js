const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const config = getDefaultConfig(__dirname);
const stubs = { 'react-native-maps': 'src/zzStubMaps.js', 'expo-notifications': 'src/zzStubNotif.js', '@/auth/AuthContext': 'src/zzStubAuth.js' };
config.resolver.resolveRequest = (ctx, name, plat) => {
  if (plat === 'web' && stubs[name]) return { type: 'sourceFile', filePath: path.join(__dirname, stubs[name]) };
  return ctx.resolveRequest(ctx, name, plat);
};
module.exports = config;
