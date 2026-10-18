begin;
create table if not exists wedding_private.activity (
 id bigint generated always as identity primary key,
 visitor uuid not null,event text not null check(event in ('invitation_opened','name_entered','puzzle_completed','movie_clicked')),
 name text not null default '' check(length(name)<=100),created_at timestamptz not null default now(),
 unique(visitor,event,name)
);
alter table wedding_private.activity enable row level security;
revoke all on wedding_private.activity from public,anon,authenticated;
create or replace function public.wedding_activity(p_visitor uuid,p_event text,p_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 insert into wedding_private.activity(visitor,event,name) values(p_visitor,p_event,p_name) on conflict do nothing;
 return jsonb_build_object('ok',true);
end;$$;
revoke all on function public.wedding_activity(uuid,text,text) from public,anon,authenticated;
grant execute on function public.wedding_activity(uuid,text,text) to service_role;
create or replace function public.wedding_reports() returns jsonb
language sql security definer set search_path='' as $$
select jsonb_build_object(
 'rsvps',coalesce((select jsonb_agg(to_jsonb(t)) from (
 select r.name,r.phone,r.wedding,r.guest_count,r.plus_one,r.note,
 case when g.haldi then coalesce(h.attendance,'pending') else 'not invited' end haldi,
 case when g.sangeet then coalesce(s.attendance,'pending') else 'not invited' end sangeet,
 to_char(r.updated_at at time zone 'Asia/Kolkata','DD MM YY HH24:MI') updated
 from wedding_private.rsvps r left join wedding_private.guests g on g.id=r.guest_id
 left join wedding_private.event_rsvps h on h.guest_id=g.id and h.event_code='haldi'
 left join wedding_private.event_rsvps s on s.guest_id=g.id and s.event_code='sangeet'
 where not r.is_test order by r.updated_at desc limit 10000) t),'[]'::jsonb),
 'attempts',coalesce((select jsonb_agg(to_jsonb(t)) from (
 select name,phone,action,to_char(attempted_at at time zone 'Asia/Kolkata','DD MM YY HH24:MI') attempted
 from wedding_private.unmatched_attempts order by attempted_at desc limit 10000) t),'[]'::jsonb),
 'activity',coalesce((select jsonb_agg(to_jsonb(t)) from (
 select a.visitor,coalesce(nullif(a.name,''),(select nullif(n.name,'') from wedding_private.activity n where n.visitor=a.visitor and n.name<>'' order by n.created_at desc limit 1),'Anonymous visitor') name,
 a.event,to_char(a.created_at at time zone 'Asia/Kolkata','DD MM YY HH24:MI') occurred
 from wedding_private.activity a order by a.created_at desc limit 10000) t),'[]'::jsonb)
);
$$;
revoke all on function public.wedding_reports() from public,anon,authenticated;
grant execute on function public.wedding_reports() to service_role;
commit;
