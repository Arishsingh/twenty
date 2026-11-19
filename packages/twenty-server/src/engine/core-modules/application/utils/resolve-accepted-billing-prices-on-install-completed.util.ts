import {
  type ApplicationBilling,
  type ApplicationBillingPrice,
} from 'twenty-shared/application';
import { isDefined } from 'twenty-shared/utils';

export const resolveAcceptedBillingPricesOnInstallCompleted = ({
  previousVersion,
  manifestBilling,
}: {
  previousVersion: string | null | undefined;
  manifestBilling: Pick<ApplicationBilling, 'prices'> | undefined;
}): ApplicationBillingPrice[] | undefined =>
  isDefined(previousVersion) ? undefined : (manifestBilling?.prices ?? []);
