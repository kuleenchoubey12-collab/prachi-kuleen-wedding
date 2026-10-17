begin;
create schema if not exists wedding_private;
revoke all on schema wedding_private from public, anon, authenticated;

create table wedding_private.guests (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(name) between 2 and 100),
 phone text not null check(phone ~ '^\+[1-9][0-9]{7,14}$'),
 aliases text[] not null default '{}',
 max_guests integer not null default 2 check(max_guests between 1 and 10),
 haldi boolean not null default true,
 sangeet boolean not null default true,
 active boolean not null default true,
 unique(name,phone)
);
create table wedding_private.events (
 code text primary key check(code in ('haldi','sangeet')),
 title text not null,
 starts_at timestamptz,
 timezone text not null default 'Asia/Kolkata',
 venue text not null default 'Details to follow',
 address text not null default '',
 map_url text not null default '' check(map_url='' or map_url ~ '^https://'),
 note text not null default ''
);
create table wedding_private.rsvps (
 id uuid primary key default gen_random_uuid(),
 respondent_key text unique not null,
 guest_id uuid references wedding_private.guests(id) on delete set null,
 name text not null,
 phone text not null,
 wedding text not null check(wedding in ('yes','no')),
 guest_count integer not null check(guest_count between 0 and 10),
 plus_one text not null default '',
 note text not null default '',
 updated_at timestamptz not null default now()
);
create table wedding_private.sessions (
 token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
 guest_id uuid not null references wedding_private.guests(id) on delete cascade,
 expires_at timestamptz not null default (now()+interval '2 hours')
);
create table wedding_private.event_rsvps (
 guest_id uuid not null references wedding_private.guests(id) on delete cascade,
 event_code text not null references wedding_private.events(code) on delete cascade,
 attendance text not null check(attendance in ('yes','no')),
 updated_at timestamptz not null default now(),
 primary key(guest_id,event_code)
);
create table wedding_private.rate_limits (
 key text primary key,
 window_start timestamptz not null,
 hits integer not null
);
alter table wedding_private.guests enable row level security;
alter table wedding_private.events enable row level security;
alter table wedding_private.rsvps enable row level security;
alter table wedding_private.sessions enable row level security;
alter table wedding_private.event_rsvps enable row level security;
alter table wedding_private.rate_limits enable row level security;
revoke all on all tables in schema wedding_private from public,anon,authenticated;
revoke all on all sequences in schema wedding_private from public,anon,authenticated;

create function wedding_private.normal_name(value text) returns text language sql immutable set search_path='' as $$
 select lower(regexp_replace(trim(value),'\s+',' ','g'));
$$;

create function public.wedding_rate_limit(p_key text,p_limit integer,p_seconds integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if p_key !~ '^[a-f0-9]{64}$' or p_limit not between 1 and 200 or p_seconds not between 60 and 3600 then
  raise exception 'invalid' using errcode='22023';
 end if;
 insert into wedding_private.rate_limits as r(key,window_start,hits) values(p_key,clock_timestamp(),1)
 on conflict(key) do update set
 hits=case when r.window_start < clock_timestamp()-make_interval(secs=>p_seconds) then 1 else r.hits+1 end,
 window_start=case when r.window_start < clock_timestamp()-make_interval(secs=>p_seconds) then clock_timestamp() else r.window_start end
 returning hits into n;
 -- Expired limiter entries and sessions contain no useful long-term data.
 if random()<0.02 then
  delete from wedding_private.rate_limits where window_start<now()-interval '1 day';
  delete from wedding_private.sessions where expires_at<now();
 end if;
 return n<=p_limit;
end; $$;

create function public.wedding_api(p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g wedding_private.guests%rowtype; match_count integer; count_guests integer;
 result jsonb; ev record; answer record; allowed_codes text[]; has_vip boolean;
begin
 if p_action in ('submit','verify') then
  if length(p_payload->>'name') not between 2 and 100 or (p_payload->>'phone') !~ '^\+[1-9][0-9]{7,14}$'
     or (p_payload->>'identity_hash') !~ '^[a-f0-9]{64}$' or (p_payload->>'token_hash') !~ '^[a-f0-9]{64}$'
     or not(p_payload ?& array['name','phone','identity_hash','token_hash']) then
   raise exception 'invalid' using errcode='22023';
  end if;
  select count(*) into match_count from wedding_private.guests x
  where x.active and x.phone=p_payload->>'phone' and (
    wedding_private.normal_name(x.name)=wedding_private.normal_name(p_payload->>'name') or
    exists(select 1 from unnest(x.aliases) a where wedding_private.normal_name(a)=wedding_private.normal_name(p_payload->>'name')));
  if match_count=1 then
   select * into g from wedding_private.guests x where x.active and x.phone=p_payload->>'phone' and (
    wedding_private.normal_name(x.name)=wedding_private.normal_name(p_payload->>'name') or
    exists(select 1 from unnest(x.aliases) a where wedding_private.normal_name(a)=wedding_private.normal_name(p_payload->>'name')));
  end if;
  if p_action='submit' then
   count_guests=(p_payload->>'guest_count')::integer;
   if (p_payload->>'wedding') not in ('yes','no') or count_guests is null or count_guests<0 or count_guests>coalesce(g.max_guests,2)
      or ((p_payload->>'wedding')='yes' and count_guests<1) or ((p_payload->>'wedding')='no' and count_guests<>0)
      or length(coalesce(p_payload->>'plus_one',''))>100 or length(coalesce(p_payload->>'note',''))>1000 then
    raise exception 'invalid' using errcode='22023';
   end if;
   insert into wedding_private.rsvps(respondent_key,guest_id,name,phone,wedding,guest_count,plus_one,note)
   values(coalesce(g.id::text,p_payload->>'identity_hash'),g.id,p_payload->>'name',p_payload->>'phone',p_payload->>'wedding',count_guests,
    case when count_guests>1 then coalesce(p_payload->>'plus_one','') else '' end,coalesce(p_payload->>'note',''))
   on conflict(respondent_key) do update set name=excluded.name,phone=excluded.phone,wedding=excluded.wedding,guest_count=excluded.guest_count,
    plus_one=excluded.plus_one,note=excluded.note,updated_at=now();
  end if;
  has_vip=g.id is not null and (g.haldi or g.sangeet);
  if has_vip then
   insert into wedding_private.sessions(token_hash,guest_id) values(p_payload->>'token_hash',g.id);
  end if;
  return jsonb_build_object('ok',true,'vip',has_vip);
 end if;

 select x.* into g from wedding_private.sessions s join wedding_private.guests x on x.id=s.guest_id
 where s.token_hash=p_payload->>'token_hash' and s.expires_at>now() and x.active and (x.haldi or x.sangeet);
 if g.id is null then raise exception 'session_required' using errcode='28000'; end if;
 if p_action='logout' then
  delete from wedding_private.sessions where token_hash=p_payload->>'token_hash';
  return jsonb_build_object('ok',true);
 end if;
 if p_action='ticket' then
  select coalesce(jsonb_agg(jsonb_build_object('code',e.code,'title',e.title,'starts_at',e.starts_at,'timezone',e.timezone,
   'venue',e.venue,'address',e.address,'map_url',e.map_url,'note',e.note,'attendance',r.attendance) order by e.starts_at nulls last),'[]'::jsonb)
   into result from wedding_private.events e left join wedding_private.event_rsvps r on r.event_code=e.code and r.guest_id=g.id
   where (e.code='haldi' and g.haldi) or (e.code='sangeet' and g.sangeet);
  return jsonb_build_object('ok',true,'name',g.name,'events',result);
 end if;
 if p_action='events' then
  if jsonb_typeof(p_payload->'responses') is distinct from 'object' then raise exception 'invalid' using errcode='22023'; end if;
  select array_agg(e.code) into allowed_codes from wedding_private.events e where (e.code='haldi' and g.haldi) or (e.code='sangeet' and g.sangeet);
  if allowed_codes is null then raise exception 'invalid' using errcode='22023'; end if;
  for answer in select * from jsonb_each_text(p_payload->'responses') loop
   if not(answer.key=any(allowed_codes)) then raise exception 'forbidden' using errcode='42501';end if;
   if answer.value is null or answer.value not in ('yes','no') then raise exception 'invalid' using errcode='22023';end if;
  end loop;
  if not((p_payload->'responses') ?& allowed_codes) then raise exception 'invalid' using errcode='22023';end if;
  for answer in select * from jsonb_each_text(p_payload->'responses') loop
   insert into wedding_private.event_rsvps(guest_id,event_code,attendance) values(g.id,answer.key,answer.value)
   on conflict(guest_id,event_code) do update set attendance=excluded.attendance,updated_at=now();
  end loop;
  return jsonb_build_object('ok',true);
 end if;
 raise exception 'invalid' using errcode='22023';
end; $$;

revoke all on function wedding_private.normal_name(text) from public,anon,authenticated;
revoke all on function public.wedding_rate_limit(text,integer,integer) from public,anon,authenticated;
revoke all on function public.wedding_api(text,jsonb) from public,anon,authenticated;
grant execute on function public.wedding_rate_limit(text,integer,integer) to service_role;
grant execute on function public.wedding_api(text,jsonb) to service_role;
commit;
