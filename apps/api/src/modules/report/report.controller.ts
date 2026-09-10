import {
  Inject,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';

import { CurrentActor } from '../../common/auth/auth.guard';
import { Permissions } from '../../common/auth/permissions.guard';
import { StepUp } from '../../common/auth/step-up.guard';
import type { Actor } from '../../common/auth/types';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { auditEvent } from '../../database/schema/platform';
import { ConfigVersionService } from '../config/config-version.service';

import { ReportService } from './report.service';

const zRun = z.object({ params: z.record(z.unknown()).optional() });
const zSchedule = z.object({
  definitionCode: z.string().max(60),
  cron: z.string().max(120),
  params: z.record(z.unknown()).optional(),
  recipients: z.array(z.string().email()).min(1).max(20),
});
const zDraft = z.object({
  kind: z.enum(['policy', 'pricing', 'product', 'location', 'branding', 'seo', 'pages', 'consent']),
  key: z.string().min(1).max(60),
  payload: z.record(z.unknown()),
  note: z.string().max(1000).optional(),
});
const zPreview = z.object({
  kind: z.string().max(40),
  key: z.string().min(1).max(60).optional(),
  payload: z.record(z.unknown()),
});
const zNote = z.object({ note: z.string().min(1).max(1000) });

@ApiTags('admin')
@Controller({ path: 'ops', version: '1' })
export class ReportController {
  constructor(
    private readonly reports: ReportService,
    private readonly config: ConfigVersionService,
    @Inject(DB) private readonly db: Database,
  ) {}

  // ---- operational dashboard (SCREEN-OPS-002) ----

  @Get('dashboard')
  @Permissions('reservation.read')
  dashboard(@CurrentActor() actor: Actor) {
    return this.reports.opsDashboard(actor);
  }

  // ---- reports ----

  @Get('reports')
  @Permissions('report.read')
  listDefinitions() {
    return this.reports.listDefinitions();
  }

  @Get('reports/runs')
  @Permissions('report.read')
  listRuns(@Query('code') code?: string) {
    return this.reports.listRuns(code);
  }

  @Post('reports/:code/run')
  @Permissions('report.read')
  run(
    @Param('code') code: string,
    @Body(new ZodValidationPipe(zRun)) body: z.infer<typeof zRun>,
    @CurrentActor() actor: Actor,
  ) {
    return this.reports.run(actor, code, body.params ?? {});
  }

  @Get('reports/runs/:runId/export')
  @Permissions('report.export', 'report.read')
  @Header('Content-Type', 'text/csv')
  async exportCsv(
    @Param('runId') runId: string,
    @CurrentActor() actor: Actor,
    @Res({ passthrough: true }) res: Response,
  ) {
    const csv = await this.reports.exportCsv(actor, runId);
    res.setHeader('Content-Disposition', `attachment; filename="report-${runId}.csv"`);
    return csv;
  }

  @Get('reports/schedules')
  @Permissions('report.export', 'report.read')
  listSchedules() {
    return this.reports.listSchedules();
  }

  @Post('reports/schedules')
  @Permissions('report.export')
  schedule(
    @Body(new ZodValidationPipe(zSchedule)) body: z.infer<typeof zSchedule>,
    @CurrentActor() actor: Actor,
  ) {
    return this.reports.schedule(actor, body);
  }

  @Post('reports/schedules/:id/send')
  @Permissions('report.export')
  @StepUp()
  sendSchedule(@Param('id') id: string, @CurrentActor() actor: Actor) {
    return this.reports.sendScheduleNow(actor, id);
  }

  // ---- config versioning ----

  @Get('config/versions')
  @Permissions('config.read', 'config.publish')
  listVersions(@Query('kind') kind: string, @Query('key') key?: string) {
    return this.config.list(kind, key);
  }

  @Post('config/versions')
  @Permissions('config.read', 'config.publish')
  draft(
    @Body(new ZodValidationPipe(zDraft)) body: z.infer<typeof zDraft>,
    @CurrentActor() actor: Actor,
  ) {
    return this.config.draft(actor, body);
  }

  @Post('config/versions/preview')
  @Permissions('config.read', 'config.publish')
  preview(@Body(new ZodValidationPipe(zPreview)) body: z.infer<typeof zPreview>) {
    return this.config.preview(body.kind, body.payload, body.key);
  }

  @Delete('config/versions/:id')
  @Permissions('config.read', 'config.publish')
  removeVersion(@Param('id') id: string, @CurrentActor() actor: Actor) {
    return this.config.remove(actor, id);
  }

  @Post('config/versions/:id/submit')
  @Permissions('config.read', 'config.publish')
  submit(@Param('id') id: string, @CurrentActor() actor: Actor) {
    return this.config.submit(actor, id);
  }

  @Post('config/versions/:id/approve')
  @Permissions('config.publish')
  approve(@Param('id') id: string, @CurrentActor() actor: Actor) {
    return this.config.approve(actor, id);
  }

  @Post('config/versions/:id/reject')
  @Permissions('config.publish')
  reject(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(zNote)) body: z.infer<typeof zNote>,
    @CurrentActor() actor: Actor,
  ) {
    return this.config.reject(actor, id, body.note);
  }

  // ---- audit viewer (SCREEN-OPS-038) ----

  @Get('audit')
  @Permissions('audit.read')
  async audit(
    @Query('action') action?: string,
    @Query('targetType') targetType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const where = [];
    if (action) where.push(eq(auditEvent.action, action));
    if (targetType) where.push(eq(auditEvent.targetType, targetType));
    if (from) where.push(gte(auditEvent.occurredAt, from));
    if (to) where.push(lte(auditEvent.occurredAt, to));
    const rows = await this.db
      .select({
        id: auditEvent.id,
        occurredAt: auditEvent.occurredAt,
        actor: sql<string>`coalesce(${auditEvent.actorLabel}, ${auditEvent.actorType})`,
        action: auditEvent.action,
        targetType: auditEvent.targetType,
        targetId: auditEvent.targetId,
        outcome: auditEvent.outcome,
        reason: auditEvent.reason,
        before: auditEvent.beforeSafe,
        after: auditEvent.afterSafe,
      })
      .from(auditEvent)
      .where(where.length ? and(...where) : sql`true`)
      .orderBy(desc(auditEvent.occurredAt))
      .limit(200);
    return rows.map((r) => ({ ...r, occurredAt: new Date(r.occurredAt).toISOString() }));
  }

  // ---- data quality (SCREEN-OPS-039) ----

  /**
   * FR-ADM-013 — a read-only sweep of referential-integrity / drift checks. Each check is a
   * cheap COUNT plus a short sample of offending keys; a non-zero count is something ops should
   * work, never a hard failure. Add a check = one more entry in `CHECKS`.
   */
  @Get('data-quality')
  @Permissions('audit.read', 'config.read')
  async dataQuality() {
    const CHECKS: Array<{
      id: string;
      title: string;
      severity: 'high' | 'medium' | 'low';
      countSql: ReturnType<typeof sql>;
      sampleSql: ReturnType<typeof sql>;
    }> = [
      {
        id: 'rental_active_without_unit',
        title: 'Active or overdue rentals with no vehicle assigned',
        severity: 'high',
        countSql: sql`select count(*)::int as n from rental where state in ('active','overdue') and unit_id is null`,
        sampleSql: sql`select reference as key from rental where state in ('active','overdue') and unit_id is null limit 8`,
      },
      {
        id: 'unit_orphan_location',
        title: 'Vehicle units pointing at a location that no longer exists',
        severity: 'high',
        countSql: sql`select count(*)::int as n from vehicle_unit u where not exists (select 1 from location l where l.id = u.current_location_id)`,
        sampleSql: sql`select plate as key from vehicle_unit u where not exists (select 1 from location l where l.id = u.current_location_id) limit 8`,
      },
      {
        id: 'lookup_value_dangling_type',
        title: 'Lookup values whose type is missing',
        severity: 'medium',
        countSql: sql`select count(*)::int as n from lookup_value v where not exists (select 1 from lookup_type t where t.code = v.type_code)`,
        sampleSql: sql`select (v.type_code || ':' || v.code) as key from lookup_value v where not exists (select 1 from lookup_type t where t.code = v.type_code) limit 8`,
      },
      {
        id: 'reservation_orphan_account',
        title: 'Reservations linked to an account that no longer exists',
        severity: 'medium',
        countSql: sql`select count(*)::int as n from reservation r where r.account_id is not null and not exists (select 1 from account a where a.id = r.account_id)`,
        sampleSql: sql`select r.reference as key from reservation r where r.account_id is not null and not exists (select 1 from account a where a.id = r.account_id) limit 8`,
      },
      {
        id: 'config_never_published',
        title: 'Config settings that have revisions but nothing published',
        severity: 'low',
        countSql: sql`select count(*)::int as n from (select kind, key from config_version group by kind, key having bool_and(state <> 'published') and bool_or(state <> 'draft')) q`,
        sampleSql: sql`select (kind || ':' || key) as key from config_version group by kind, key having bool_and(state <> 'published') and bool_or(state <> 'draft') limit 8`,
      },
      {
        id: 'recovery_case_stale',
        title: 'Recovery cases open longer than 14 days',
        severity: 'medium',
        countSql: sql`select count(*)::int as n from recovery_case where state <> 'resolved' and created_at < now() - interval '14 days'`,
        sampleSql: sql`select (kind || ' · ' || subject_ref) as key from recovery_case where state <> 'resolved' and created_at < now() - interval '14 days' limit 8`,
      },
    ];

    const checks = await Promise.all(
      CHECKS.map(async (c) => {
        const countRows = await this.db.execute<{ n: number }>(c.countSql);
        const count = Number(countRows[0]?.n ?? 0);
        const sample =
          count > 0 ? (await this.db.execute<{ key: string }>(c.sampleSql)).map((r) => r.key) : [];
        return { id: c.id, title: c.title, severity: c.severity, count, ok: count === 0, sample };
      }),
    );

    return {
      checkedAt: new Date().toISOString(),
      ok: checks.every((c) => c.ok),
      checks,
    };
  }
}
