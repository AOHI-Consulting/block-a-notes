-- Learning progress: what each person knows and the days they practised, so it follows them from
-- phone to laptop. One row per person per key: 'mem:days' (reviews per day), 'mem:<course>'
-- (per item: stability, difficulty, last review, last grade) and 'mem:notes-<course>' (your own
-- notes on topics and frameworks, per item: text, last edit). Private: only the token from opening
-- your own page reads or writes your rows, and nothing lists anyone else's. Same rules as the rest:
-- row level security with no policies, and the page only calls the two functions below, which check
-- the group code. Run once in the Supabase SQL editor, after schema.sql.

create table public.progress (
  page_id uuid not null references public.pages(id) on delete cascade,
  pkey text not null check (pkey ~ '^mem:[a-z0-9-]{1,30}$'),
  body jsonb not null check (jsonb_typeof(body) = 'object'),
  updated timestamptz not null default now(),
  primary key (page_id, pkey)
);
alter table public.progress enable row level security;
revoke all on public.progress from anon, authenticated;

-- All your progress rows. The token proves it is you.
create function public.get_progress(g text, p_token text) returns json
language plpgsql stable security definer set search_path = '' as $$
declare pid uuid;
begin
  if not public._group_ok(g) then return json_build_object('error', 'bad_group'); end if;
  pid := public._page_for(p_token);
  if pid is null then return json_build_object('error', 'signed_out'); end if;
  return json_build_object('rows', coalesce((
    select json_object_agg(pkey, json_build_object('body', body, 'updated', updated))
    from public.progress where page_id = pid), '{}'::json));
end $$;

-- Save one of your progress rows (the page merges with the saved copy first, so nothing is lost).
create function public.save_progress(g text, p_token text, p_key text, p_body jsonb) returns json
language plpgsql security definer set search_path = '' as $$
declare
  pid uuid;
  t timestamptz := now();
begin
  if not public._group_ok(g) then return json_build_object('error', 'bad_group'); end if;
  pid := public._page_for(p_token);
  if pid is null then return json_build_object('error', 'signed_out'); end if;
  if p_key is null or p_key !~ '^mem:[a-z0-9-]{1,30}$' then return json_build_object('error', 'bad_key'); end if;
  if p_body is null or jsonb_typeof(p_body) <> 'object' or octet_length(p_body::text) > 300000 then
    return json_build_object('error', 'too_big');
  end if;
  if (select count(*) from public.progress where page_id = pid and pkey <> p_key) >= 40 then
    return json_build_object('error', 'too_many');
  end if;
  insert into public.progress (page_id, pkey, body, updated) values (pid, p_key, p_body, t)
  on conflict (page_id, pkey) do update set body = excluded.body, updated = excluded.updated;
  return json_build_object('updated', t);
end $$;

revoke execute on function public.get_progress(text, text), public.save_progress(text, text, text, jsonb) from public;
grant execute on function public.get_progress(text, text), public.save_progress(text, text, text, jsonb) to anon, authenticated;
