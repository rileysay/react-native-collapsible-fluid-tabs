module.exports = {
  overrides: [
    {
      exclude: /\/node_modules\//,
      presets: ['module:react-native-builder-bob/babel-preset'],
    },
    {
      include: /\/node_modules\//,
      presets: [
        [
          'module:@react-native/babel-preset',
          {
            enableBabelRuntime: '^7.29.7',
          },
        ],
      ],
    },
  ],
};
