import type { ThemeTokens } from '../schema';

/**
 * Last-resort runtime fallback for the 4 theme tokens. Normal rendering
 * resolves the active preset first, then host tokens, then demo tokens;
 * these values are only used when no preset/default token exists.
 */
export const defaultThemeTokens = {
  primary: '#5b3df5',
  secondary: '#f4f4f5',
  radius: '12px',
  font: 'Inter, system-ui, sans-serif',
} satisfies ThemeTokens;
