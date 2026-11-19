/* @license Enterprise */

import { SubscriptionStatus } from 'src/engine/core-modules/billing/enums/billing-subscription-status.enum';

export const INCOMPLETE_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.Incomplete,
  SubscriptionStatus.IncompleteExpired,
];
