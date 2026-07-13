import { describe, expect, it, vi } from 'vitest';
import { adaptWorldCupFixtures } from '../../../../../dataProviders/football/worldCupAdapter';
import { createSampleFixtureResult } from '../../../../../dataProviders/football/fixtureProvider';
import type { MatchPrediction, PreMatchPredictionSnapshot } from '../types';
import {
  buildWorldCupDomainWithMarketLoad,
  buildWorldCupDomainWithMarkets,
  createInitialWorldCupDomainState,
  loadWorldCupDataSource,
  loadWorldCupRefreshSources,
  loadWorldCupStrategyResearch,
  runWorldCupRefreshStages,
} from './useWorldCupDomain';

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

describe('createSampleFixtureResult', () => {
  it('keeps sample fixtures available only as an explicit fallback', () => {
    const result = createSampleFixtureResult();
    const adapterResult = adaptWorldCupFixtures(result);

    expect(result.source).toBe('sample');
    expect(result.providerName).toBe('Sample Fixtures');
    expect(result.fixtures.length).toBeGreaterThan(0);
    expect(result.teams.length).toBeGreaterThan(0);
    expect(result.teamRegistry.resolve('Canada')?.teamId).toBe('canada');
    expect(adapterResult.matches.length).toBeGreaterThan(0);
    expect(Object.keys(adapterResult.teams).length).toBeGreaterThan(0);
  });

  it('starts without a sample domain while the provider chain is loading', () => {
    expect(createInitialWorldCupDomainState()).toEqual({
      domain: null,
      isInitialLoading: true,
    });
  });

  it('injects fetched market references into the shared domain model', () => {
    const adapterResult = adaptWorldCupFixtures(createSampleFixtureResult());
    const matchId = adapterResult.matches[0].id;
    const domain = buildWorldCupDomainWithMarkets(adapterResult, {
      [matchId]: {
        kind: 'real',
        source: 'polymarket',
        probabilities: { home: 0.5, draw: 0.25, away: 0.25 },
        odds: { home: 2, draw: 4, away: 4 },
        status: 'available',
        confidence: 0.7,
        quality: 'high',
        auditable: true,
        lastUpdated: '2026-07-02T06:00:00.000Z',
        message: 'test market',
      },
    });

    expect(domain.markets?.[matchId]).toEqual(expect.objectContaining({
      kind: 'real',
      source: 'polymarket',
      probabilities: { home: 0.5, draw: 0.25, away: 0.25 },
    }));
  });

  it('surfaces market transport errors without dropping fixture data', () => {
    const adapterResult = adaptWorldCupFixtures(createSampleFixtureResult());
    const domain = buildWorldCupDomainWithMarketLoad(adapterResult, {
      markets: {},
      errors: ['Polymarket transport unavailable'],
    });

    expect(domain.matches).toHaveLength(adapterResult.matches.length);
    expect(domain.errors).toContain('Polymarket transport unavailable');
  });

  it('prefers a valid server snapshot over the browser provider chain', async () => {
    const adapterResult = adaptWorldCupFixtures(createSampleFixtureResult());
    const verifiedAdapter = {
      ...adapterResult,
      source: 'openfootball' as const,
      providerName: 'OpenFootball',
      matches: adapterResult.matches.map((match) => ({ ...match, source: 'openfootball' as const })),
    };
    const loadFixtureResult = vi.fn();
    const result = await loadWorldCupDataSource({
      fetchSnapshot: async () => new Response(JSON.stringify({
        schemaVersion: 1,
        generatedAt: '2026-07-02T12:00:00.000Z',
        adapterResult: verifiedAdapter,
        markets: {},
        provenance: {
          delivery: 'server',
          fixture: {
            source: 'openfootball',
            providerName: 'OpenFootball',
            retrievedAt: '2026-07-02T12:00:00.000Z',
          },
          market: {
            source: 'polymarket',
            retrievedAt: '2026-07-02T12:00:00.000Z',
            matchedMatches: 0,
          },
        },
      }), { status: 200 }),
      loadFixtureResult,
    });

    expect(result.delivery).toBe('server');
    expect(result.adapterResult.source).toBe('openfootball');
    expect(loadFixtureResult).not.toHaveBeenCalled();
  });

  it('falls back to the browser provider chain and preserves the server error', async () => {
    const result = await loadWorldCupDataSource({
      fetchSnapshot: async () => new Response('{invalid', { status: 200 }),
      loadFixtureResult: async () => createSampleFixtureResult(),
    });

    expect(result.delivery).toBe('direct');
    expect(result.adapterResult.source).toBe('sample');
    expect(result.adapterResult.errors).toContain(
      'Public data endpoint unavailable or returned an invalid payload.',
    );
    expect(result.adapterResult.errors.join(' ')).not.toContain('Unexpected token');
  });

  it('aborts a slow server snapshot before using the direct provider chain', async () => {
    const fetchSnapshot = vi.fn((_signal: AbortSignal) => new Promise<Response>((_resolve, reject) => {
      _signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));

    const result = await loadWorldCupDataSource({
      fetchSnapshot,
      loadFixtureResult: async () => createSampleFixtureResult(),
      timeoutMs: 5,
    });

    expect(result.delivery).toBe('direct');
    expect(fetchSnapshot.mock.calls[0]?.[0].aborted).toBe(true);
  });

  it('loads a validated chronological strategy research summary', async () => {
    const state = await loadWorldCupStrategyResearch({
      fetchSnapshot: async () => new Response(JSON.stringify({
        schemaVersion: 3,
        generatedAt: '2026-07-02T12:00:00.000Z',
        source: 'martj42-international-results',
        sourceUrl: 'https://raw.githubusercontent.com/martj42/international_results/f73286079f8c6b48a59f8a16e895d757119dca71/results.csv',
        provenance: {
          datasetRevision: 'f73286079f8c6b48a59f8a16e895d757119dca71',
          datasetSha256: `sha256:${'a'.repeat(64)}`,
          researchAlgorithmVersion: 'world-cup-walk-forward-v1',
          modelConfigSha256: `sha256:${'b'.repeat(64)}`,
        },
        audit: { totalRows: 240, acceptedRows: 240, rejectedRows: 0, rejectionReasons: {} },
        report: {
          status: 'applied',
          applied: true,
          reason: 'holdout passed',
          selectedCandidate: { id: 'sharp', eloScale: 320, drawBase: 0.18, drawCloseness: 0.12 },
          baseline: { id: 'baseline', eloScale: 500, drawBase: 0.2, drawCloseness: 0.14 },
          splits: {
            training: { from: '2020-01-01', to: '2020-04-29', sampleSize: 120 },
            validation: { from: '2020-04-30', to: '2020-06-28', sampleSize: 60 },
            holdout: { from: '2020-06-29', to: '2020-08-27', sampleSize: 60 },
          },
          validation: { sampleSize: 60, brierScore: 0.41, logLoss: 0.72, accuracy: 0.7 },
          holdout: {
            sampleSize: 60,
            brierScore: 0.4,
            logLoss: 0.7,
            accuracy: 0.72,
            baselineBrierScore: 0.44,
            brierImprovement: 0.04,
            contexts: 2,
          },
        },
        teamRatings: {
          alpha: {
            teamId: 'alpha',
            teamName: 'Alpha',
            asOf: '2026-07-02T12:00:00.000Z',
            matches: 30,
            elo: 1_720,
            evidenceWeight: 4,
            lastMatchDate: '2026-06-20',
            trustLevel: 'medium',
          },
        },
      }), { status: 200 }),
    });

    expect(state).toMatchObject({
      status: 'applied',
      acceptedRows: 240,
      candidateId: 'sharp',
      holdoutSampleSize: 60,
      brierImprovement: 0.04,
      teamRatings: {
        alpha: expect.objectContaining({ elo: 1_720 }),
      },
    });
  });

  it('keeps the baseline explicit when strategy research is unavailable', async () => {
    const state = await loadWorldCupStrategyResearch({
      fetchSnapshot: async () => new Response('unavailable', { status: 502 }),
    });

    expect(state.status).toBe('unavailable');
    expect(state.candidateId).toBeNull();
    expect(state.message).toContain('基线模型');
  });

  it('loads required refresh sources concurrently without awaiting deferred cloud snapshots', async () => {
    const adapterResult = adaptWorldCupFixtures(createSampleFixtureResult());
    const dataSource = {
      adapterResult,
      markets: {},
      delivery: 'direct' as const,
    };
    const strategyResearch = {
      status: 'unavailable' as const,
      generatedAt: null,
      acceptedRows: 0,
      candidateId: null,
      validationSampleSize: 0,
      holdoutSampleSize: 0,
      holdoutContexts: 0,
      brierImprovement: 0,
      message: '基线模型',
    };
    const deferredDataSource = createDeferred<typeof dataSource>();
    const deferredStrategyResearch = createDeferred<typeof strategyResearch>();
    const deferredSharedSnapshots = createDeferred<Record<string, never> | null>();
    const loadDataSource = vi.fn(() => deferredDataSource.promise);
    const loadStrategyResearch = vi.fn(() => deferredStrategyResearch.promise);
    const loadSharedSnapshots = vi.fn(() => deferredSharedSnapshots.promise);

    const pendingLoad = loadWorldCupRefreshSources({
      loadDataSource,
      loadStrategyResearch,
      loadSharedSnapshots,
    });

    expect(loadDataSource).toHaveBeenCalledOnce();
    expect(loadStrategyResearch).toHaveBeenCalledOnce();
    expect(loadSharedSnapshots).toHaveBeenCalledOnce();

    deferredDataSource.resolve(dataSource);
    deferredStrategyResearch.resolve(strategyResearch);

    const result = await pendingLoad;
    expect(result).toEqual({
      dataSource,
      strategyResearch,
      sharedSnapshots: deferredSharedSnapshots.promise,
    });

    const snapshots = {};
    deferredSharedSnapshots.resolve(snapshots);
    await expect(result.sharedSnapshots).resolves.toBe(snapshots);
  });

  it('publishes required sources before merging a later, earlier-captured cloud snapshot', async () => {
    const adapterResult = adaptWorldCupFixtures(createSampleFixtureResult());
    const dataSource = {
      adapterResult,
      markets: {},
      delivery: 'direct' as const,
    };
    const strategyResearch = {
      status: 'unavailable' as const,
      generatedAt: null,
      acceptedRows: 0,
      candidateId: null,
      validationSampleSize: 0,
      holdoutSampleSize: 0,
      holdoutContexts: 0,
      brierImprovement: 0,
      message: '基线模型',
    };
    const localSnapshot: PreMatchPredictionSnapshot = {
      matchId: 'match-80',
      homeTeamId: 'england',
      awayTeamId: 'dr-congo',
      kickoff: '2026-07-01T16:00:00.000Z',
      capturedAt: '2026-07-01T15:59:30.000Z',
      prediction: { matchId: 'match-80' } as MatchPrediction,
    };
    const cloudSnapshot = {
      ...localSnapshot,
      capturedAt: '2026-07-01T15:58:00.000Z',
    };
    const localSnapshots = { [localSnapshot.matchId]: localSnapshot };
    const deferredDataSource = createDeferred<typeof dataSource>();
    const deferredStrategyResearch = createDeferred<typeof strategyResearch>();
    const deferredSharedSnapshots = createDeferred<Record<string, PreMatchPredictionSnapshot> | null>();
    const loadDataSource = vi.fn(() => deferredDataSource.promise);
    const loadStrategyResearch = vi.fn(() => deferredStrategyResearch.promise);
    const loadSharedSnapshots = vi.fn(() => deferredSharedSnapshots.promise);
    const publishRequired = vi.fn(() => ({
      snapshots: localSnapshots,
      context: 'initial-domain' as const,
    }));
    const persistMerged = vi.fn();
    const publishMerged = vi.fn();

    const pendingRefresh = runWorldCupRefreshStages(
      { loadDataSource, loadStrategyResearch, loadSharedSnapshots },
      { publishRequired, persistMerged, publishMerged },
    );

    expect(loadDataSource).toHaveBeenCalledOnce();
    expect(loadStrategyResearch).toHaveBeenCalledOnce();
    expect(loadSharedSnapshots).toHaveBeenCalledOnce();

    deferredDataSource.resolve(dataSource);
    deferredStrategyResearch.resolve(strategyResearch);
    await vi.waitFor(() => expect(publishRequired).toHaveBeenCalledWith({
      dataSource,
      strategyResearch,
    }));
    expect(publishMerged).not.toHaveBeenCalled();

    deferredSharedSnapshots.resolve({ [cloudSnapshot.matchId]: cloudSnapshot });
    await pendingRefresh;

    expect(persistMerged).toHaveBeenCalledOnce();
    expect(persistMerged).toHaveBeenCalledWith({
      [cloudSnapshot.matchId]: cloudSnapshot,
    });
    expect(publishMerged).toHaveBeenCalledOnce();
    expect(publishMerged).toHaveBeenCalledWith({
      snapshots: { [cloudSnapshot.matchId]: cloudSnapshot },
      context: 'initial-domain',
    });
  });

  it('does not republish when cloud snapshots do not change the required result', async () => {
    const adapterResult = adaptWorldCupFixtures(createSampleFixtureResult());
    const dataSource = {
      adapterResult,
      markets: {},
      delivery: 'direct' as const,
    };
    const strategyResearch = {
      status: 'unavailable' as const,
      generatedAt: null,
      acceptedRows: 0,
      candidateId: null,
      validationSampleSize: 0,
      holdoutSampleSize: 0,
      holdoutContexts: 0,
      brierImprovement: 0,
      message: '基线模型',
    };
    const localSnapshot: PreMatchPredictionSnapshot = {
      matchId: 'match-80',
      homeTeamId: 'england',
      awayTeamId: 'dr-congo',
      kickoff: '2026-07-01T16:00:00.000Z',
      capturedAt: '2026-07-01T15:58:00.000Z',
      prediction: { matchId: 'match-80' } as MatchPrediction,
    };
    const localSnapshots = { [localSnapshot.matchId]: localSnapshot };
    const publishRequired = vi.fn(() => ({
      snapshots: localSnapshots,
      context: 'initial-domain' as const,
    }));
    const persistMerged = vi.fn();
    const publishMerged = vi.fn();

    await runWorldCupRefreshStages(
      {
        loadDataSource: async () => dataSource,
        loadStrategyResearch: async () => strategyResearch,
        loadSharedSnapshots: async () => localSnapshots,
      },
      { publishRequired, persistMerged, publishMerged },
    );

    expect(publishRequired).toHaveBeenCalledOnce();
    expect(persistMerged).not.toHaveBeenCalled();
    expect(publishMerged).not.toHaveBeenCalled();
  });
});
