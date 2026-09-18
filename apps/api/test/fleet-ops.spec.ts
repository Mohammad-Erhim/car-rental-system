import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

/**
 * STAGE-005/006 deferred — fleet operations: maintenance blocks that take a unit out of service
 * (and put it back), and unit transfers between locations. Read + `addBlock`/`releaseBlock`
 * existed since STAGE-002; this covers the state-machine + the new transfer.
 */
const isoIn = (days: number, hourUtc = 15) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d.toISOString();
};

describe('fleet operations', () => {
  let server: ReturnType<typeof httpServer>;
  let adminToken: string;
  let agentToken: string;
  let customerToken: string;

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const app = await getTestApp();
    server = httpServer(app);
    adminToken = (await signIn(app, 'test-admin@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    agentToken = (await signIn(app, 'test-agent@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    customerToken = (await signIn(app, 'test-customer@example.test', 'Test-Passw0rd!', 'customer'))
      .accessToken;
  });
  afterAll(closeTestApp);

  async function unitsAt(locationCode: string, categoryCode?: string) {
    const res = await request(server)
      .get('/api/v1/ops/fleet/units')
      .query(categoryCode ? { locationCode, categoryCode } : { locationCode })
      .set(auth(adminToken))
      .expect(200);
    return res.body.results as Array<{
      id: string;
      plate: string;
      state: string;
      currentLocationCode: string;
    }>;
  }

  it('paginates on request, and returns every unit when pagination is not requested', async () => {
    const everything = await request(server)
      .get('/api/v1/ops/fleet/units')
      .set(auth(adminToken))
      .expect(200);
    expect(everything.body.count).toBe(everything.body.total); // the pickers rely on this
    expect(everything.body.pageCount).toBe(1);

    const first = await request(server)
      .get('/api/v1/ops/fleet/units?pageSize=2&page=1')
      .set(auth(adminToken))
      .expect(200);
    expect(first.body.count).toBeLessThanOrEqual(2);
    expect(first.body.total).toBe(everything.body.total);
    expect(first.body.pageCount).toBe(Math.max(1, Math.ceil(first.body.total / 2)));

    const collected: string[] = [];
    for (let page = 1; page <= first.body.pageCount; page += 1) {
      const res = await request(server)
        .get(`/api/v1/ops/fleet/units?pageSize=2&page=${page}`)
        .set(auth(adminToken))
        .expect(200);
      collected.push(...(res.body.results as Array<{ id: string }>).map((u) => u.id));
    }
    expect(collected).toEqual((everything.body.results as Array<{ id: string }>).map((u) => u.id));
  });

  it('searches plate / VIN / make / model and counts states ignoring the state filter', async () => {
    const all = await request(server)
      .get('/api/v1/ops/fleet/units')
      .set(auth(adminToken))
      .expect(200);
    const sample = (all.body.results as Array<{ plate: string }>)[0]!;
    const hit = await request(server)
      .get('/api/v1/ops/fleet/units')
      .query({ q: sample.plate.toLowerCase() })
      .set(auth(adminToken))
      .expect(200);
    expect(hit.body.total).toBeGreaterThanOrEqual(1);
    expect(
      (hit.body.results as Array<{ plate: string }>).some((u) => u.plate === sample.plate),
    ).toBe(true);
    const none = await request(server)
      .get('/api/v1/ops/fleet/units')
      .query({ q: 'no-such-vehicle-zzz' })
      .set(auth(adminToken))
      .expect(200);
    expect(none.body.total).toBe(0);

    const maint = await request(server)
      .get('/api/v1/ops/fleet/units')
      .query({ state: 'maintenance' })
      .set(auth(adminToken))
      .expect(200);
    expect(maint.body.stateCounts.all).toBe(all.body.total);
    expect(maint.body.total).toBe(maint.body.stateCounts.maintenance ?? 0);
  });

  it('rejects out-of-range paging with a 422', async () => {
    for (const qs of ['page=0', 'page=abc', 'pageSize=0', 'pageSize=101']) {
      await request(server).get(`/api/v1/ops/fleet/units?${qs}`).set(auth(adminToken)).expect(422);
    }
  });

  it('the unit list carries count + total and filters by state server-side', async () => {
    const all = await request(server)
      .get('/api/v1/ops/fleet/units')
      .set(auth(adminToken))
      .expect(200);
    expect(typeof all.body.total).toBe('number');
    expect(all.body.count).toBe(all.body.results.length);
    expect(all.body.total).toBeGreaterThanOrEqual(all.body.count);

    const avail = await request(server)
      .get('/api/v1/ops/fleet/units')
      .query({ state: 'available' })
      .set(auth(adminToken))
      .expect(200);
    expect(
      (avail.body.results as Array<{ state: string }>).every((u) => u.state === 'available'),
    ).toBe(true);
    expect(avail.body.count).toBeLessThanOrEqual(all.body.count);
  });

  it('a maintenance block takes an available unit out of service and release restores it', async () => {
    const before = await unitsAt('TST1', 'suv');
    const unit = before.find((u) => u.state === 'available');
    expect(unit).toBeTruthy();

    const opened = await request(server)
      .post('/api/v1/ops/fleet/blocks')
      .set(auth(adminToken))
      .send({ unitId: unit!.id, kind: 'maintenance', reasonCode: 'maintenance', startAt: isoIn(0) })
      .expect(201);
    const blockId = opened.body.id as string;

    const during = await unitsAt('TST1', 'suv');
    expect(during.find((u) => u.id === unit!.id)?.state).toBe('maintenance');

    const blocks = await request(server)
      .get('/api/v1/ops/fleet/blocks')
      .query({ unitId: unit!.id, status: 'active' })
      .set(auth(adminToken))
      .expect(200);
    expect(blocks.body).toHaveLength(1);
    expect(blocks.body[0]).toMatchObject({ id: blockId, kind: 'maintenance', plate: unit!.plate });

    // the unit is no longer offered for a booking that overlaps
    const search = await request(server)
      .post('/api/v1/discovery/search')
      .send({
        pickupLocationCode: 'TST1',
        pickupAt: isoIn(1),
        returnAt: isoIn(3),
        categoryCode: 'suv',
      })
      .expect(201);
    const suv = search.body.options.find((o: { categoryCode: string }) => o.categoryCode === 'suv');
    // one suv held out for maintenance → bookable count is the seed count minus one
    expect(suv.bookableCount).toBe(before.length - 1);

    await request(server)
      .post(`/api/v1/ops/fleet/blocks/${blockId}/release`)
      .set(auth(adminToken))
      .expect(201);

    const after = await unitsAt('TST1', 'suv');
    expect(after.find((u) => u.id === unit!.id)?.state).toBe('available');
  });

  it('rejects a block reason that is not an active block_reason value', async () => {
    const unit = (await unitsAt('TST1', 'suv')).find((u) => u.state === 'available');
    const bad = await request(server)
      .post('/api/v1/ops/fleet/blocks')
      .set(auth(adminToken))
      .send({
        unitId: unit!.id,
        kind: 'admin_block',
        reasonCode: 'just_because',
        startAt: isoIn(0),
      })
      .expect(422);
    expect(bad.body.fieldErrors?.[0]?.path).toBe('reasonCode');
  });

  it('a unit transfers to another location and is then counted there', async () => {
    const unit = (await unitsAt('TST1', 'compact')).find((u) => u.state === 'available');
    expect(unit).toBeTruthy();

    const moved = await request(server)
      .post(`/api/v1/ops/fleet/units/${unit!.id}/transfer`)
      .set(auth(adminToken))
      .send({ toLocationCode: 'TST2', note: 'rebalancing' })
      .expect(201);
    expect(moved.body).toMatchObject({ currentLocationCode: 'TST2', state: 'available' });

    const atSource = await unitsAt('TST1', 'compact');
    expect(atSource.some((u) => u.id === unit!.id)).toBe(false);
    const atDest = await unitsAt('TST2', 'compact');
    expect(atDest.some((u) => u.id === unit!.id)).toBe(true);

    // same-location transfer → 422; unknown location → 404; unknown unit → 404
    await request(server)
      .post(`/api/v1/ops/fleet/units/${unit!.id}/transfer`)
      .set(auth(adminToken))
      .send({ toLocationCode: 'TST2' })
      .expect(422);
    await request(server)
      .post(`/api/v1/ops/fleet/units/${unit!.id}/transfer`)
      .set(auth(adminToken))
      .send({ toLocationCode: 'NOPE' })
      .expect(404);
    await request(server)
      .post('/api/v1/ops/fleet/units/00000000-0000-0000-0000-000000000000/transfer')
      .set(auth(adminToken))
      .send({ toLocationCode: 'TST1' })
      .expect(404);
  });

  it('an agent without fleet.manage cannot block or transfer', async () => {
    const unit = (await unitsAt('TST1'))[0]!;
    await request(server)
      .post('/api/v1/ops/fleet/blocks')
      .set(auth(agentToken))
      .send({ unitId: unit.id, startAt: isoIn(0) })
      .expect(403);
    await request(server)
      .post(`/api/v1/ops/fleet/units/${unit.id}/transfer`)
      .set(auth(agentToken))
      .send({ toLocationCode: 'TST2' })
      .expect(403);
  });

  it('CSV import: a dry run reports per-row errors; a clean commit adds the units', async () => {
    const stamp = Date.now().toString().slice(-6);
    const header = 'plate,vin,categoryCode,locationCode,year,make,model,colour';
    const bad = [
      header,
      `IMP${stamp}A,VIN${stamp}0000001,economy,TST1,2024,Kia,Rio,white`,
      `,VIN${stamp}0000002,economy,TST1,2024,Kia,Rio,white`, // missing plate
      `IMP${stamp}C,short,economy,TST1,2024,Kia,Rio,white`, // bad vin
      `IMP${stamp}D,VIN${stamp}0000004,nope,TST1,2024,Kia,Rio,white`, // unknown category
      `IMP${stamp}E,VIN${stamp}0000005,economy,ZZZZ,2024,Kia,Rio,white`, // unknown location
      `IMP${stamp}A,VIN${stamp}0000006,economy,TST1,2024,Kia,Rio,white`, // dup plate in file
    ].join('\n');

    const dry = await request(server)
      .post('/api/v1/ops/fleet/units/import')
      .set(auth(adminToken))
      .send({ csv: bad, commit: true })
      .expect(201);
    expect(dry.body.committed).toBe(false);
    expect(dry.body.total).toBe(6);
    const fields = (dry.body.errors as Array<{ field: string }>).map((e) => e.field);
    expect(fields).toEqual(
      expect.arrayContaining(['plate', 'vin', 'categoryCode', 'locationCode']),
    );

    const before = (await unitsAt('TST1', 'economy')).length;
    const good = [
      header,
      `IMP${stamp}X,VIN${stamp}000000X,economy,TST1,2024,Kia,Rio,white`,
      `IMP${stamp}Y,VIN${stamp}000000Y,economy,TST2,2023,Kia,Rio,black`,
    ].join('\n');

    const preview = await request(server)
      .post('/api/v1/ops/fleet/units/import')
      .set(auth(adminToken))
      .send({ csv: good, commit: false })
      .expect(201);
    expect(preview.body).toMatchObject({ total: 2, valid: 2, committed: false, created: 0 });
    expect(preview.body.errors).toHaveLength(0);

    const committed = await request(server)
      .post('/api/v1/ops/fleet/units/import')
      .set(auth(adminToken))
      .send({ csv: good, commit: true })
      .expect(201);
    expect(committed.body).toMatchObject({ committed: true, created: 2 });

    expect((await unitsAt('TST1', 'economy')).length).toBe(before + 1);
    expect((await unitsAt('TST2', 'economy')).some((u) => u.plate === `IMP${stamp}Y`)).toBe(true);

    // re-importing the same file now collides with the DB
    const again = await request(server)
      .post('/api/v1/ops/fleet/units/import')
      .set(auth(adminToken))
      .send({ csv: good, commit: true })
      .expect(201);
    expect(again.body.committed).toBe(false);
    expect(again.body.errors.length).toBeGreaterThanOrEqual(2);

    await request(server)
      .post('/api/v1/ops/fleet/units/import')
      .set(auth(agentToken))
      .send({ csv: good, commit: false })
      .expect(403);
  });

  it('a location-scoped fleet staffer only sees and acts on units at their locations (FR-RPT-004)', async () => {
    const app = await getTestApp();
    const scopedToken = (
      await signIn(app, 'test-fleet-scoped@example.test', 'Test-Passw0rd!', 'staff')
    ).accessToken;

    // units + blocks are confined to TST1
    const units = await request(server)
      .get('/api/v1/ops/fleet/units')
      .set(auth(scopedToken))
      .expect(200);
    expect(
      (units.body.results as Array<{ currentLocationCode: string }>).every(
        (u) => u.currentLocationCode === 'TST1',
      ),
    ).toBe(true);

    // explicitly requesting a location outside the actor's own scope is a 403, not a silently
    // empty result (SRS-SEC-007)
    const rejected = await request(server)
      .get('/api/v1/ops/fleet/units')
      .query({ locationCode: 'TST2' })
      .set(auth(scopedToken))
      .expect(403);
    expect(rejected.body.title).toMatch(/don't have access/i);

    // admin blocks a TST2 unit; the scoped staffer must not see it or be able to release it
    const tst2 = (await unitsAt('TST2')).find((u) => u.state === 'available');
    expect(tst2).toBeTruthy();
    const blk = await request(server)
      .post('/api/v1/ops/fleet/blocks')
      .set(auth(adminToken))
      .send({ unitId: tst2!.id, kind: 'admin_block', startAt: isoIn(0) })
      .expect(201);

    const scopedBlocks = await request(server)
      .get('/api/v1/ops/fleet/blocks')
      .query({ status: 'active' })
      .set(auth(scopedToken))
      .expect(200);
    expect((scopedBlocks.body as Array<{ id: string }>).some((b) => b.id === blk.body.id)).toBe(
      false,
    );

    await request(server)
      .post(`/api/v1/ops/fleet/blocks/${blk.body.id}/release`)
      .set(auth(scopedToken))
      .expect(403);
    await request(server)
      .post(`/api/v1/ops/fleet/units/${tst2!.id}/transfer`)
      .set(auth(scopedToken))
      .send({ toLocationCode: 'TST1' })
      .expect(403);

    // importing units into TST2 is rejected for a TST1-scoped staffer
    const s = Date.now().toString().slice(-6);
    const csv = [
      'plate,vin,categoryCode,locationCode,year,make,model,colour',
      `SCP${s}A,VINSCP${s}0001,economy,TST2,2024,Kia,Rio,white`,
      `SCP${s}B,VINSCP${s}0002,economy,TST1,2024,Kia,Rio,white`,
    ].join('\n');
    const imp = await request(server)
      .post('/api/v1/ops/fleet/units/import')
      .set(auth(scopedToken))
      .send({ csv, commit: false })
      .expect(201);
    expect(
      (imp.body.errors as Array<{ field: string; message: string }>).some(
        (e) => e.field === 'locationCode' && /assigned locations/i.test(e.message),
      ),
    ).toBe(true);

    // a bad year is rejected
    const badYear = [
      'plate,vin,categoryCode,locationCode,year,make,model,colour',
      `SCY${s}A,VINSCY${s}0001,economy,TST1,20xx,Kia,Rio,white`,
    ].join('\n');
    const yr = await request(server)
      .post('/api/v1/ops/fleet/units/import')
      .set(auth(scopedToken))
      .send({ csv: badYear, commit: false })
      .expect(201);
    expect((yr.body.errors as Array<{ field: string }>).some((e) => e.field === 'year')).toBe(true);
  });

  it('a block end before its start is a 422', async () => {
    const unit = (await unitsAt('TST1'))[0]!;
    await request(server)
      .post('/api/v1/ops/fleet/blocks')
      .set(auth(adminToken))
      .send({ unitId: unit.id, startAt: isoIn(5), endAt: isoIn(2) })
      .expect(422);
  });

  it('vehicle CRUD: create, edit with If-Match, stale edit refused, duplicate plate/vin refused, retire/restore', async () => {
    const s = Date.now().toString().slice(-8);
    const created = await request(server)
      .post('/api/v1/ops/fleet/units')
      .set(auth(adminToken))
      .send({
        categoryCode: 'economy',
        locationCode: 'TST1',
        vin: `VINCRUD${s}`,
        plate: `CRD${s}`,
        year: '2024',
        make: 'Toyota',
        model: 'Yaris',
        colour: 'blue',
      })
      .expect(201);
    expect(created.body.version).toBe(1);
    expect(created.body.state).toBe('available');
    expect(created.body.plate).toBe(`CRD${s}`.toUpperCase());

    // an agent (fleet.read only) cannot create/edit/retire
    await request(server)
      .post('/api/v1/ops/fleet/units')
      .set(auth(agentToken))
      .send({ categoryCode: 'economy', locationCode: 'TST1', vin: `X${s}`, plate: `X${s}` })
      .expect(403);

    // duplicate plate/vin is refused, not a 500
    await request(server)
      .post('/api/v1/ops/fleet/units')
      .set(auth(adminToken))
      .send({
        categoryCode: 'economy',
        locationCode: 'TST1',
        vin: `VINCRUD${s}`,
        plate: `OTHER${s}`,
      })
      .expect(409);

    // stale If-Match refused
    await request(server)
      .post(`/api/v1/ops/fleet/units/${created.body.id}`)
      .set(auth(adminToken))
      .set('If-Match', '0')
      .send({ colour: 'red' })
      .expect(409);

    const edited = await request(server)
      .post(`/api/v1/ops/fleet/units/${created.body.id}`)
      .set(auth(adminToken))
      .set('If-Match', String(created.body.version))
      .send({ colour: 'red', model: 'Corolla' })
      .expect(201);
    expect(edited.body.version).toBe(2);
    expect(edited.body.colour).toBe('red');
    expect(edited.body.model).toBe('Corolla');
    // untouched fields survive a partial edit
    expect(edited.body.plate).toBe(`CRD${s}`.toUpperCase());

    // retire — blocked while it would otherwise be bookable is fine here since it has no rental
    const retired = await request(server)
      .post(`/api/v1/ops/fleet/units/${created.body.id}/retire`)
      .set(auth(adminToken))
      .expect(201);
    expect(retired.body.state).toBe('retired');

    // retiring an already-retired unit is a no-op error, not silently accepted twice
    await request(server)
      .post(`/api/v1/ops/fleet/units/${created.body.id}/retire`)
      .set(auth(adminToken))
      .expect(422);

    const restored = await request(server)
      .post(`/api/v1/ops/fleet/units/${created.body.id}/restore`)
      .set(auth(adminToken))
      .expect(201);
    expect(restored.body.state).toBe('available');
  });

  it('a unit already assigned to an open rental is excluded from state=available even though its own state stays available', async () => {
    // vehicleUnit.state only flips to on_rent at actual pickup — assign() alone (still
    // awaiting_pickup) must not be enough to make this endpoint keep offering the same car.
    const before = await unitsAt('TST1', 'intermediate');
    const availableBefore = before.filter((u) => u.state === 'available');
    expect(availableBefore.length).toBeGreaterThan(0);

    const quote = await request(server)
      .post('/api/v1/discovery/quote')
      .send({
        pickupLocationCode: 'TST1',
        pickupAt: isoIn(160),
        returnAt: isoIn(163),
        categoryCode: 'intermediate',
        holderKey: 'fleet-avail-check',
      })
      .expect(201);
    const confirmed = await request(server)
      .post('/api/v1/bookings/confirm')
      .set(auth(customerToken))
      .send({
        quoteReference: quote.body.reference,
        drivers: [{ role: 'primary_renter', fullName: 'Fleet Check', email: 'fleet@example.test' }],
        acceptTerms: true,
        paymentToken: 'tok_ok',
      })
      .expect(201);
    const assigned = await request(server)
      .post(`/api/v1/ops/reservations/${confirmed.body.reference}/assign`)
      .set(auth(agentToken))
      .send({})
      .expect(201);
    const assignedUnitId = assigned.body.unitId as string;
    expect(assigned.body.state).toBe('awaiting_pickup');

    // the underlying unit's own state column is untouched by a plain assign — still "available"
    const stillAvailableState = (await unitsAt('TST1', 'intermediate')).find(
      (u) => u.id === assignedUnitId,
    );
    expect(stillAvailableState?.state).toBe('available');

    // but the state=available *filter* must not offer it — it's already committed
    const afterAvailable = (
      await request(server)
        .get('/api/v1/ops/fleet/units')
        .query({ locationCode: 'TST1', categoryCode: 'intermediate', state: 'available' })
        .set(auth(adminToken))
        .expect(200)
    ).body.results as Array<{ id: string }>;
    expect(afterAvailable.some((u) => u.id === assignedUnitId)).toBe(false);
  });
});
