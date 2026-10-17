-- Run in Supabase SQL Editor as the project owner, then Download CSV.
-- The apostrophe protects text/phone columns from Excel formula interpretation.
select
 ''''||r.name as "Name",
 ''''||r.phone as "WhatsApp",
 r.wedding as "Wedding",
 r.guest_count as "Guests attending",
 ''''||r.plus_one as "Plus one",
 ''''||r.note as "Notes",
 case when g.haldi then coalesce(h.attendance,'pending') else 'not invited' end as "Haldi",
 case when g.sangeet then coalesce(s.attendance,'pending') else 'not invited' end as "Sangeet",
 case when r.guest_id is null then 'unlisted' else 'matched guest list' end as "Guest check",
 r.updated_at at time zone 'Asia/Kolkata' as "Updated (India time)"
from wedding_private.rsvps r
left join wedding_private.guests g on g.id=r.guest_id
left join wedding_private.event_rsvps h on h.guest_id=g.id and h.event_code='haldi'
left join wedding_private.event_rsvps s on s.guest_id=g.id and s.event_code='sangeet'
where not r.is_test
order by r.updated_at desc;
