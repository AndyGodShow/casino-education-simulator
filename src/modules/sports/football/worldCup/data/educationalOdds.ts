import { createDataTrustInfo, type DataTrustInfo } from '../../../../core/trustLayer/dataTruth';
import type { ThreeWayOdds } from '../logic/oddsEngine';

const educationalOdds = {
  home: 1.8,
  draw: 3.5,
  away: 4.5,
} satisfies ThreeWayOdds;

export type TrustedOdds = {
  odds: ThreeWayOdds;
  truth: DataTrustInfo;
};

export const trustedEducationalOdds: TrustedOdds = {
  odds: educationalOdds,
  truth: createDataTrustInfo('sample', 'Static education odds; not a sportsbook or live market feed.', ['educationalOdds.ts']),
};
