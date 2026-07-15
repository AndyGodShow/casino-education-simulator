import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClientTelemetryEvent } from './clientTelemetry';
import {
  createRuntimeErrorTelemetryEvent,
  createWebVitalTelemetryEvent,
  sendClientTelemetryEvent,
  startClientObservability,
  stopClientObservability,
  type ClientObservabilityTarget,
} from './browserObservability';

const metricEvent = {
  schemaVersion: 1,
  kind: 'web-vital',
  name: 'LCP',
  value: 1_250,
  rating: 'good',
  route: 'world-cup',
  navigationType: 'navigate',
} as const;

afterEach(() => {
  stopClientObservability();
  vi.restoreAllMocks();
});

describe('telemetry event construction', () => {
  it('maps Core Web Vitals fields into the bounded contract', () => {
    expect(createWebVitalTelemetryEvent({
      id: 'v5-1',
      name: 'LCP',
      value: 1_250,
      rating: 'good',
    }, '#/sports/football/world-cup-2026', 'navigate')).toEqual(metricEvent);
  });

  it('fingerprints runtime diagnostics without retaining raw material', async () => {
    const diagnostic = new Error('private user@example.com token=secret');
    const first = await createRuntimeErrorTelemetryEvent(
      'react-error',
      diagnostic,
      '\n at PrivateComponent',
      '#/sports/football/world-cup-2026',
      'reload',
    );
    const second = await createRuntimeErrorTelemetryEvent(
      'react-error',
      diagnostic,
      '\n at PrivateComponent',
      '#/sports/football/world-cup-2026',
      'reload',
    );
    const different = await createRuntimeErrorTelemetryEvent(
      'react-error',
      new Error('different failure'),
      '\n at PrivateComponent',
      '#/sports/football/world-cup-2026',
      'reload',
    );

    expect(first.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(second.fingerprint).toBe(first.fingerprint);
    expect(different.fingerprint).not.toBe(first.fingerprint);
    const serialized = JSON.stringify(first);
    expect(serialized).not.toContain('private');
    expect(serialized).not.toContain('example.com');
    expect(serialized).not.toContain('token');
    expect(serialized).not.toContain('PrivateComponent');
  });
});

describe('sendClientTelemetryEvent', () => {
  it('uses an application/json beacon without falling through to fetch', async () => {
    let beaconBody: Blob | undefined;
    const sendBeacon = vi.fn((_url: string, body: BodyInit | null) => {
      beaconBody = body as Blob;
      return true;
    });
    const fetcher = vi.fn();

    await sendClientTelemetryEvent(metricEvent, { sendBeacon, fetcher });

    expect(sendBeacon).toHaveBeenCalledWith(
      '/api/world-cup/client-telemetry',
      expect.any(Blob),
    );
    expect(beaconBody?.type).toBe('application/json');
    expect(await beaconBody?.text()).toBe(JSON.stringify(metricEvent));
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('falls back to a credential-free keepalive fetch when beacon rejects', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 202 }));

    await sendClientTelemetryEvent(metricEvent, {
      sendBeacon: () => false,
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledWith('/api/world-cup/client-telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metricEvent),
      credentials: 'omit',
      keepalive: true,
    });
  });

  it('swallows delivery errors without retrying', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('network unavailable');
    });

    await expect(sendClientTelemetryEvent(metricEvent, {
      sendBeacon: () => false,
      fetcher,
    })).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledOnce();
  });
});

describe('startClientObservability', () => {
  it('does nothing when production reporting is disabled', async () => {
    const target = createTarget();
    const loadWebVitals = vi.fn();

    await startClientObservability({
      enabled: false,
      target,
      loadWebVitals,
    });

    expect(target.addEventListener).not.toHaveBeenCalled();
    expect(loadWebVitals).not.toHaveBeenCalled();
  });

  it('starts once, maps vitals, and removes global listeners on cleanup', async () => {
    const target = createTarget();
    const callbacks: Partial<Record<'CLS' | 'INP' | 'LCP', (metric: MetricInput) => void>> = {};
    const loadWebVitals = vi.fn(async () => ({
      onCLS: (callback: (metric: MetricInput) => void) => {
        callbacks.CLS = callback;
      },
      onINP: (callback: (metric: MetricInput) => void) => {
        callbacks.INP = callback;
      },
      onLCP: (callback: (metric: MetricInput) => void) => {
        callbacks.LCP = callback;
      },
    }));
    const deliver = vi.fn(async () => undefined);
    const options = {
      enabled: true,
      target,
      navigationType: 'navigate' as const,
      loadWebVitals,
      deliver,
    };

    const cleanup = await startClientObservability(options);
    await startClientObservability(options);
    callbacks.LCP?.({
      id: 'v5-1',
      name: 'LCP',
      value: 1_250,
      rating: 'good',
    });
    await vi.waitFor(() => expect(deliver).toHaveBeenCalledWith(metricEvent));
    callbacks.LCP?.({
      id: 'v5-1',
      name: 'LCP',
      value: 1_300,
      rating: 'good',
    });
    await Promise.resolve();

    expect(loadWebVitals).toHaveBeenCalledOnce();
    expect(target.addEventListener).toHaveBeenCalledTimes(2);
    expect(deliver).toHaveBeenCalledOnce();

    cleanup();
    expect(target.removeEventListener).toHaveBeenCalledTimes(2);
  });

  it('reports global errors with a per-page safety cap and no raw text', async () => {
    const target = createTarget();
    const deliver = vi.fn<(event: ClientTelemetryEvent) => Promise<void>>(
      async () => undefined,
    );
    const cleanup = await startClientObservability({
      enabled: true,
      target,
      navigationType: 'navigate',
      loadWebVitals: async () => ({
        onCLS: vi.fn(),
        onINP: vi.fn(),
        onLCP: vi.fn(),
      }),
      deliver,
    });
    const errorListener = target.listeners.get('error');

    for (let index = 0; index < 12; index += 1) {
      errorListener?.({
        error: new Error(`private runtime error ${index}`),
        message: `private runtime error ${index}`,
      });
    }
    await vi.waitFor(() => expect(deliver).toHaveBeenCalledTimes(10));

    for (const [event] of deliver.mock.calls) {
      const serialized = JSON.stringify(event);
      expect(serialized).not.toContain('private runtime error');
      expect(event.kind).toBe('runtime-error');
    }
    cleanup();
  });
});

type MetricInput = {
  id: string;
  name: 'CLS' | 'INP' | 'LCP';
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
};

const createTarget = () => {
  const listeners = new Map<string, (event: unknown) => void>();
  return {
    location: { hash: '#/sports/football/world-cup-2026' },
    listeners,
    addEventListener: vi.fn((type: string, listener: (event: unknown) => void) => {
      listeners.set(type, listener);
    }),
    removeEventListener: vi.fn((type: string) => {
      listeners.delete(type);
    }),
  } satisfies ClientObservabilityTarget & {
    listeners: Map<string, (event: unknown) => void>;
  };
};
