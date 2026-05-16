import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import reactYouMightNotNeedAnEffect from 'eslint-plugin-react-you-might-not-need-an-effect';
import unusedImports from 'eslint-plugin-unused-imports';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'unused-imports': unusedImports,
      'react-you-might-not-need-an-effect': reactYouMightNotNeedAnEffect
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...reactRefresh.configs.recommended.rules,
      'react-hooks/exhaustive-deps': 'error',
      // set-state-in-effect: error so regressions surface in CI. Valid
      // sites (external-system sync, mirroring fetched data into form
      // state, reset on prop change) carry an inline disable + reason.
      'react-hooks/set-state-in-effect': 'error',
      // preserve-manual-memoization stays at warn: it flags valid
      // useCallback/useMemo uses the compiler would handle itself.
      'react-hooks/preserve-manual-memoization': 'warn',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'error',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_'
        }
      ],
      'react-refresh/only-export-components': 'warn',
      // discourage deep relative imports. `@/` alias maps to ./src.
      'no-restricted-imports': [
        'warn',
        {
          patterns: [
            {
              group: ['../../*'],
              message:
                'Avoid deep relative imports. Use the @/ alias (e.g. @/components/foo) instead.'
            }
          ]
        }
      ]
    }
  }
]);
