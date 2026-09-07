import { Inject, Body, Controller, Get, Header, Param, Post, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';

import { CurrentActor } from '../../common/auth/auth.guard';
import { Permissions } from '../../common/auth/permissions.guard';
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
  kind: z.enum(['policy', 'pricing', 'product', 'location']),
  key: z.string().min(1).max(60),
  payload: z.record(z.unknown()),
  note: z.string().max(1000).optional(),
});
const zPreview = z.object({ kind: z.string().max(40), payload: z.record(z.unknown()) });
const zNote = z.object({ note: z.string().min(1).max(1000) });

@ApiTags('admin')
@Controller({ path: 'ops', version: '1' })
export class ReportController {
  constructor(
    private readonly reports: ReportService,
    private readonly config: ConfigVersionService,
    @Inject(DB) private readonly db: Database,
  ) {}

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
    return this.config.preview(body.kind, body.payload);
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
}
