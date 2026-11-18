import { type ApplicationBilling } from 'twenty-shared/application';

// Prices are charged in real currency, so a version still installing never replaces the ones the workspace runs.
export const resolveSyncedApplicationBilling = ({
  currentBilling,
  manifestBilling,
  isInstallCompleted,
}: {
  currentBilling: Pick<ApplicationBilling, 'prices'> | undefined;
  manifestBilling: ApplicationBilling | undefined;
  isInstallCompleted: boolean;
}): ApplicationBilling =>
  isInstallCompleted
    ? (manifestBilling ?? {})
    : { ...manifestBilling, prices: currentBilling?.prices };
