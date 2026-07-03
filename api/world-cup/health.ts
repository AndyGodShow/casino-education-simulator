import { handleWorldCupHealthRequest } from '../../src/server/worldCup/healthEndpoint';

export default {
  fetch(request: Request) {
    return handleWorldCupHealthRequest(request, {
      supabaseUrl: process.env.SUPABASE_URL ?? '',
      publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY
        ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY
        ?? '',
    });
  },
};
