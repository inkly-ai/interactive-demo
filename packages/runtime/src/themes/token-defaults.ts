import type { ThemeTokens } from '../schema';

export const DEFAULT_DEMO_THEME_ID = 'default';

export const demoThemeDefaultTokensById = {
  default: {
    primary: '#5b6cff',
    secondary: '#ebebeb',
    radius: '10px',
    font: 'Geist, ui-sans-serif, system-ui, sans-serif',
  },
  mono: {
    primary: '#5b6cff',
    secondary: '#f5f5f5',
    radius: '10px',
    font: 'Inter, ui-sans-serif, system-ui, sans-serif',
  },
} satisfies Record<'default' | 'mono', ThemeTokens>;

export function demoThemeDefaultTokensFor(themeId: string | undefined): ThemeTokens {
  return themeId && themeId in demoThemeDefaultTokensById
    ? demoThemeDefaultTokensById[
        themeId as keyof typeof demoThemeDefaultTokensById
      ]
    : demoThemeDefaultTokensById[DEFAULT_DEMO_THEME_ID];
}
