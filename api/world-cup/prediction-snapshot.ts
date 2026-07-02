import { handlePredictionSnapshotRequest } from '../../src/server/worldCup/predictionSnapshotEndpoint';

export default {
  fetch(request: Request) {
    return handlePredictionSnapshotRequest(request, {
      cronSecret: process.env.CRON_SECRET ?? process.env.WORLD_CUP_CRON_SECRET ?? '',
      supabaseUrl: process.env.SUPABASE_URL ?? '',
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    });
  },
};
