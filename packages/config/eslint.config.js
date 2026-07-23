import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    ignores: ['dist/**', 'build/**', 'node_modules/**']
  },
  {
    rules: {
      'no-console': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'off'
    }
  }
];
