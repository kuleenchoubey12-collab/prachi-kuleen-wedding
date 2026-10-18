begin;
alter table wedding_private.guests add column if not exists joke text not null default '' check(length(joke)<=1000);
alter table wedding_private.guests add column if not exists source_id uuid unique;
alter table wedding_private.guests add column if not exists guest_group text not null default '';
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
  select id into gid from wedding_private.guests where source_id=(r->>'id')::uuid;
  if gid is null then
   select id into gid from wedding_private.guests where name=r->>'name' and phone=r->>'phone' and source_id is null and not is_test;
  end if;
  if gid is null then
   insert into wedding_private.guests(name,phone,max_guests,haldi,sangeet,source_id,guest_group,aliases,joke)
   values(r->>'name',r->>'phone',(r->>'count')::integer,(r->>'vip')::boolean,(r->>'vip')::boolean,(r->>'id')::uuid,r->>'group',array(select jsonb_array_elements_text(r->'aliases')),coalesce(r->>'joke',''));
  else
   -- Identity edits revoke previous sessions; RSVP history is retained.
   delete from wedding_private.sessions where guest_id=gid and exists(select 1 from wedding_private.guests where id=gid and (name<>r->>'name' or phone<>r->>'phone'));
   update wedding_private.guests set name=r->>'name',phone=r->>'phone',max_guests=(r->>'count')::integer,
    haldi=(r->>'vip')::boolean,sangeet=(r->>'vip')::boolean,active=true,source_id=(r->>'id')::uuid,guest_group=r->>'group',aliases=array(select jsonb_array_elements_text(r->'aliases')),joke=coalesce(r->>'joke','') where id=gid;
  end if;
  total=total+1;
 end loop;
 update wedding_private.guests set active=false where source_id is not null and not(source_id=any(ids));
 return jsonb_build_object('ok',true,'active',total,'rows',jsonb_array_length(p_rows));
end; $$;
revoke all on function public.wedding_sync(jsonb) from public,anon,authenticated;
grant execute on function public.wedding_sync(jsonb) to service_role;
commit;
