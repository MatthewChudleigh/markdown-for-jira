module.exports = {
  root: true,
  env: { node: true, browser: true, es2022: true },
  parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
  extends: ['eslint:recommended'],
  ignorePatterns: ['node_modules', 'dist', '.forge', 'static/*/dist'],
  overrides: [
    {
      files: ['static/**/*.{js,jsx}'],
      env: { browser: true, node: false },
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { React: 'readonly' },
    },
    {
      files: ['test/**/*.js'],
      env: { node: true },
      globals: { describe: 'readonly', it: 'readonly', expect: 'readonly' },
    },
  ],
  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  },
};
