alter table public.world_cup_prediction_snapshots
  add column if not exists provenance jsonb;

alter table public.world_cup_prediction_snapshots
  add constraint prediction_snapshot_provenance_shape
  check (
    provenance is null
    or (
      jsonb_typeof(provenance) = 'object'
      and provenance ?& array[
        'schemaVersion',
        'applicationRevision',
        'modelVersion',
        'researchGeneratedAt',
        'candidateId',
        'datasetRevision',
        'datasetSha256',
        'modelConfigSha256'
      ]
      and provenance - array[
        'schemaVersion',
        'applicationRevision',
        'modelVersion',
        'researchGeneratedAt',
        'candidateId',
        'datasetRevision',
        'datasetSha256',
        'modelConfigSha256'
      ] = '{}'::jsonb
      and provenance -> 'schemaVersion' = '1'::jsonb
      and jsonb_typeof(provenance -> 'applicationRevision') = 'string'
      and (
        provenance ->> 'applicationRevision' = 'local'
        or provenance ->> 'applicationRevision' ~ '^[a-f0-9]{40}$'
      )
      and provenance ->> 'modelVersion' = 'v2'
      and (
        (
          provenance -> 'researchGeneratedAt' = 'null'::jsonb
          and provenance -> 'candidateId' = 'null'::jsonb
          and provenance -> 'datasetRevision' = 'null'::jsonb
          and provenance -> 'datasetSha256' = 'null'::jsonb
          and provenance -> 'modelConfigSha256' = 'null'::jsonb
        )
        or (
          jsonb_typeof(provenance -> 'researchGeneratedAt') = 'string'
          and (provenance ->> 'researchGeneratedAt')::timestamptz is not null
          and jsonb_typeof(provenance -> 'candidateId') = 'string'
          and length(provenance ->> 'candidateId') > 0
          and jsonb_typeof(provenance -> 'datasetRevision') = 'string'
          and provenance ->> 'datasetRevision' ~ '^[a-f0-9]{40}$'
          and provenance ->> 'datasetSha256' ~ '^sha256:[a-f0-9]{64}$'
          and provenance ->> 'modelConfigSha256' ~ '^sha256:[a-f0-9]{64}$'
        )
      )
    )
  );
