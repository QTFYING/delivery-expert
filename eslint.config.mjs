import eslintConfigPrettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/.turbo/**', '**/*.d.ts', 'pnpm-lock.yaml'],
  },
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      curly: ['error', 'multi-line'],
      'nonblock-statement-body-position': ['error', 'beside'],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['**/*.domain.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@prisma/client',
              message: 'Domain 层不得直接依赖 @prisma/client，请使用业务 Enum、共享 DTO 或 types/src/contracts。',
            },
          ],
          patterns: [
            {
              group: ['**/prisma/**', '**/prisma/client/**'],
              message: 'Domain 层不得直接引用 Prisma 持久化生成的中间态结构或类型。',
            },
          ],
        },
      ],
    },
  },
];
