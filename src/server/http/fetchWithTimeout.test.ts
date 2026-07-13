import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithTimeout } from './fetchWithTimeout';

describe('fetchWithTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('aborts and preserves the fetch rejection when the deadline expires', async () => {
    vi.useFakeTimers();
    let passedSignal: AbortSignal | undefined;
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        passedSignal = init?.signal ?? undefined;
        passedSignal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      })
    )) as unknown as typeof fetch;

    const request = fetchWithTimeout('https://example.test/data', {}, 25, fetcher);
    const rejection = expect(request).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(25);

    await rejection;
    expect(passedSignal?.aborted).toBe(true);
  });

  it('clears the deadline after a fast response', async () => {
    vi.useFakeTimers();
    const response = new Response('ok');
    const fetcher = vi.fn(async () => response) as unknown as typeof fetch;

    await expect(
      fetchWithTimeout('https://example.test/data', {}, 25, fetcher),
    ).resolves.toBe(response);

    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not start a request when the caller signal is already aborted', async () => {
    vi.useFakeTimers();
    const caller = new AbortController();
    caller.abort();
    const fetcher = vi.fn(async () => new Response('unexpected')) as unknown as typeof fetch;

    await expect(
      fetchWithTimeout(
        'https://example.test/data',
        { signal: caller.signal },
        25,
        fetcher,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(fetcher).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts an in-flight request when the caller aborts', async () => {
    vi.useFakeTimers();
    const caller = new AbortController();
    let passedSignal: AbortSignal | undefined;
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        passedSignal = init?.signal ?? undefined;
        passedSignal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      })
    )) as unknown as typeof fetch;

    const request = fetchWithTimeout(
      'https://example.test/data',
      { signal: caller.signal },
      25,
      fetcher,
    );
    const rejection = expect(request).rejects.toMatchObject({ name: 'AbortError' });
    caller.abort('cancelled by caller');

    await rejection;
    expect(passedSignal?.aborted).toBe(true);
    expect(passedSignal?.reason).toBe('cancelled by caller');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('removes caller abort forwarding after a fast response', async () => {
    vi.useFakeTimers();
    const caller = new AbortController();
    let passedSignal: AbortSignal | undefined;
    const response = new Response('ok');
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      passedSignal = init?.signal ?? undefined;
      return response;
    }) as unknown as typeof fetch;

    await expect(fetchWithTimeout(
      'https://example.test/data',
      { signal: caller.signal },
      25,
      fetcher,
    )).resolves.toBe(response);
    caller.abort();

    expect(passedSignal?.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
