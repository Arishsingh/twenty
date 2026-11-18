/* @license Enterprise */

import { isDefined, isNonEmptyArray } from 'twenty-shared/utils';

import type Stripe from 'stripe';

type ApplicationItem = { price: string; quantity: number };

export const buildApplicationSubscriptionUpdate = ({
  currentItems,
  desiredItems,
  isTrialing,
  isSendInvoice,
}: {
  currentItems: (ApplicationItem & { id: string })[];
  desiredItems: ApplicationItem[];
  isTrialing: boolean;
  isSendInvoice: boolean;
}): Stripe.SubscriptionUpdateParams | undefined => {
  const removedItems = currentItems
    .filter(
      (currentItem) =>
        !desiredItems.some(({ price }) => price === currentItem.price),
    )
    .map(({ id }) => ({ id, deleted: true }));

  const addedItems = desiredItems.filter(
    (desiredItem) =>
      !currentItems.some(({ price }) => price === desiredItem.price),
  );

  const resizedItems = currentItems.flatMap((currentItem) => {
    const desiredQuantity = desiredItems.find(
      ({ price }) => price === currentItem.price,
    )?.quantity;

    return isDefined(desiredQuantity) &&
      desiredQuantity !== currentItem.quantity
      ? [
          {
            id: currentItem.id,
            quantity: desiredQuantity,
            isIncrease: desiredQuantity > currentItem.quantity,
          },
        ]
      : [];
  });

  const items = [
    ...removedItems,
    ...addedItems,
    ...resizedItems.map(({ id, quantity }) => ({ id, quantity })),
  ];

  if (!isNonEmptyArray(items)) {
    return undefined;
  }

  const isIncrease =
    isNonEmptyArray(addedItems) ||
    resizedItems.some(({ isIncrease }) => isIncrease);

  if (isTrialing) {
    return { items, proration_behavior: 'none' };
  }

  return {
    items,
    proration_behavior:
      isIncrease && !isSendInvoice ? 'always_invoice' : 'create_prorations',
  };
};
