/* @license Enterprise */

import { type SubscriptionStripePrices } from 'src/engine/core-modules/billing/types/subscription-stripe-prices.type';

export const isSubscriptionQuantityIncrease = ({
  currentPrices,
  toUpdatePrices,
}: {
  currentPrices: SubscriptionStripePrices;
  toUpdatePrices: SubscriptionStripePrices;
}): boolean =>
  toUpdatePrices.seats > currentPrices.seats ||
  toUpdatePrices.applicationItems.some(
    ({ stripeProductId, quantity }) =>
      quantity >
      (currentPrices.applicationItems.find(
        (item) => item.stripeProductId === stripeProductId,
      )?.quantity ?? 0),
  );
