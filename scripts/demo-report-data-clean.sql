-- DEVELOPMENT ONLY. Removes what scripts/demo-report-data.sql loaded (references starting DEMO-).
begin;
delete from inspection_finding where inspection_id in (select id from inspection where rental_id in (select id from rental where reference like 'DEMO-%'));
delete from inspection where rental_id in (select id from rental where reference like 'DEMO-%');
delete from rental where reference like 'DEMO-%';
delete from payment where reservation_reference like 'DEMO-%';
delete from payment_intent where reservation_reference like 'DEMO-%';
delete from reservation where reference like 'DEMO-%';
commit;
