/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: { node: true, browser: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
  ignorePatterns: [
    'node_modules',
    'dist',
    'build',
    '.wrangler',
    '.vite',
    'coverage',
    '*.config.js',
    '*.config.cjs',
    '*.config.mjs',
    '*.config.ts',
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-explicit-any': 'warn',
  },
  overrides: [
    {
      files: ['apps/web/**/*.{ts,tsx}'],
      extends: ['plugin:react/recommended', 'plugin:react-hooks/recommended'],
      plugins: ['react', 'react-hooks', 'react-refresh'],
      settings: { react: { version: 'detect' } },
      rules: {
        'react/react-in-jsx-scope': 'off',
        'react/prop-types': 'off',
        'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      },
    },
    {
      // shadcn/ui primitives co-locate variant helpers with components;
      // the react-refresh rule fights that pattern and is not worth the noise.
      files: ['apps/web/src/components/ui/**/*.{ts,tsx}'],
      rules: {
        'react-refresh/only-export-components': 'off',
      },
    },
    {
      // Legal pages and public marketing pages contain natural-language
      // prose with apostrophes and quote marks. Escaping every one as
      // &apos;/&quot; would make the source unreadable and the prose
      // harder to edit. The rule is appropriate for component code, not
      // long-form copy.
      files: [
        'apps/web/src/pages/legal/**/*.{ts,tsx}',
        'apps/web/src/pages/public/**/*.{ts,tsx}',
        'apps/web/src/pages/HomePage.tsx',
        'apps/web/src/pages/LoginPage.tsx',
        'apps/web/src/pages/RegisterPage.tsx',
        'apps/web/src/pages/TeacherAcceptInvitePage.tsx',
      ],
      rules: {
        'react/no-unescaped-entities': 'off',
      },
    },
  ],
};
