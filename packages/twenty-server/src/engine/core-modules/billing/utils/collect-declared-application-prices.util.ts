/* @license Enterprise */

import {
  type ApplicationBillingPrice,
  isApplicationBillingPrice,
} from 'twenty-shared/application';
import { isDefined } from 'twenty-shared/utils';

import { ApplicationRegistrationSourceType } from 'src/engine/core-modules/application/application-registration/enums/application-registration-source-type.enum';
import { type FlatApplication } from 'src/engine/core-modules/application/types/flat-application.type';

export type DeclaredApplicationPrice = {
  applicationUniversalIdentifier: string;
  applicationName: string;
  price: ApplicationBillingPrice;
};

export const collectDeclaredApplicationPrices = ({
  flatApplicationMaps,
}: {
  flatApplicationMaps: {
    byId: Partial<
      Record<
        string,
        Pick<
          FlatApplication,
          | 'universalIdentifier'
          | 'name'
          | 'version'
          | 'sourceType'
          | 'deletedAt'
          | 'acceptedBillingPrices'
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
      const prices: unknown = application.acceptedBillingPrices;

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
