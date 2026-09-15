module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // react-native-reanimated's plugin must run last (its own requirement).
    plugins: ['react-native-reanimated/plugin'],
  };
};
