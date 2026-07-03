export const CLIENT_TELEMETRY_SCHEMA_VERSION = 1 as const;

export type ClientTelemetryRoute =
  | 'main'
  | 'traditional'
  | 'sports'
  | 'football'
  | 'world-cup'
  | 'game'
  | 'unknown';

export type ClientTelemetryNavigationType =
  | 'navigate'
  | 'reload'
  | 'back-forward'
  | 'prerender'
  | 'unknown';

export type ClientTelemetryEvent =
  | {
    schemaVersion: typeof CLIENT_TELEMETRY_SCHEMA_VERSION;
    kind: 'web-vital';
    name: 'CLS' | 'INP' | 'LCP';
    value: number;
    rating: 'good' | 'needs-improvement' | 'poor';
    route: ClientTelemetryRoute;
    navigationType: ClientTelemetryNavigationType;
  }
  | {
    schemaVersion: typeof CLIENT_TELEMETRY_SCHEMA_VERSION;
    kind: 'runtime-error';
    name: 'window-error' | 'unhandled-rejection' | 'react-error';
    fingerprint: string;
    route: ClientTelemetryRoute;
    navigationType: ClientTelemetryNavigationType;
  };

const WEB_VITAL_NAMES = new Set(['CLS', 'INP', 'LCP']);
const WEB_VITAL_RATINGS = new Set(['good', 'needs-improvement', 'poor']);
const RUNTIME_ERROR_NAMES = new Set(['window-error', 'unhandled-rejection', 'react-error']);
const ROUTES = new Set([
  'main',
  'traditional',
  'sports',
  'football',
  'world-cup',
  'game',
  'unknown',
]);
const NAVIGATION_TYPES = new Set([
  'navigate',
  'reload',
  'back-forward',
  'prerender',
  'unknown',
]);
const SHA_256_HEX = /^[0-9a-f]{64}$/;
const MAX_CLS_VALUE = 100;
const MAX_DURATION_VALUE_MS = 60 * 60 * 1_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length
  && keys.every((key) => Object.hasOwn(value, key));

const isSetMember = <T extends string>(value: unknown, values: Set<string>): value is T =>
  typeof value === 'string' && values.has(value);

const isBoundedWebVitalValue = (
  name: 'CLS' | 'INP' | 'LCP',
  value: number,
) => value <= (name === 'CLS' ? MAX_CLS_VALUE : MAX_DURATION_VALUE_MS);

export function parseClientTelemetryEvent(value: unknown): ClientTelemetryEvent | null {
  if (
    !isRecord(value)
    || value.schemaVersion !== CLIENT_TELEMETRY_SCHEMA_VERSION
    || !isSetMember<ClientTelemetryRoute>(value.route, ROUTES)
    || !isSetMember<ClientTelemetryNavigationType>(value.navigationType, NAVIGATION_TYPES)
  ) {
    return null;
  }

  if (
    value.kind === 'web-vital'
    && hasExactKeys(value, [
      'schemaVersion',
      'kind',
      'name',
      'value',
      'rating',
      'route',
      'navigationType',
    ])
    && isSetMember<'CLS' | 'INP' | 'LCP'>(value.name, WEB_VITAL_NAMES)
    && typeof value.value === 'number'
    && Number.isFinite(value.value)
    && value.value >= 0
    && isBoundedWebVitalValue(value.name, value.value)
    && isSetMember<'good' | 'needs-improvement' | 'poor'>(
      value.rating,
      WEB_VITAL_RATINGS,
    )
  ) {
    return {
      schemaVersion: CLIENT_TELEMETRY_SCHEMA_VERSION,
      kind: 'web-vital',
      name: value.name,
      value: value.value,
      rating: value.rating,
      route: value.route,
      navigationType: value.navigationType,
    };
  }

  if (
    value.kind === 'runtime-error'
    && hasExactKeys(value, [
      'schemaVersion',
      'kind',
      'name',
      'fingerprint',
      'route',
      'navigationType',
    ])
    && isSetMember<'window-error' | 'unhandled-rejection' | 'react-error'>(
      value.name,
      RUNTIME_ERROR_NAMES,
    )
    && typeof value.fingerprint === 'string'
    && SHA_256_HEX.test(value.fingerprint)
  ) {
    return {
      schemaVersion: CLIENT_TELEMETRY_SCHEMA_VERSION,
      kind: 'runtime-error',
      name: value.name,
      fingerprint: value.fingerprint,
      route: value.route,
      navigationType: value.navigationType,
    };
  }

  return null;
}

export function classifyClientTelemetryRoute(hash: string): ClientTelemetryRoute {
  const route = hash.trim().replace(/^#\/?/, '').replace(/\/+$/, '');
  if (!route || route === 'lobby') return 'main';
  if (route === 'traditional') return 'traditional';
  if (route.startsWith('traditional/games/') || route.startsWith('games/')) return 'game';
  if (route === 'sports') return 'sports';
  if (route === 'sports/football') return 'football';
  if (route === 'sports/football/world-cup-2026') return 'world-cup';
  return 'unknown';
}
