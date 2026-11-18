/* @license Enterprise */

import {
  type ApplicationBillingPrice,
  isApplicationBillingPrice,
} from 'twenty-shared/application';
import { isDefined } from 'twenty-shared/utils';

import { ApplicationRegistrationSourceType } from 'src/engine/core-modules/application/application-registration/enums/application-registration-source-type.enum';
import { type FlatApplication } from 'src/engine/core-modules/application/types/flat-application.type';

export type DeclaredApplicationPrice = {
  applicationId: string;
  applicationUniversalIdentifier: string;
  applicationName: string;
  price: ApplicationBillingPrice;
};

// `billing` is jsonb persisted without a shape check, so prices are validated here, before they reach Stripe.
export const collectDeclaredApplicationPrices = ({
  flatApplicationMaps,
}: {
  flatApplicationMaps: {
    byId: Partial<
      Record<
        string,
        Pick<
          FlatApplication,
          | 'id'
          | 'universalIdentifier'
          | 'name'
          | 'version'
          | 'sourceType'
          | 'deletedAt'
          | 'billing'
        >
      >
    >;
  };
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
        applicationId: application.id,
        applicationUniversalIdentifier: application.universalIdentifier,
        applicationName: application.name,
        price,
      }));
    });
