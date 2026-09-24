// Flat config (ESLint 9) — Expo preset.
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  ...expoConfig,
  {
    ignores: ['dist/*', 'node_modules/*', '.expo/*', 'android/*', 'ios/*'],
  },
  {
    // eslint-config-expo (bumped to ~57.0.2 alongside the Expo SDK) pulled in
    // eslint-plugin-react-hooks v7, whose "recommended" preset — spread
    // wholesale in the Expo config's own react.js — now defaults on the full
    // React Compiler analysis rule family (static-components, immutability,
    // refs, purity, set-state-in-effect/-render, preserve-manual-memoization,
    // incompatible-library, use-memo, globals, error-boundaries, gating,
    // config, unsupported-syntax), all at "error".
    //
    // This app has no `experiments.reactCompiler` and doesn't run the React
    // Compiler Babel plugin, so those rules are pure static analysis against
    // a compiler that never runs — and they false-positive hard against
    // patterns used deliberately throughout this codebase: Reanimated shared
    // values (`x.value = withTiming(...)` IS the documented API), the
    // "latest ref" idiom (`ref.current = value` during render, e.g.
    // CreateQuoteScreen's issuesRef/saveRef), react-hook-form's
    // non-memoizable `watch()`, and small inline row-renderer components.
    // Turned off rather than chased file-by-file; adopting React Compiler
    // for real is a separate, deliberate migration.
    //
    // rules-of-hooks and exhaustive-deps predate v7 and aren't part of that
    // family — left as the Expo preset sets them.
    rules: {
      'react-hooks/static-components': 'off',
      'react-hooks/use-memo': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/incompatible-library': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/globals': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/error-boundaries': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/set-state-in-render': 'off',
      'react-hooks/unsupported-syntax': 'off',
      'react-hooks/config': 'off',
      'react-hooks/gating': 'off',
    },
  },
]);
