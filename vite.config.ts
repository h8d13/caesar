import { defineConfig } from 'vite-plus';

// Workspace-wide lint + format. `vp check` only reads this root block, so
// package differences live in `overrides` instead of per-package configs.

type TRestrictedImports = [
  'warn',
  { patterns: { group: string[]; message: string }[] }
];

const unusedIgnoringUnderscore: [
  'error',
  {
    vars: 'all';
    varsIgnorePattern: string;
    args: 'after-used';
    argsIgnorePattern: string;
  }
] = [
  'error',
  {
    vars: 'all',
    varsIgnorePattern: '^_',
    args: 'after-used',
    argsIgnorePattern: '^_'
  }
];

const avoidDeepRelative = (
  alias: string,
  example: string
): TRestrictedImports => [
  'warn',
  {
    patterns: [
      {
        group: ['../../*'],
        message: `Avoid deep relative imports. Use the ${alias} alias (e.g. ${example}) instead.`
      }
    ]
  }
];

// Same set as eslint-plugin-react-hooks' recommended preset (v7.1.1);
// Oxlint implements the React Compiler rules natively under `react/`.
// config/gating only validate compiler options, which the client does not use.
const reactHooksRules = {
  'react/rules-of-hooks': 'error',
  'react/exhaustive-deps': 'error',
  'react/static-components': 'error',
  'react/use-memo': 'error',
  // flags valid useCallback/useMemo the compiler would handle itself
  'react/preserve-manual-memoization': 'warn',
  'react/incompatible-library': 'warn',
  'react/globals': 'error',
  'react/refs': 'error',
  'react/purity': 'error',
  'react/immutability': 'error',
  // valid sites (external-system sync, mirroring fetched data into form
  // state, reset on prop change) carry an inline disable + reason
  'react/set-state-in-effect': 'error',
  'react/error-boundaries': 'error',
  'react/set-state-in-render': 'error',
  'react/unsupported-syntax': 'warn'
} as const;

export default defineConfig({
  fmt: {
    singleQuote: true,
    printWidth: 80,
    proseWrap: 'always',
    tabWidth: 2,
    useTabs: false,
    trailingComma: 'none',
    bracketSpacing: true,
    semi: true,
    // TypeScript's organizeImports order (what prettier-plugin-organize-
    // imports applied): one alphabetical block for packages and aliases,
    // relative paths after, blank lines start a new block.
    sortImports: {
      groups: [
        ['builtin', 'external', 'internal', 'subpath', 'unknown'],
        ['parent', 'sibling', 'index']
      ],
      newlinesBetween: false,
      partitionByNewline: true,
      ignoreCase: true
    },
    // formatting covers TS/TSX only; docs, config and data stay hand-written
    ignorePatterns: [
      '*.md',
      '*.json',
      '*.yaml',
      '*.yml',
      '*.css',
      '*.html',
      '*.js',
      '*.mjs',
      '**/dist/**',
      '**/build/**',
      '**/.vite-devmaps/**',
      '**/data*/**',
      '**/drizzle/**',
      '*.wiki/**'
    ],
    overrides: [{ files: ['apps/client/**'], options: { tabWidth: 4 } }]
  },
  lint: {
    plugins: ['eslint', 'typescript', 'unicorn', 'oxc', 'react'],
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    options: {
      typeAware: true,
      typeCheck: true,
      reportUnusedDisableDirectives: 'error'
    },
    // public/ holds vendored, minified worklet builds
    ignorePatterns: ['**/public/**'],
    rules: {
      'vite-plus/prefer-vite-plus-imports': 'error',
      'no-unused-vars': unusedIgnoringUnderscore,
      'typescript/no-explicit-any': 'warn',
      // typescript-eslint recommended, off by default in Oxlint
      'typescript/ban-ts-comment': 'error',
      'typescript/no-empty-object-type': 'error',
      // Node exits on an unhandled rejection (a publisher whose DB query
      // fails is a crash); in the client it is a silently lost error.
      'typescript/no-floating-promises': 'error',
      // picked from suspicious/pedantic/style/perf: dead or redundant code
      // with near-zero false positives, most auto-fixable (`vp lint --fix`)
      'typescript/no-unnecessary-type-assertion': 'error',
      'typescript/no-unnecessary-type-conversion': 'error',
      'typescript/no-unnecessary-type-arguments': 'error',
      'typescript/no-unnecessary-boolean-literal-compare': 'error',
      'typescript/no-inferrable-types': 'error',
      'typescript/prefer-ts-expect-error': 'error',
      'typescript/consistent-type-imports': [
        'error',
        { fixStyle: 'inline-type-imports' }
      ],
      'no-duplicate-imports': ['error', { allowSeparateTypeImports: true }],
      // arguments off: dropping `undefined` breaks required-param calls
      'unicorn/no-useless-undefined': ['error', { checkArguments: false }],
      'unicorn/no-useless-switch-case': 'error',
      'unicorn/no-lonely-if': 'error',
      'no-else-return': 'error',
      'no-useless-return': 'error',
      'object-shorthand': 'error',
      'react/jsx-no-useless-fragment': 'error',
      'react/self-closing-comp': 'error',
      'unicorn/prefer-set-has': 'error',
      'unicorn/prefer-array-flat-map': 'error',
      'unicorn/prefer-array-some': 'error',
      'unicorn/prefer-regexp-test': 'error',
      'oxc/no-accumulating-spread': 'error'
    },
    overrides: [
      {
        files: ['apps/server/**/*.ts'],
        rules: {
          'no-restricted-imports': avoidDeepRelative('@server/', '@server/db')
        }
      },
      {
        files: ['apps/client/**/*.{ts,tsx}'],
        rules: {
          ...reactHooksRules,
          'react/only-export-components': 'warn',
          'no-restricted-imports': avoidDeepRelative('@/', '@/components/foo')
        }
      },
      {
        // html-react-parser's `replace` renders the node raw unless it gets
        // a React element back: `<></>` drops a node, `<>{children}</>`
        // unwraps it, so these fragments are load-bearing
        files: ['apps/client/src/components/channel-view/text/renderer/**'],
        rules: { 'react/jsx-no-useless-fragment': 'off' }
      },
      {
        files: ['**/__tests__/**/*.ts'],
        rules: { 'typescript/no-explicit-any': 'off' }
      }
    ]
  }
});
