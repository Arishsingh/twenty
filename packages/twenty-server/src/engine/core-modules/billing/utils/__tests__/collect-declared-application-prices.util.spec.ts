import { type ApplicationBillingPrice } from 'twenty-shared/application';

import { ApplicationRegistrationSourceType } from 'src/engine/core-modules/application/application-registration/enums/application-registration-source-type.enum';
import { collectDeclaredApplicationPrices } from 'src/engine/core-modules/billing/utils/collect-declared-application-prices.util';

type BillableApplication = NonNullable<
  Parameters<
    typeof collectDeclaredApplicationPrices
  >[0]['flatApplicationMaps']['byId'][string]
>;

const price: ApplicationBillingPrice = {
  universalIdentifier: 'b7e41d08-2a93-4f5c-8d16-0c9e3b5a7f21',
  label: 'Per member',
  type: 'RECURRING',
  billingPeriod: 'MONTHLY',
  amountCents: 1000,
  per: 'WORKSPACE_MEMBER',
};

const application: BillableApplication = {
  id: 'application-id',
  universalIdentifier: 'application-universal-identifier',
  name: 'LinkedIn',
  version: '1.0.0',
  sourceType: ApplicationRegistrationSourceType.NPM,
  deletedAt: null,
  billing: { prices: [price] },
};

const collect = (overrides: Partial<BillableApplication>) =>
  collectDeclaredApplicationPrices({
    flatApplicationMaps: {
      byId: { application: { ...application, ...overrides } },
    },
  });

describe('collectDeclaredApplicationPrices', () => {
  it('collects the prices of an installed application', () => {
    expect(collect({})).toEqual([
      {
        applicationId: 'application-id',
        applicationUniversalIdentifier: 'application-universal-identifier',
        applicationName: 'LinkedIn',
        price,
      },
    ]);
  });

  it('leaves out a malformed price', () => {
    expect(
      collect({ billing: { prices: [{ ...price, amountCents: -1 }, price] } }),
    ).toHaveLength(1);
  });

  it('keeps one price per universal identifier', () => {
    expect(collect({ billing: { prices: [price, price] } })).toHaveLength(1);
  });

  it.each<[string, Partial<BillableApplication>]>([
    ['is deleted', { deletedAt: new Date() }],
    ['has not completed its install', { version: null }],
    [
      'is synced from a local source',
      { sourceType: ApplicationRegistrationSourceType.LOCAL },
    ],
    ['declares no price', { billing: {} }],
  ])('collects nothing when the application %s', (_, overrides) => {
    expect(collect(overrides)).toEqual([]);
  });
});
