-- Includes invitees who have not answered the wedding RSVP yet.
select ''''||g.name as "Name", ''''||g.phone as "WhatsApp",
 coalesce(r.wedding,'pending') as "Wedding",r.guest_count as "Guests attending",
 case when g.haldi then coalesce(h.attendance,'pending') else 'not invited' end as "Haldi",
 case when g.sangeet then coalesce(s.attendance,'pending') else 'not invited' end as "Sangeet"
from wedding_private.guests g
left join wedding_private.rsvps r on r.guest_id=g.id
left join wedding_private.event_rsvps h on h.guest_id=g.id and h.event_code='haldi'
left join wedding_private.event_rsvps s on s.guest_id=g.id and s.event_code='sangeet'
where g.active and not g.is_test order by g.name;
