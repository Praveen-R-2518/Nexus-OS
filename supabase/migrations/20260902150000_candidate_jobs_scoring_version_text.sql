-- Wave 1 D3 — scoring_version is a code string (D2 SCORING_VERSION), not an int.
alter table public.candidate_jobs
  alter column scoring_version type text
  using (
    case
      when scoring_version is null then null
      else scoring_version::text
    end
  );

comment on column public.candidate_jobs.scoring_version is
  'D2 SCORING_VERSION string (e.g. people.match.v1). Null until scored.';
