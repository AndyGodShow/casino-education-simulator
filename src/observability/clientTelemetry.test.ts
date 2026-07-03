import { describe, expect, it } from 'vitest';
import {
  classifyClientTelemetryRoute,
  parseClientTelemetryEvent,
} from './clientTelemetry';

const metricEvent = {
  schemaVersion: 1,
  kind: 'web-vital',
  name: 'LCP',
  value: 1_250.5,
  rating: 'good',
  route: 'world-cup',
  navigationType: 'navigate',
};

const errorEvent = {
  schemaVersion: 1,
  kind: 'runtime-error',
  name: 'window-error',
  fingerprint: 'a'.repeat(64),
  route: 'world-cup',
  navigationType: 'reload',
};

describe('parseClientTelemetryEvent', () => {
  it('accepts a bounded Core Web Vital event', () => {
    expect(parseClientTelemetryEvent(metricEvent)).toEqual(metricEvent);
  });

  it('accepts a fingerprint-only runtime error event', () => {
    expect(parseClientTelemetryEvent(errorEvent)).toEqual(errorEvent);
  });

  it.each([
    { ...metricEvent, name: 'FCP' },
    { ...metricEvent, value: -1 },
    { ...metricEvent, value: Number.POSITIVE_INFINITY },
    { ...metricEvent, name: 'CLS', value: 100.01 },
    { ...metricEvent, name: 'INP', value: 3_600_000.01 },
    { ...metricEvent, name: 'LCP', value: 3_600_000.01 },
    { ...metricEvent, rating: 'fast' },
    { ...metricEvent, fingerprint: 'b'.repeat(64) },
    { ...errorEvent, name: 'network-error' },
    { ...errorEvent, fingerprint: 'not-a-sha256' },
    { ...errorEvent, value: 12 },
    { ...errorEvent, message: 'private diagnostic text' },
    { ...errorEvent, stack: 'private stack text' },
    { ...errorEvent, route: '#/sports/football/world-cup-2026?email=user@example.com' },
    { ...errorEvent, navigationType: 'restore' },
    { ...errorEvent, schemaVersion: 2 },
  ])('rejects invalid or privacy-expanding payload %#', (payload) => {
    expect(parseClientTelemetryEvent(payload)).toBeNull();
  });

  it.each([null, [], 'event', 1])('rejects non-record payload %#', (payload) => {
    expect(parseClientTelemetryEvent(payload)).toBeNull();
  });
});

describe('classifyClientTelemetryRoute', () => {
  it.each([
    ['', 'main'],
    ['#/', 'main'],
    ['#/lobby', 'main'],
    ['#/traditional', 'traditional'],
    ['#/traditional/games/baccarat', 'game'],
    ['#/games/roulette', 'game'],
    ['#/sports', 'sports'],
    ['#/sports/football', 'football'],
    ['#/sports/football/world-cup-2026', 'world-cup'],
    ['#/sports/football/world-cup-2026?token=secret', 'unknown'],
    ['#/unexpected', 'unknown'],
  ])('classifies %s as %s', (hash, expected) => {
    expect(classifyClientTelemetryRoute(hash)).toBe(expected);
  });
});
