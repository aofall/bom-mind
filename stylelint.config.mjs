export default {
  // Detect CSS errors; leave spacing and wrapping to Prettier.
  extends: ['stylelint-config-recommended'],
  ignoreFiles: ['dist/**', 'dist-legacy/**', 'node_modules/**', 'work/**', 'outputs/**', 'docs/**'],
  rules: {
    // Different components share leaf tags (span, svg, button) without sharing DOM.
    // Preserve component and responsive source order instead of sorting by specificity.
    'no-descending-specificity': null,
    'color-no-invalid-hex': true,
    'declaration-property-value-no-unknown': true,
    'property-no-deprecated': true,
  },
};
