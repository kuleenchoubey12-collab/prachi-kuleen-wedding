begin;
alter table wedding_private.guests add column if not exists alternate_phone text;
create or replace function public.wedding_sync(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb; gid uuid; ids uuid[]='{}'; total integer=0;
begin
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 2000 then raise exception 'invalid'; end if;
 perform pg_advisory_xact_lock(187603);
 for r in select value from jsonb_array_elements(p_rows) loop
  if (r->>'id')::uuid=any(ids) then raise exception 'duplicate id'; end if;
  ids=array_append(ids,(r->>'id')::uuid);
  if not (r->>'enabled')::boolean then
   update wedding_private.guests set active=false where source_id=(r->>'id')::uuid;
   continue;
  end if;
  if length(r->>'name') not between 2 and 100 or r->>'phone' !~ '^\+[1-9][0-9]{7,14}$'
   or (r->>'count')::integer not between 1 and 10 then raise exception 'invalid'; end if;
  if coalesce(r->>'alternate_phone','')<>'' and r->>'alternate_phone' !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'invalid alternate phone'; end if;
  select id into gid from wedding_private.guests where source_id=(r->>'id')::uuid;
  if gid is null then
   select id into gid from wedding_private.guests where name=r->>'name' and phone=r->>'phone' and source_id is null and not is_test;
  end if;
  if gid is null then
   insert into wedding_private.guests(name,phone,max_guests,haldi,sangeet,source_id,guest_group,aliases,joke,alternate_phone)
   values(r->>'name',r->>'phone',(r->>'count')::integer,(r->>'vip')::boolean,(r->>'vip')::boolean,(r->>'id')::uuid,r->>'group',array(select jsonb_array_elements_text(r->'aliases')),coalesce(r->>'joke',''),nullif(r->>'alternate_phone','')); 
  else
   -- Identity edits revoke previous sessions; RSVP history is retained.
   delete from wedding_private.sessions where guest_id=gid and exists(select 1 from wedding_private.guests where id=gid and (name<>r->>'name' or phone<>r->>'phone' or alternate_phone is distinct from nullif(r->>'alternate_phone','')));
   update wedding_private.guests set name=r->>'name',phone=r->>'phone',max_guests=(r->>'count')::integer,
    haldi=(r->>'vip')::boolean,sangeet=(r->>'vip')::boolean,active=true,source_id=(r->>'id')::uuid,guest_group=r->>'group',aliases=array(select jsonb_array_elements_text(r->'aliases')),joke=coalesce(r->>'joke',''),alternate_phone=nullif(r->>'alternate_phone','') where id=gid;
  end if;
  total=total+1;
 end loop;
 update wedding_private.guests set active=false where source_id is not null and not(source_id=any(ids));
 if exists(select 1 from (select id,phone n from wedding_private.guests where active union all select id,alternate_phone n from wedding_private.guests where active and alternate_phone is not null) t group by n having count(distinct id)>1) then raise exception 'Phone belongs to multiple guests';end if;
 return jsonb_build_object('ok',true,'active',total,'rows',jsonb_array_length(p_rows));
end; $$;
create or replace function public.wedding_api(p_action text,p_payload jsonb)
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
  where x.active and (x.phone=p_payload->>'phone' or x.alternate_phone=p_payload->>'phone');
  if match_count=1 then
   select * into g from wedding_private.guests x where x.active and (x.phone=p_payload->>'phone' or x.alternate_phone=p_payload->>'phone');
  end if;
  if g.id is null then
   insert into wedding_private.unmatched_attempts(name,phone,action) values(p_payload->>'name',p_payload->>'phone',p_action);
   return jsonb_build_object('ok',false,'error','we encountered a problem, try again later, error code:221');
  end if;
  if p_action='submit' then
   count_guests=(p_payload->>'guest_count')::integer;
   if (p_payload->>'wedding') not in ('yes','no') or count_guests is null or count_guests<0 or count_guests>coalesce(g.max_guests,2)
      or ((p_payload->>'wedding')='yes' and count_guests<1) or ((p_payload->>'wedding')='no' and count_guests<>0)
      or length(coalesce(p_payload->>'plus_one',''))>100 or length(coalesce(p_payload->>'note',''))>1000 then
    raise exception 'invalid' using errcode='22023';
   end if;
   insert into wedding_private.rsvps(respondent_key,guest_id,name,phone,wedding,guest_count,plus_one,note,is_test)
   values(coalesce(g.id::text,p_payload->>'identity_hash'),g.id,p_payload->>'name',g.phone,p_payload->>'wedding',count_guests,
    case when count_guests>1 then coalesce(p_payload->>'plus_one','') else '' end,coalesce(p_payload->>'note',''),coalesce(g.is_test,false))
   on conflict(respondent_key) do update set name=excluded.name,phone=excluded.phone,wedding=excluded.wedding,guest_count=excluded.guest_count,
    plus_one=excluded.plus_one,note=excluded.note,updated_at=now();
  end if;
  has_vip=g.id is not null and (g.haldi or g.sangeet);
  if has_vip then
   insert into wedding_private.sessions(token_hash,guest_id) values(p_payload->>'token_hash',g.id);
  end if;
  return jsonb_build_object('ok',true,'vip',has_vip,'name',g.name,'joke',g.joke);
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


commit;
