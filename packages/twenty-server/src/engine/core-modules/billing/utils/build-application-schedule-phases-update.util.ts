/* @license Enterprise */

import { isDefined } from 'twenty-shared/utils';

import type Stripe from 'stripe';

import { isSamePhaseSignature } from 'src/engine/core-modules/billing/utils/is-same-phase-signature.util';

type Phase = Stripe.SubscriptionScheduleUpdateParams.Phase;

// An item added on the subscription alone is dropped when the schedule moves to its next phase.
export const buildApplicationSchedulePhasesUpdate = ({
  currentPhase,
  nextPhase,
  applicationPriceIds,
  applicationItems,
  subscriptionCurrentPeriodEnd,
}: {
  currentPhase: Phase;
  nextPhase: Phase;
  applicationPriceIds: Set<string>;
  applicationItems: { price: string; quantity: number }[];
  subscriptionCurrentPeriodEnd: number;
}): Phase[] | undefined => {
  const toUpdateNextPhase: Phase = {
    start_date: subscriptionCurrentPeriodEnd,
    proration_behavior: 'none',
    items: [
      ...(nextPhase.items ?? []).filter(
        ({ price }) => !isDefined(price) || !applicationPriceIds.has(price),
      ),
      ...applicationItems,
    ],
  };

  if (isSamePhaseSignature(nextPhase, toUpdateNextPhase)) {
    return undefined;
  }

  return [
    { ...currentPhase, end_date: subscriptionCurrentPeriodEnd },
    toUpdateNextPhase,
  ];
};
