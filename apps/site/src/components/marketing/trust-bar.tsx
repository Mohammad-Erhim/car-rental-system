import { BadgeCheck, Clock, MapPinned, Wallet } from 'lucide-react';

import type { Translate } from './section';

const ITEMS = [
  { Icon: BadgeCheck, key: 'cancel' },
  { Icon: Wallet, key: 'price' },
  { Icon: Clock, key: 'support' },
  { Icon: MapPinned, key: 'locations' },
] as const;

/** Four short promises directly under the booking card — reassurance before the scroll. */
export function TrustBar({ t }: { t: Translate }) {
  return (
    <div className="mkt-container pt-10 md:pt-14">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ITEMS.map(({ Icon, key }) => (
          <li
            key={key}
            className="flex items-start gap-3 rounded-2xl border border-hairline bg-surface p-5 shadow-card"
          >
            <span className="icon-chip" aria-hidden="true">
              <Icon className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">{t(`site.home.trust.${key}.title`)}</p>
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-muted">
                {t(`site.home.trust.${key}.text`)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
