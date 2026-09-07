import type { HealthSummary, LocalesResponse } from '@carrental/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';

import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { locale } from '../../database/schema/i18n';
import { HealthService } from '../../observability/health.service';

@Injectable()
export class MetaService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly health: HealthService,
  ) {}

  /** Enabled locales come from the DB, not a bundled array (FR-GBL-004, SRS-I18N-001). */
  async locales(): Promise<LocalesResponse> {
    const rows = await this.db
      .select()
      .from(locale)
      .where(eq(locale.isActive, true))
      .orderBy(asc(locale.sortOrder), asc(locale.code));

    const defaultRow = rows.find((r) => r.isDefault) ?? rows[0];

    return {
      defaultLocale: defaultRow?.code ?? 'en',
      locales: rows.map((r) => ({
        code: r.code,
        nativeName: r.nativeName,
        englishName: r.englishName,
        direction: r.direction === 'rtl' ? 'rtl' : 'ltr',
        isDefault: r.isDefault,
        fallback: r.fallbackChain,
        testOnly: r.testOnly,
      })),
    };
  }

  build() {
    return this.health.version();
  }

  /** Coarse, safe status for the UI status bar (FR-GBL-005). */
  async healthSummary(): Promise<HealthSummary> {
    const readiness = await this.health.readiness();
    return {
      status: readiness.status,
      checkedAt: new Date().toISOString(),
      components: Object.entries(readiness.checks).map(([name, c]) => ({
        name,
        status: c.status,
      })),
    };
  }
}
