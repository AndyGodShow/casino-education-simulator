import type { ErrorInfo } from 'react';
import {
  CLIENT_TELEMETRY_SCHEMA_VERSION,
  classifyClientTelemetryRoute,
  type ClientTelemetryEvent,
  type ClientTelemetryNavigationType,
} from './clientTelemetry';

const TELEMETRY_ENDPOINT = '/api/world-cup/client-telemetry';
const MAX_RUNTIME_ERRORS_PER_PAGE = 10;

type CoreWebVitalName = 'CLS' | 'INP' | 'LCP';
type RuntimeErrorName = 'window-error' | 'unhandled-rejection' | 'react-error';

type WebVitalMetric = {
  id: string;
  name: CoreWebVitalName;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
};

type WebVitalsModule = {
  onCLS: (callback: (metric: WebVitalMetric) => void) => void;
  onINP: (callback: (metric: WebVitalMetric) => void) => void;
  onLCP: (callback: (metric: WebVitalMetric) => void) => void;
};

export type ClientObservabilityTarget = {
  location: { hash: string };
  addEventListener: (type: string, listener: (event: unknown) => void) => void;
  removeEventListener: (type: string, listener: (event: unknown) => void) => void;
};

type ClientTelemetryDelivery = {
  sendBeacon?: (url: string, data: BodyInit | null) => boolean;
  fetcher?: typeof fetch;
};

type StartClientObservabilityOptions = {
  enabled?: boolean;
  target?: ClientObservabilityTarget;
  navigationType?: ClientTelemetryNavigationType;
  loadWebVitals?: () => Promise<WebVitalsModule>;
  deliver?: (event: ClientTelemetryEvent) => Promise<void>;
};

let activeCleanup: (() => void) | null = null;
let activeReactReporter: ((error: unknown, componentStack: string) => void) | null = null;

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const describeDiagnostic = (diagnostic: unknown) => {
  if (diagnostic instanceof Error) {
    return [diagnostic.name, diagnostic.message, diagnostic.stack ?? ''].join('\n');
  }
  if (typeof diagnostic === 'string') return `string\n${diagnostic}`;
  return `non-error\n${typeof diagnostic}`;
};

const defaultTarget = (): ClientObservabilityTarget | undefined => {
  if (typeof window === 'undefined') return undefined;
  return {
    location: window.location,
    addEventListener: (type, listener) => {
      window.addEventListener(type, listener as EventListener);
    },
    removeEventListener: (type, listener) => {
      window.removeEventListener(type, listener as EventListener);
    },
  };
};

const detectNavigationType = (): ClientTelemetryNavigationType => {
  if (typeof performance === 'undefined') return 'unknown';
  const entry = performance.getEntriesByType('navigation')[0] as
    | PerformanceNavigationTiming
    | undefined;
  if (!entry) return 'unknown';
  if (entry.type === 'back_forward') return 'back-forward';
  if (
    entry.type === 'navigate'
    || entry.type === 'reload'
    || entry.type === 'prerender'
  ) {
    return entry.type;
  }
  return 'unknown';
};

const loadDefaultWebVitals = async (): Promise<WebVitalsModule> => {
  const { onCLS, onINP, onLCP } = await import('web-vitals');
  return {
    onCLS: (callback) => onCLS(callback),
    onINP: (callback) => onINP(callback),
    onLCP: (callback) => onLCP(callback),
  };
};

export function createWebVitalTelemetryEvent(
  metric: WebVitalMetric,
  hash: string,
  navigationType: ClientTelemetryNavigationType,
): ClientTelemetryEvent {
  return {
    schemaVersion: CLIENT_TELEMETRY_SCHEMA_VERSION,
    kind: 'web-vital',
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    route: classifyClientTelemetryRoute(hash),
    navigationType,
  };
}

export async function createRuntimeErrorTelemetryEvent(
  name: RuntimeErrorName,
  diagnostic: unknown,
  componentStack: string,
  hash: string,
  navigationType: ClientTelemetryNavigationType,
): Promise<ClientTelemetryEvent & { kind: 'runtime-error' }> {
  const fingerprint = await sha256([
    name,
    describeDiagnostic(diagnostic),
    componentStack,
  ].join('\n'));
  return {
    schemaVersion: CLIENT_TELEMETRY_SCHEMA_VERSION,
    kind: 'runtime-error',
    name,
    fingerprint,
    route: classifyClientTelemetryRoute(hash),
    navigationType,
  };
}

export async function sendClientTelemetryEvent(
  event: ClientTelemetryEvent,
  dependencies: ClientTelemetryDelivery = {},
): Promise<void> {
  const body = JSON.stringify(event);
  const sendBeacon = dependencies.sendBeacon
    ?? (typeof navigator === 'undefined' ? undefined : navigator.sendBeacon?.bind(navigator));
  try {
    if (
      sendBeacon?.(
        TELEMETRY_ENDPOINT,
        new Blob([body], { type: 'application/json' }),
      )
    ) {
      return;
    }
  } catch {
    // Fall through to the bounded fetch attempt.
  }

  const fetcher = dependencies.fetcher ?? globalThis.fetch;
  try {
    await fetcher(TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      credentials: 'omit',
      keepalive: true,
    });
  } catch {
    // Observability must never create recursive application failures.
  }
}

export async function startClientObservability(
  options: StartClientObservabilityOptions = {},
): Promise<() => void> {
  if (activeCleanup) return activeCleanup;
  if (!(options.enabled ?? import.meta.env.PROD)) return () => undefined;

  const target = options.target ?? defaultTarget();
  if (!target) return () => undefined;

  const navigationType = options.navigationType ?? detectNavigationType();
  const deliver = options.deliver ?? sendClientTelemetryEvent;
  const reportedMetricIds = new Set<string>();
  let runtimeErrorCount = 0;
  let active = true;

  const reportRuntimeError = (
    name: RuntimeErrorName,
    diagnostic: unknown,
    componentStack = '',
  ) => {
    if (!active || runtimeErrorCount >= MAX_RUNTIME_ERRORS_PER_PAGE) return;
    runtimeErrorCount += 1;
    void createRuntimeErrorTelemetryEvent(
      name,
      diagnostic,
      componentStack,
      target.location.hash,
      navigationType,
    ).then(deliver).catch(() => undefined);
  };

  const handleWindowError = (event: unknown) => {
    const errorEvent = event as { error?: unknown; message?: string };
    reportRuntimeError('window-error', errorEvent.error ?? errorEvent.message ?? 'unknown');
  };
  const handleUnhandledRejection = (event: unknown) => {
    reportRuntimeError(
      'unhandled-rejection',
      (event as { reason?: unknown }).reason ?? 'unknown',
    );
  };

  target.addEventListener('error', handleWindowError);
  target.addEventListener('unhandledrejection', handleUnhandledRejection);
  activeReactReporter = (error, componentStack) => {
    reportRuntimeError('react-error', error, componentStack);
  };

  const cleanup = () => {
    if (!active) return;
    active = false;
    target.removeEventListener('error', handleWindowError);
    target.removeEventListener('unhandledrejection', handleUnhandledRejection);
    activeReactReporter = null;
    activeCleanup = null;
  };
  activeCleanup = cleanup;

  try {
    const { onCLS, onINP, onLCP } = await (
      options.loadWebVitals ?? loadDefaultWebVitals
    )();
    const reportMetric = (metric: WebVitalMetric) => {
      const metricKey = `${metric.name}:${metric.id}`;
      if (!active || reportedMetricIds.has(metricKey)) return;
      reportedMetricIds.add(metricKey);
      void deliver(createWebVitalTelemetryEvent(
        metric,
        target.location.hash,
        navigationType,
      )).catch(() => undefined);
    };
    onCLS(reportMetric);
    onINP(reportMetric);
    onLCP(reportMetric);
  } catch {
    // Runtime error listeners remain useful when Web Vitals are unsupported.
  }

  return cleanup;
}

export function reportReactError(error: unknown, errorInfo: ErrorInfo): void {
  activeReactReporter?.(error, errorInfo.componentStack ?? '');
}

export function stopClientObservability(): void {
  activeCleanup?.();
}
