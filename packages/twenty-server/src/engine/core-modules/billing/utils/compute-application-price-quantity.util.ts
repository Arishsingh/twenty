/* @license Enterprise */

import { type ApplicationBillingPrice } from 'twenty-shared/application';
import { assertUnreachable } from 'twenty-shared/utils';

export const computeApplicationPriceQuantity = ({
  per,
  workspaceMemberCount,
  connectedAccountCount,
}: {
  per: ApplicationBillingPrice['per'];
  workspaceMemberCount: number;
  connectedAccountCount: number;
}): number => {
  switch (per) {
    case undefined:
      return 1;
    case 'WORKSPACE_MEMBER':
      return workspaceMemberCount;
    case 'CONNECTED_ACCOUNT':
      return connectedAccountCount;
    default:
      return assertUnreachable(per);
  }
};
