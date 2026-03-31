/** @type {import('stylelint').Config} */
export default {
  extends: ['stylelint-config-standard'],
  rules: {
    'at-rule-no-unknown': [
      true,
      { ignoreAtRules: ['tailwind', 'apply', 'layer', 'config', 'screen', 'variants'] },
    ],
    'no-descending-specificity': null,
    'import-notation': null,
  },
};
