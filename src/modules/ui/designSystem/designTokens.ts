import type { CSSProperties } from 'react';

export const designTokens = {
  colors: {
    background: '#0b0f14',
    card: '#121826',
    cardRaised: '#151f2e',
    border: '#1f2a3a',
    panel: '#0f1622',
    text: {
      primary: '#e6edf3',
      secondary: '#9aa4b2',
      muted: '#96a1b1',
    },
    semantic: {
      model: '#3b82f6',
      market: '#a855f7',
      merged: '#22d3ee',
      trust_good: '#22c55e',
      trust_medium: '#eab308',
      trust_bad: '#ef4444',
    },
  },
  radius: {
    card: '8px',
    control: '8px',
  },
} as const;

export const designCssVariables = {
  '--ui-bg': designTokens.colors.background,
  '--ui-card': designTokens.colors.card,
  '--ui-card-raised': designTokens.colors.cardRaised,
  '--ui-panel': designTokens.colors.panel,
  '--ui-border': designTokens.colors.border,
  '--ui-text-primary': designTokens.colors.text.primary,
  '--ui-text-secondary': designTokens.colors.text.secondary,
  '--ui-text-muted': designTokens.colors.text.muted,
  '--ui-model': designTokens.colors.semantic.model,
  '--ui-market': designTokens.colors.semantic.market,
  '--ui-merged': designTokens.colors.semantic.merged,
  '--ui-trust-good': designTokens.colors.semantic.trust_good,
  '--ui-trust-medium': designTokens.colors.semantic.trust_medium,
  '--ui-trust-bad': designTokens.colors.semantic.trust_bad,
} as unknown as CSSProperties;
