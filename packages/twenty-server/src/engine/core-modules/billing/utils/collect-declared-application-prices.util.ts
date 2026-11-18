/* @license Enterprise */

import {
  type ApplicationBillingPrice,
  isApplicationBillingPrice,
} from 'twenty-shared/application';
import { isDefined } from 'twenty-shared/utils';

import { ApplicationRegistrationSourceType } from 'src/engine/core-modules/application/application-registration/enums/application-registration-source-type.enum';
import { type FlatApplicationCacheMaps } from 'src/engine/core-modules/application/types/flat-application-cache-maps.type';

export type DeclaredApplicationPrice = {
  applicationUniversalIdentifier: string;
  applicationName: string;
  price: ApplicationBillingPrice;
};

// `billing` is jsonb persisted without a shape check, so prices are validated here, before they reach Stripe.
// An application is billed once its install completed (version set), and never while synced from a local source.
export const collectDeclaredApplicationPrices = ({
  flatApplicationMaps,
}: {
  flatApplicationMaps: FlatApplicationCacheMaps;
}): DeclaredApplicationPrice[] =>
  Object.values(flatApplicationMaps.byId)
    .filter(isDefined)
    .filter(
      (application) =>
        !isDefined(application.deletedAt) &&
        isDefined(application.version) &&
        application.sourceType !== ApplicationRegistrationSourceType.LOCAL,
    )
    .flatMap((application) => {
      const prices: unknown = application.billing?.prices;

      if (!Array.isArray(prices)) {
        return [];
      }

      const pricesByUniversalIdentifier = new Map(
        prices
          .filter(isApplicationBillingPrice)
          .map((price) => [price.universalIdentifier, price]),
      );

      return [...pricesByUniversalIdentifier.values()].map((price) => ({
        applicationUniversalIdentifier: application.universalIdentifier,
        applicationName: application.name,
        price,
      }));
    });
