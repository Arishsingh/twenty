/* @license Enterprise */

import { type ApplicationSubscriptionItem } from 'src/engine/core-modules/billing/types/subscription-stripe-prices.type';

export const isSameApplicationItems = (
  applicationItems: ApplicationSubscriptionItem[],
  otherApplicationItems: ApplicationSubscriptionItem[],
): boolean =>
  applicationItems.length === otherApplicationItems.length &&
  applicationItems.every(({ stripeProductId, stripePriceId, quantity }) =>
    otherApplicationItems.some(
      (item) =>
        item.stripeProductId === stripeProductId &&
        item.stripePriceId === stripePriceId &&
        item.quantity === quantity,
    ),
  );
