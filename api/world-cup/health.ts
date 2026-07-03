import { handleWorldCupHealthRequest } from '../../src/server/worldCup/healthEndpoint';

export default {
  fetch(request: Request) {
    return handleWorldCupHealthRequest(request, {
      supabaseUrl: process.env.SUPABASE_URL ?? '',
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    });
  },
};
