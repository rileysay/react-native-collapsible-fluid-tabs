// Expo passes the existing app.json configuration into this function.
module.exports = ({ config }) => {
  if (process.env.FLUID_NATIVE_TESTS !== '1') {
    return config;
  }

  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      './native-test-harness/withRNGHNativeTests.cjs',
    ],
  };
};
