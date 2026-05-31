const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: ['dist/**', 'libs/**', 'node_modules/**', 'tests/visual.spec.js-snapshots/**']
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2024,
        d3: 'readonly',
        JSZip: 'readonly',
        XLSX: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        before: 'readonly',
        after: 'readonly'
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      curly: ['error', 'all'],
      eqeqeq: ['error', 'smart'],
      'no-empty': 'off',
      'no-prototype-builtins': 'off',
      'no-useless-assignment': 'off',
      'no-unused-vars': 'off',
      'no-redeclare': 'off',
      'no-undef': 'off',
      'no-inner-declarations': 'off',
      'no-control-regex': 'off',
      'no-useless-escape': 'off'
    }
  },
  {
    files: ['src/app-core.js', 'main.js', 'preload.js', 'build.js', 'scripts/*.js'],
    languageOptions: {
      sourceType: 'commonjs'
    }
  },
  {
    files: [
      '**/*.mjs',
      'src/d3-custom.js',
      'src/main.js',
      'src/modules/**/*.js',
      'src/exports/**/*.js'
    ],
    languageOptions: {
      sourceType: 'module'
    }
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs'
    }
  },
  {
    files: ['tests/**/*.mjs'],
    languageOptions: {
      sourceType: 'module'
    }
  }
];
