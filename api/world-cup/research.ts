import { handleWorldCupStrategyResearchRequest } from '../../src/server/worldCup/strategyResearchEndpoint';

export default {
  fetch(request: Request) {
    return handleWorldCupStrategyResearchRequest(request);
  },
};
