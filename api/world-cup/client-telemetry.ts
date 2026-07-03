import { handleClientTelemetryRequest } from '../../src/server/worldCup/clientTelemetryEndpoint';

export default {
  fetch(request: Request) {
    return handleClientTelemetryRequest(request, {
      supabaseUrl: process.env.SUPABASE_URL ?? '',
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    });
  },
};
