import { fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Demo } from '../src';

function demo(submitTo?: string) {
  return {
    id: 'formSubmit01',
    version: 1,
    steps: [
      {
        id: 'gate',
        kind: 'cover',
        widgets: [
          {
            type: 'form',
            id: 'lead',
            title: 'Tell us about you',
            fields: [{ id: 'email', label: 'Email', type: 'text', required: true }],
            ...(submitTo ? { submitTo } : {}),
          },
        ],
      },
      {
        id: 's1',
        kind: 'content',
        background: { type: 'image', src: 'assets/a.png', naturalWidth: 1200, naturalHeight: 600 },
      },
    ],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('form submissions', () => {
  it('POSTs the fields as JSON to submitTo and emits the event', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const onEvent = vi.fn();
    const { container } = render(<Demo config={demo('https://hooks.example/lead')} onEvent={onEvent} />);
    const input = container.querySelector<HTMLInputElement>('input')!;
    fireEvent.change(input, { target: { value: 'a@b.co' } });
    fireEvent.submit(container.querySelector('form')!);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://hooks.example/lead');
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ demoId: 'formSubmit01', stepId: 'gate', widgetId: 'lead', fields: [{ id: 'email', label: 'Email', value: 'a@b.co' }] });
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'form_submit', widgetId: 'lead' }));
  });

  it('sends nothing without submitTo', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(<Demo config={demo()} />);
    fireEvent.change(container.querySelector('input')!, { target: { value: 'a@b.co' } });
    fireEvent.submit(container.querySelector('form')!);
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
