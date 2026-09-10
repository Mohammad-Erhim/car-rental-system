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

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const app = await getTestApp();
    server = httpServer(app);
    adminToken = (await signIn(app, 'test-admin@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    agentToken = (await signIn(app, 'test-agent@example.test', 'Test-Passw0rd!', 'staff'))
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
      .send({ unitId: unit!.id, kind: 'maintenance', reasonCode: 'service', startAt: isoIn(0) })
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
});
