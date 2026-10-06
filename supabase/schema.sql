-- Block A Notes: one page per person, opened with a name and a PIN.
-- Nothing is reachable directly: the tables have row level security and no
-- policies, and the page talks only to the functions below, each of which
-- first checks the group code from the invitation link.

create extension if not exists pgcrypto with schema extensions;

create table public.settings (
  id int primary key default 1 check (id = 1),
  group_hash text not null              -- sha256 of the group code in the invitation link
);

create table public.pages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  name_key text generated always as (lower(btrim(name))) stored unique,
  pin_hash text not null,               -- bcrypt
  body text not null default '' check (char_length(body) <= 500000),
  files jsonb not null default '[]'::jsonb check (jsonb_typeof(files) = 'array'),
  updated timestamptz,
  created timestamptz not null default now(),
  failed int not null default 0,
  locked_until timestamptz
);

create table public.tokens (
  token_hash text primary key,          -- sha256 of the token kept in the person's browser
  page_id uuid not null references public.pages(id) on delete cascade,
  created timestamptz not null default now()
);

alter table public.settings enable row level security;
alter table public.pages enable row level security;
alter table public.tokens enable row level security;
revoke all on public.settings, public.pages, public.tokens from anon, authenticated;

-- ---------- helpers (not callable from the page) ----------

create function public._group_ok(g text) returns boolean
language sql stable security definer set search_path = '' as $$
  select g is not null and exists (
    select 1 from public.settings
    where group_hash = encode(extensions.digest(g, 'sha256'), 'hex'));
$$;

create function public._page_for(p_token text) returns uuid
language sql stable security definer set search_path = '' as $$
  select page_id from public.tokens
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

-- used by the storage policy: uploads only go into an existing page's folder
create function public.page_exists(p text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.pages where id::text = p);
$$;

revoke execute on function public._group_ok(text), public._page_for(text) from public, anon, authenticated;
revoke execute on function public.page_exists(text) from public;
grant execute on function public.page_exists(text) to anon, authenticated;

-- ---------- what the page calls ----------

-- Open your page: a new name creates a page with that PIN; a known name needs its PIN.
-- Eight wrong PINs in a row lock that page for 15 minutes.
create function public.open_page(g text, p_name text, p_pin text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  r public.pages;
  pid uuid;
  is_new boolean := false;
  tok text;
begin
  if not public._group_ok(g) then return json_build_object('error', 'bad_group'); end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 40 then return json_build_object('error', 'bad_name'); end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,8}$' then return json_build_object('error', 'bad_pin'); end if;

  select * into r from public.pages where name_key = lower(btrim(p_name)) for update;
  if not found then
    insert into public.pages (name, pin_hash)
    values (btrim(p_name), extensions.crypt(p_pin, extensions.gen_salt('bf', 8)))
    returning id into pid;
    is_new := true;
  else
    if r.locked_until is not null and r.locked_until > now() then
      return json_build_object('error', 'locked', 'until', r.locked_until);
    end if;
    if r.pin_hash <> extensions.crypt(p_pin, r.pin_hash) then
      update public.pages
         set failed = r.failed + 1,
             locked_until = case when r.failed + 1 >= 8 then now() + interval '15 minutes' else null end
       where id = r.id;
      return json_build_object('error', 'wrong_pin');
    end if;
    update public.pages set failed = 0, locked_until = null where id = r.id;
    pid := r.id;
  end if;

  tok := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.tokens (token_hash, page_id) values (encode(extensions.digest(tok, 'sha256'), 'hex'), pid);
  return json_build_object('id', pid, 'token', tok, 'name', (select name from public.pages where id = pid), 'created', is_new);
end $$;

-- Everyone's pages, newest first. Never returns PINs or tokens.
create function public.list_pages(g text) returns json
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public._group_ok(g) then return json_build_object('error', 'bad_group'); end if;
  return coalesce((
    select json_agg(json_build_object('id', id, 'name', name, 'body', body, 'files', files, 'updated', updated)
                    order by updated desc nulls last, created)
    from public.pages), '[]'::json);
end $$;

-- Save your own page. The token proves it is yours.
create function public.save_page(g text, p_token text, p_body text, p_files jsonb) returns json
language plpgsql security definer set search_path = '' as $$
declare
  pid uuid;
  t timestamptz := now();
begin
  if not public._group_ok(g) then return json_build_object('error', 'bad_group'); end if;
  pid := public._page_for(p_token);
  if pid is null then return json_build_object('error', 'signed_out'); end if;
  if p_body is null or char_length(p_body) > 500000 then return json_build_object('error', 'too_long'); end if;
  if p_files is null or jsonb_typeof(p_files) <> 'array' or jsonb_array_length(p_files) > 500 then
    return json_build_object('error', 'bad_files');
  end if;
  update public.pages set body = p_body, files = p_files, updated = t where id = pid;
  return json_build_object('updated', t);
end $$;

-- Check a saved token still works (on opening the page).
create function public.whoami(g text, p_token text) returns json
language plpgsql stable security definer set search_path = '' as $$
declare pid uuid;
begin
  if not public._group_ok(g) then return json_build_object('error', 'bad_group'); end if;
  pid := public._page_for(p_token);
  if pid is null then return json_build_object('error', 'signed_out'); end if;
  return json_build_object('id', pid, 'name', (select name from public.pages where id = pid));
end $$;

-- Sign out on this device.
create function public.leave_page(g text, p_token text) returns json
language plpgsql security definer set search_path = '' as $$
begin
  if not public._group_ok(g) then return json_build_object('error', 'bad_group'); end if;
  delete from public.tokens where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  return json_build_object('ok', true);
end $$;

revoke execute on function public.open_page(text, text, text), public.list_pages(text),
  public.save_page(text, text, text, jsonb), public.whoami(text, text), public.leave_page(text, text) from public;
grant execute on function public.open_page(text, text, text), public.list_pages(text),
  public.save_page(text, text, text, jsonb), public.whoami(text, text), public.leave_page(text, text) to anon, authenticated;

-- ---------- files ----------
-- A public bucket: a file opens by its address, which contains two random ids.
-- Uploads go only into an existing page's folder; nobody can list, change or delete
-- through the API. Up to 50 MB a file, any type (Word and PowerPoint included).
insert into storage.buckets (id, name, public, file_size_limit)
values ('files', 'files', true, 52428800)
on conflict (id) do update set public = true, file_size_limit = 52428800;

create policy "upload into an existing page folder"
on storage.objects for insert to anon, authenticated
with check (bucket_id = 'files' and public.page_exists((storage.foldername(name))[1]));
