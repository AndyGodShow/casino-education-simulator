import { handlePublicWorldCupDataRequest } from '../../src/server/worldCup/publicDataEndpoint';

export default {
  fetch(request: Request) {
    return handlePublicWorldCupDataRequest(request);
  },
};

