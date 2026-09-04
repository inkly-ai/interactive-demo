import type { ThemeTokens } from '../schema';

export const DEFAULT_DEMO_THEME_ID = 'mono';

export const demoThemeDefaultTokensById = {
  mono: {
    primary: '#5b6cff',
    secondary: '#f5f5f5',
    radius: '10px',
    font: 'Inter, ui-sans-serif, system-ui, sans-serif',
  },
} satisfies Record<'mono', ThemeTokens>;

export function demoThemeDefaultTokensFor(themeId: string | undefined): ThemeTokens {
  return themeId && themeId in demoThemeDefaultTokensById
    ? demoThemeDefaultTokensById[
        themeId as keyof typeof demoThemeDefaultTokensById
      ]
    : demoThemeDefaultTokensById[DEFAULT_DEMO_THEME_ID];
}
