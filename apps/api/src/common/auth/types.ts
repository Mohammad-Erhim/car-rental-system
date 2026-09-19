/** The authenticated principal for a request. Built by AuthGuard, read via @CurrentActor(). */
export interface Actor {
  accountId: string;
  kind: 'customer' | 'staff';
  audience: 'customer' | 'staff';
  displayName: string;
  localeCode: string;
  /** staff only */
  staffProfileId?: string;
  organizationId?: string;
  /** resolved permission action codes (staff); empty for customers */
  permissions: string[];
  roleCodes: string[];
  /** location ids the staff member is scoped to; empty = org-wide within their roles */
  locationScope: string[];
  /** per-action limits from the roles granting them, e.g. the largest refund (`amountMinorMax`) */
  permissionConditions: Record<string, { amountMinorMax?: number }>;
  /** when the account last did a full password auth — for step-up checks */
  lastFullAuthAt?: string;
  /** the access token's jti, for correlation */
  tokenId: string;
}

export interface AnonymousActor {
  kind: 'anonymous';
}

export type MaybeActor = Actor | AnonymousActor;

export function isAuthenticated(a: MaybeActor | undefined): a is Actor {
  return !!a && a.kind !== 'anonymous';
}

/** Authorization scope object required by repository queries (SRS-SEC-008). */
export interface AuthScope {
  organizationId?: string;
  locationIds?: string[];
  /** true only for explicit global-admin permissions */
  global: boolean;
}
