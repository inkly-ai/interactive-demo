import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DemoModal } from '../src';

describe('DemoModal', () => {
  it('renders nothing while closed and portals the overlay to body while open', () => {
    const { rerender } = render(<DemoModal open={false} onClose={() => {}}><p>player</p></DemoModal>);
    expect(document.querySelector('.demo-modal-overlay')).toBeNull();
    rerender(<DemoModal open onClose={() => {}}><p>player</p></DemoModal>);
    const overlay = document.querySelector('.demo-modal-overlay')!;
    expect(overlay.parentElement).toBe(document.body);
    expect(overlay.getAttribute('aria-modal')).toBe('true');
    expect(overlay.textContent).toBe('player');
    expect(document.documentElement.classList.contains('demo-modal-no-scroll')).toBe(true);
  });

  it('calls onClose on Escape and on a scrim click, not on a click inside the frame', () => {
    const onClose = vi.fn();
    const { unmount } = render(<DemoModal open onClose={onClose}><p>player</p></DemoModal>);
    fireEvent.click(document.querySelector('.demo-modal-frame')!);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(document.querySelector('.demo-modal-overlay')!);
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    unmount();
    expect(document.documentElement.classList.contains('demo-modal-no-scroll')).toBe(false);
  });
});
