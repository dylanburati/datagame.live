module.exports = function (api) {
  api.cache(true);
  return {
    plugins: ['babel-plugin-lodash'],
    presets: ['babel-preset-expo'],
  };
};
