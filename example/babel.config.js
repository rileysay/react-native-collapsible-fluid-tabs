module.exports = function (api) {
  api.cache(true);

  // bob's getConfig() adds an `include` override for library source, which
  // breaks Expo SDK 56 Metro cache-key construction (Babel needs a filename
  // when overrides use path patterns). Metro already resolves the library via
  // react-native-monorepo-config + package.json#exports "source".
  return {
    presets: ['babel-preset-expo'],
  };
};
