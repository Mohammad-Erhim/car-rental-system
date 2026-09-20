import { Body, Controller, Delete, Get, Param, Post, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';

import { CurrentActor } from '../../common/auth/auth.guard';
import { OrgWide, Permissions } from '../../common/auth/permissions.guard';
import { StepUp } from '../../common/auth/step-up.guard';
import type { Actor } from '../../common/auth/types';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { ConfigVersionService } from '../config/config-version.service';

import { ReportService } from './report.service';

const zRun = z.object({ params: z.record(z.unknown()).optional() });
const zSchedule = z.object({
  definitionCode: z.string().max(60),
  cron: z.string().min(1).max(120),
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
const zActorSearch = z.object({ q: z.string().min(2).max(60) });
// 7 days minimum (a "trend" over less than a week isn't one); 90-day cap to bound the query cost
// of the retroactive-occupancy join in dashboardAnalytics()
const zDashboardAnalytics = z.object({
  days: z.coerce.number().int().min(7).max(90).default(30),
  // narrows *within* the actor's own locationScope — never broadens it. A comma-separated list
  // (the top-bar filter is multi-select); a code outside the actor's scope is a 403.
  locationCode: z.string().max(1000).optional(),
});
const zDashboardQuery = z.object({ locationCode: z.string().max(1000).optional() });
const zAuditQuery = z.object({
  action: z.string().max(100).optional(),
  targetType: z.string().max(60).optional(),
  targetId: z.string().max(120).optional(),
  actorId: z.string().uuid().optional(),
  outcome: z.enum(['accepted', 'rejected', 'failed']).optional(),
  surface: z.string().max(30).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(200).optional(),
});

@ApiTags('admin')
@Controller({ path: 'ops', version: '1' })
export class ReportController {
  constructor(
    private readonly reports: ReportService,
    private readonly config: ConfigVersionService,
  ) {}

  // ---- operational dashboard (SCREEN-OPS-002) ----

  @Get('dashboard')
  @Permissions('reservation.read')
  dashboard(
    @Query(new ZodValidationPipe(zDashboardQuery)) q: z.infer<typeof zDashboardQuery>,
    @CurrentActor() actor: Actor,
  ) {
    return this.reports.opsDashboard(actor, q.locationCode);
  }

  @Get('dashboard/analytics')
  @Permissions('reservation.read')
  dashboardAnalytics(
    @Query(new ZodValidationPipe(zDashboardAnalytics)) q: z.infer<typeof zDashboardAnalytics>,
    @CurrentActor() actor: Actor,
  ) {
    return this.reports.dashboardAnalytics(actor, q.days, q.locationCode);
  }

  // ---- reports ----

  @Get('reports')
  @Permissions('report.read')
  listDefinitions(@CurrentActor() actor: Actor) {
    return this.reports.listDefinitions(actor);
  }

  @Get('reports/runs')
  @Permissions('report.read')
  listRuns(@CurrentActor() actor: Actor, @Query('code') code?: string) {
    return this.reports.listRuns(actor, code);
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
  async exportCsv(
    @Param('runId') runId: string,
    @CurrentActor() actor: Actor,
    @Res({ passthrough: true }) res: Response,
  ) {
    // `@Header()` sets the response header unconditionally, even when the handler throws — a
    // not-found/forbidden run (see canViewRun above) was coming back mislabeled as
    // `Content-Type: text/csv` on a JSON Problem body instead of `application/json`. Setting it
    // by hand, only after the call succeeds, keeps error responses correctly typed.
    const csv = await this.reports.exportCsv(actor, runId);
    res.setHeader('Content-Type', 'text/csv');
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
  @OrgWide()
  @Permissions('config.read', 'config.publish')
  listVersions(
    @CurrentActor() actor: Actor,
    @Query('kind') kind: string,
    @Query('key') key?: string,
  ) {
    return this.config.list(kind, key, actor);
  }

  @Post('config/versions')
  @OrgWide()
  @Permissions('config.publish')
  draft(
    @Body(new ZodValidationPipe(zDraft)) body: z.infer<typeof zDraft>,
    @CurrentActor() actor: Actor,
  ) {
    return this.config.draft(actor, body);
  }

  // read-only dry-run (no write) — config.read alone is correct here, unlike the writes below
  @Post('config/versions/preview')
  @OrgWide()
  @Permissions('config.read', 'config.publish')
  preview(@Body(new ZodValidationPipe(zPreview)) body: z.infer<typeof zPreview>) {
    return this.config.preview(body.kind, body.payload, body.key);
  }

  @Delete('config/versions/:id')
  @Permissions('config.publish')
  removeVersion(@Param('id') id: string, @CurrentActor() actor: Actor) {
    return this.config.remove(actor, id);
  }

  @Post('config/versions/:id/submit')
  @OrgWide()
  @Permissions('config.publish')
  submit(@Param('id') id: string, @CurrentActor() actor: Actor) {
    return this.config.submit(actor, id);
  }

  @Post('config/versions/:id/approve')
  @OrgWide()
  @Permissions('config.publish')
  approve(@Param('id') id: string, @CurrentActor() actor: Actor) {
    return this.config.approve(actor, id);
  }

  @Post('config/versions/:id/reject')
  @OrgWide()
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
  @OrgWide()
  @Permissions('audit.read')
  audit(@Query(new ZodValidationPipe(zAuditQuery)) q: z.infer<typeof zAuditQuery>) {
    return this.reports.auditLog(q);
  }

  // static path — registered before /audit's own params are ever dynamic, but there's no
  // collision risk either way since neither this controller nor `audit` above uses a `:id`
  // segment here.
  @Get('audit/actors')
  @OrgWide()
  @Permissions('audit.read')
  searchActors(@Query(new ZodValidationPipe(zActorSearch)) q: z.infer<typeof zActorSearch>) {
    return this.reports.searchActors(q.q);
  }

  // ---- data quality (SCREEN-OPS-039) ----

  @Get('data-quality')
  @OrgWide()
  @Permissions('audit.read', 'config.read')
  dataQuality() {
    return this.reports.dataQuality();
  }

  // Gated behind `audit.manage`, never `audit.read` — a read permission must never itself unlock
  // a write (SRS-SEC-007; the exact bug class this session's own permission sweep found twice
  // elsewhere in this app).
  @Post('data-quality/:checkId/acknowledge')
  @OrgWide()
  @Permissions('audit.manage')
  acknowledgeFinding(@Param('checkId') checkId: string, @CurrentActor() actor: Actor) {
    return this.reports.acknowledgeFinding(actor, checkId);
  }

  @Post('data-quality/:checkId/resolve')
  @OrgWide()
  @Permissions('audit.manage')
  resolveFinding(
    @Param('checkId') checkId: string,
    @Body(new ZodValidationPipe(zNote)) body: z.infer<typeof zNote>,
    @CurrentActor() actor: Actor,
  ) {
    return this.reports.resolveFinding(actor, checkId, body.note);
  }

  @Post('data-quality/:checkId/false-positive')
  @Permissions('audit.manage')
  markFindingFalsePositive(
    @Param('checkId') checkId: string,
    @Body(new ZodValidationPipe(zNote)) body: z.infer<typeof zNote>,
    @CurrentActor() actor: Actor,
  ) {
    return this.reports.markFindingFalsePositive(actor, checkId, body.note);
  }
}
