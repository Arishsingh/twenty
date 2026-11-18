/* @license Enterprise */

import { createHash } from 'crypto';

import { type ApplicationBillingPrice } from 'twenty-shared/application';

import { DEFAULT_APPLICATION_PRICE_CURRENCY } from 'src/engine/core-modules/billing/constants/default-application-price-currency.constant';

// A Stripe price is immutable, so the amount is part of the identity: a changed amount is a new product.
export const buildApplicationStripeProductId = ({
  applicationUniversalIdentifier,
  price,
}: {
  applicationUniversalIdentifier: string;
  price: Pick<
    ApplicationBillingPrice,
    'universalIdentifier' | 'amountCents' | 'currency'
  >;
}): string =>
  `app_price_${createHash('sha256')
    .update(
      [
        applicationUniversalIdentifier,
        price.universalIdentifier,
        price.amountCents,
        price.currency ?? DEFAULT_APPLICATION_PRICE_CURRENCY,
      ].join(':'),
    )
    .digest('hex')
    .slice(0, 32)}`;
