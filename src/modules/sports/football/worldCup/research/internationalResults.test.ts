import { describe, expect, it } from 'vitest';
import { parseInternationalResultsCsv } from './internationalResults';

const header = 'date,home_team,away_team,home_score,away_score,tournament,city,country,neutral';

describe('parseInternationalResultsCsv', () => {
  it('parses audited CC0 international results before the evaluation time', () => {
    const result = parseInternationalResultsCsv([
      header,
      '2022-11-20,Qatar,Ecuador,0,2,FIFA World Cup,Al Khor,Qatar,TRUE',
      '2022-11-21,England,Iran,6,2,FIFA World Cup,Doha,Qatar,TRUE',
    ].join('\n'), {
      evaluationTimeMs: Date.parse('2022-11-22T00:00:00.000Z'),
      retrievedAt: '2026-07-02T12:00:00.000Z',
    });

    expect(result.audit).toEqual({
      totalRows: 2,
      acceptedRows: 2,
      rejectedRows: 0,
      rejectionReasons: {},
    });
    expect(result.results[0]).toMatchObject({
      id: '2022-11-20:qatar:ecuador:fifa-world-cup',
      homeTeam: 'Qatar',
      awayTeam: 'Ecuador',
      homeScore: 0,
      awayScore: 2,
      neutral: true,
      source: 'martj42-international-results',
      retrievedAt: '2026-07-02T12:00:00.000Z',
    });
  });

  it('supports quoted CSV fields containing commas and escaped quotes', () => {
    const result = parseInternationalResultsCsv([
      header,
      '2022-12-18,Argentina,France,3,3,FIFA World Cup,"Lusail, Doha","Qatar ""Host""",TRUE',
    ].join('\n'), {
      evaluationTimeMs: Date.parse('2023-01-01T00:00:00.000Z'),
      retrievedAt: '2026-07-02T12:00:00.000Z',
    });

    expect(result.results[0]?.city).toBe('Lusail, Doha');
    expect(result.results[0]?.country).toBe('Qatar "Host"');
  });

  it('rejects malformed scores, duplicate matches, and future rows deterministically', () => {
    const result = parseInternationalResultsCsv([
      header,
      '2022-11-20,Qatar,Ecuador,0,2,FIFA World Cup,Al Khor,Qatar,TRUE',
      '2022-11-20,Qatar,Ecuador,0,2,FIFA World Cup,Al Khor,Qatar,TRUE',
      '2022-11-21,England,Iran,x,2,FIFA World Cup,Doha,Qatar,TRUE',
      '2026-07-03,Spain,Brazil,1,0,Friendly,Madrid,Spain,FALSE',
    ].join('\n'), {
      evaluationTimeMs: Date.parse('2026-07-02T12:00:00.000Z'),
      retrievedAt: '2026-07-02T12:00:00.000Z',
    });

    expect(result.results).toHaveLength(1);
    expect(result.audit.rejectionReasons).toEqual({
      duplicate: 1,
      invalid_score: 1,
      future_or_same_day: 1,
    });
  });

  it('blocks files without the required schema', () => {
    const result = parseInternationalResultsCsv('foo,bar\n1,2', {
      evaluationTimeMs: Date.parse('2026-07-02T12:00:00.000Z'),
      retrievedAt: '2026-07-02T12:00:00.000Z',
    });

    expect(result.results).toEqual([]);
    expect(result.audit.rejectionReasons).toEqual({ missing_header: 1 });
  });
});
