import { type ApplicationBilling } from 'twenty-shared/application';

import { resolveSyncedApplicationBilling } from 'src/engine/core-modules/application/utils/resolve-synced-application-billing.util';

const buildBilling = (amountCents: number): ApplicationBilling => ({
  description: 'Platform fee',
  prices: [
    {
      universalIdentifier: 'b7e41d08-2a93-4f5c-8d16-0c9e3b5a7f21',
      label: 'Platform fee',
      type: 'RECURRING',
      billingPeriod: 'MONTHLY',
      amountCents,
    },
  ],
});

describe('resolveSyncedApplicationBilling', () => {
  it('takes the manifest billing once the install completed', () => {
    expect(
      resolveSyncedApplicationBilling({
        currentBilling: buildBilling(1000),
        manifestBilling: buildBilling(10000),
        isInstallCompleted: true,
      }),
    ).toEqual(buildBilling(10000));
  });

  it('keeps the current prices while a new version is installing', () => {
    expect(
      resolveSyncedApplicationBilling({
        currentBilling: buildBilling(1000),
        manifestBilling: {
          ...buildBilling(10000),
          description: 'New platform fee',
        },
        isInstallCompleted: false,
      }),
    ).toEqual({
      description: 'New platform fee',
      prices: buildBilling(1000).prices,
    });
  });

  it('declares no price while a first install is running', () => {
    expect(
      resolveSyncedApplicationBilling({
        currentBilling: {},
        manifestBilling: buildBilling(10000),
        isInstallCompleted: false,
      }).prices,
    ).toBeUndefined();
  });

  it('resolves an empty billing when the manifest declares none', () => {
    expect(
      resolveSyncedApplicationBilling({
        currentBilling: undefined,
        manifestBilling: undefined,
        isInstallCompleted: true,
      }),
    ).toEqual({});
  });
});
