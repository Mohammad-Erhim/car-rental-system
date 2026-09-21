-- DEVELOPMENT ONLY. Loads ~150 bookings over the last 75 days (payments, refunds, rentals, a few
-- damage findings) so the Reports pages have something to show:
--   psql "$DATABASE_URL" -f scripts/demo-report-data.sql
-- Every row's reference starts with DEMO-; scripts/demo-report-data-clean.sql removes them again.
begin;
select setseed(0.37);
do $$
declare
  org uuid := (select id from organization order by created_at limit 1);
  i int; d int; cat text; loc text; days int; rate int; sub int; tax int; tot int; st text; ref text; ch text;
  booked timestamptz; pick timestamptz; ret timestamptz; unit uuid; rid uuid; iid uuid; r float; late_h float; reason text;
  cats text[] := array['economy','compact','intermediate','suv','premium'];
  rates int[] := array[3900, 4600, 5400, 7800, 11200];
  locs text[] := array['JFK','LHR','PAR'];
  ci int;
begin
  for i in 1..150 loop
    ci := 1 + floor(random()*5)::int;
    cat := cats[ci]; rate := rates[ci];
    loc := locs[1 + floor(random()*3)::int];
    days := 1 + floor(random()*random()*9)::int;
    d := floor(random()*75)::int;                       -- booked d days ago
    booked := now() - (d || ' days')::interval - (floor(random()*20) || ' hours')::interval;
    pick := booked + ((floor(random()*random()*20)) || ' days')::interval + interval '3 hours';
    ret := pick + (days || ' days')::interval;
    sub := rate * days + (case when random() < 0.35 then 1500 + floor(random()*3000)::int else 0 end);
    tax := round(sub * 0.08); tot := sub + tax;
    r := random();
    ch := case when random() < 0.62 then 'customer' when random() < 0.7 then 'guest' else 'staff' end;
    st := case
      when pick > now() then case when r < 0.9 then 'confirmed' else 'cancelled' end
      when r < 0.78 then 'fulfilled' when r < 0.88 then 'cancelled' when r < 0.93 then 'no_show' when r < 0.97 then 'expired' else 'pending' end;
    ref := 'DEMO-' || lpad(i::text, 4, '0');
    reason := (array['plans_changed','found_better_price','customer_request','booked_by_mistake','trip_cancelled','other'])[1+floor(random()*6)::int];
    insert into reservation (organization_id, reference, state, category_code, pickup_location_code, return_location_code, pickup_at, return_at, duration_hours,
      quote_reference, quote_version, currency, subtotal_minor, tax_minor, total_minor, paid_minor, channel, confirmed_at, cancelled_at, cancel_reason_code, created_at)
    values (org, ref, st, cat, loc, loc, pick, ret, days*24, 'DQ-'||ref, 1, 'USD', sub, tax, tot,
      case when st in ('confirmed','fulfilled') then tot when st in ('cancelled','no_show') then tot else 0 end, ch,
      case when st in ('pending','expired') then null else booked end,
      case when st = 'cancelled' then booked + interval '20 hours' end,
      case when st = 'cancelled' then reason end, booked);
    if st in ('confirmed','fulfilled','cancelled','no_show') then
      insert into payment_intent (organization_id, reservation_reference, purpose, amount_minor, currency, state, provider, method_brand, captured_at, refunded_minor, created_at)
      values (org, ref, 'booking', tot, 'USD', case when st in ('cancelled') then 'partially_refunded' else 'captured' end, 'simulator',
        (array['visa','mastercard','amex'])[1+floor(random()*3)::int], booked, case when st = 'cancelled' then round(tot*0.8) else 0 end, booked)
      returning id into iid;
      insert into payment (intent_id, reservation_reference, type, amount_minor, currency, outcome, created_at) values (iid, ref, 'capture', tot, 'USD', 'succeeded', booked);
      if st = 'cancelled' then
        insert into payment (intent_id, reservation_reference, type, amount_minor, currency, outcome, created_at) values (iid, ref, 'refund', round(tot*0.8), 'USD', 'succeeded', booked + interval '21 hours');
      end if;
      if random() < 0.03 then
        insert into payment (intent_id, reservation_reference, type, amount_minor, currency, outcome, failure_code, created_at) values (iid, ref, 'authorize', tot, 'USD', 'failed', 'card_declined', booked - interval '5 minutes');
      end if;
    end if;
    if st = 'fulfilled' then
      select vu.id into unit from vehicle_unit vu join vehicle_category c on c.id = vu.category_id
        where c.code = cat and vu.organization_id = org order by random() limit 1;
      late_h := case when random() < 0.16 then 2 + random()*10 else -random()*3 end;
      insert into rental (organization_id, reference, reservation_reference, unit_id, state, pickup_location_code, return_location_code,
        scheduled_pickup_at, scheduled_return_at, picked_up_at, returned_at, odometer_out_km, odometer_in_km, currency, settlement_minor, created_at)
      values (org, 'DEMO-R' || lpad(i::text, 4, '0'), ref, unit, 'closed', loc, loc, pick, ret, pick + interval '10 minutes',
        ret + (late_h || ' hours')::interval, 10000 + i*50, 10000 + i*50 + days*(90 + floor(random()*120))::int, 'USD',
        case when late_h > 1 then round(late_h*1200) else 0 end, pick)
      returning id into rid;
      if random() < 0.3 then
        insert into inspection (rental_id, kind, outcome, created_at) values (rid, 'return', 'issues', ret) returning id into iid;
        insert into inspection_finding (inspection_id, area, severity, description, charge_minor, created_at)
          values (iid, 'Rear bumper', 'minor', 'Scratch', 6000 + floor(random()*9000)::int, ret);
      end if;
    end if;
  end loop;
end $$;
commit;
