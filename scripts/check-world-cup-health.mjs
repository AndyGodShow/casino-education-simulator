import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function validateWorldCupHealth(responseStatus, body) {
  const snapshotJob = body?.checks?.snapshotJob;
  if (
    responseStatus < 200
    || responseStatus >= 300
    || body?.schemaVersion !== 1
    || body?.status !== 'healthy'
    || body?.checks?.configuration?.status !== 'pass'
    || snapshotJob?.status !== 'pass'
    || typeof snapshotJob?.lastCheckedAt !== 'string'
  ) {
    throw new Error(
      `World Cup deployment is unhealthy (HTTP ${responseStatus}, status ${String(body?.status)}).`,
    );
  }
  return snapshotJob.lastCheckedAt;
}

export async function checkWorldCupHealth(healthUrl, fetcher = fetch) {
  if (!healthUrl) {
    throw new Error(
      'Provide an HTTPS health URL as the first argument or PRODUCTION_HEALTH_URL.',
    );
  }

  const parsedUrl = new URL(healthUrl);
  if (parsedUrl.protocol !== 'https:') {
    throw new Error('Production health checks require an HTTPS URL.');
  }

  const response = await fetcher(parsedUrl, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });

  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`Health endpoint returned non-JSON content (HTTP ${response.status}).`);
  }

  return validateWorldCupHealth(response.status, body);
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  const healthUrl = process.argv[2] ?? process.env.PRODUCTION_HEALTH_URL;
  const lastCheckedAt = await checkWorldCupHealth(healthUrl);
  console.log(
    `World Cup deployment healthy; snapshot job checked at ${lastCheckedAt}.`,
  );
}
