import {
  CONSENT_POLICY_VERSION,
  type ConsentSubmitRequest,
  type ConsentSubmitResponse,
} from '@carrental/contracts';
import { Injectable } from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service';

/** Reduce an IP to a coarse prefix so the audit note keeps locality without storing the address. */
function ipPrefix(ip: string | undefined): string | null {
  if (!ip) return null;
  const v4 = ip.replace(/^::ffff:/, '');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v4)) return v4.split('.').slice(0, 3).join('.') + '.0/24';
  if (v4.includes(':')) return v4.split(':').slice(0, 4).join(':') + '::/64';
  return null;
}

@Injectable()
export class ConsentService {
  constructor(private readonly audit: AuditService) {}

  async record(
    body: ConsentSubmitRequest,
    meta: { ip?: string; userAgent?: string },
  ): Promise<ConsentSubmitResponse> {
    const staleVersion = body.policyVersion !== CONSENT_POLICY_VERSION;
    await this.audit.record({
      action: 'privacy.consent.captured',
      targetType: 'consent',
      targetId: body.anonymousId,
      surface: 'app-cweb',
      after: {
        action: body.action,
        choices: body.choices,
        policyVersion: body.policyVersion,
        currentPolicyVersion: CONSENT_POLICY_VERSION,
        staleVersion,
        locale: body.locale,
        page: body.page ?? null,
        ipPrefix: ipPrefix(meta.ip),
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
      },
    });
    return { recorded: true, policyVersion: CONSENT_POLICY_VERSION };
  }
}
