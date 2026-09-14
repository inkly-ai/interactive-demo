import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Demo } from '../src';

const demo = {
  id: 'ctaColour001',
  version: 1,
  steps: [
    {
      id: 'cover',
      kind: 'cover',
      widgets: [
        {
          type: 'headline',
          id: 'h',
          title: 'Hi',
          cta: { label: 'Primary' },
          secondaryCta: { label: 'Neutral', background: '#f8f8f8', textColor: '#1f1f1f' },
        },
      ],
    },
  ],
};

describe('authored CTA colours', () => {
  it('hands an authored colour to the theme as variables so the edge and glow follow it', () => {
    const { container } = render(<Demo config={demo} />);
    const buttons = [...container.querySelectorAll<HTMLElement>('.demo-intro-cta')];
    const primary = buttons.find((b) => b.textContent === 'Primary')!;
    const neutral = buttons.find((b) => b.textContent === 'Neutral')!;
    expect(primary.getAttribute('style')).toBeNull();
    expect(neutral.style.getPropertyValue('--demo-cta-bg')).toBe('#f8f8f8');
    expect(neutral.style.getPropertyValue('--demo-cta-fg')).toBe('#1f1f1f');
    expect(neutral.style.background).toContain('248, 248, 248');
  });
});
