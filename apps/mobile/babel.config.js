module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Needed to transpile @formatjs/intl-pluralrules's polyfill (static class blocks) — see
      // index.js's doc comment for why the polyfill itself is required on Hermes.
      '@babel/plugin-transform-class-static-block',
      // react-native-reanimated's plugin must run last (its own requirement).
      'react-native-reanimated/plugin',
    ],
  };
};
