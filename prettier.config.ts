import {type Config} from 'prettier';

const prettierConfig: Config = {
  plugins: ['prettier-plugin-astro'],
  overrides: [
    {
      files: ['*.astro'],
      options: {
        parser: 'astro',
      },
    },
  ],
  printWidth: 80,
  singleQuote: true,
  trailingComma: 'all',
  semi: true,
  bracketSpacing: false,
} satisfies Config;

export default prettierConfig;
