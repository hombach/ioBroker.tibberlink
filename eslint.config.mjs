// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  {
    languageOptions: {
        ecmaVersion: 2022,
        parserOptions: {
        projectService: true,
        sourceType: "module",
      },
    },
  },
);
