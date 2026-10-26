-- Practice tab: open answers that people choose to share with the group.
-- One answer per person per question part. Same rules as the notes: the table has row level
-- security and no policies; the page only calls the two functions below, which check the
-- group code, and sharing needs the token from opening your own page.

create table public.shared_answers (
  page_id uuid not null references public.pages(id) on delete cascade,
  qkey text not null check (qkey ~ '^[a-z0-9-]{1,24}:[0-9]{1,3}[a-z]$'),   -- exam id : question + part, e.g. demo:18a
  body text not null check (char_length(body) between 1 and 20000),
  updated timestamptz not null default now(),
  primary key (page_id, qkey)
);
alter table public.shared_answers enable row level security;
revoke all on public.shared_answers from anon, authenticated;

-- Share, update or (with an empty body) stop sharing your answer to one part.
create function public.share_answer(g text, p_token text, p_qkey text, p_body text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  pid uuid;
  t timestamptz := now();
begin
  if not public._group_ok(g) then return json_build_object('error', 'bad_group'); end if;
  pid := public._page_for(p_token);
  if pid is null then return json_build_object('error', 'signed_out'); end if;
  if p_qkey is null or p_qkey !~ '^[a-z0-9-]{1,24}:[0-9]{1,3}[a-z]$' then return json_build_object('error', 'bad_key'); end if;
  if p_body is null or char_length(btrim(p_body)) = 0 then
    delete from public.shared_answers where page_id = pid and qkey = p_qkey;
    return json_build_object('removed', true);
  end if;
  if char_length(p_body) > 20000 then return json_build_object('error', 'too_long'); end if;
  insert into public.shared_answers (page_id, qkey, body, updated) values (pid, p_qkey, p_body, t)
  on conflict (page_id, qkey) do update set body = excluded.body, updated = excluded.updated;
  return json_build_object('updated', t);
end $$;

-- Everyone's shared answers for one exam, newest first. Never returns PINs or tokens.
create function public.list_answers(g text, p_exam text) returns json
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public._group_ok(g) then return json_build_object('error', 'bad_group'); end if;
  return coalesce((
    select json_agg(json_build_object('qkey', a.qkey, 'page', a.page_id, 'name', p.name, 'body', a.body, 'updated', a.updated)
                    order by a.updated desc)
    from public.shared_answers a join public.pages p on p.id = a.page_id
    where split_part(a.qkey, ':', 1) = p_exam), '[]'::json);
end $$;

revoke execute on function public.share_answer(text, text, text, text), public.list_answers(text, text) from public;
grant execute on function public.share_answer(text, text, text, text), public.list_answers(text, text) to anon, authenticated;
