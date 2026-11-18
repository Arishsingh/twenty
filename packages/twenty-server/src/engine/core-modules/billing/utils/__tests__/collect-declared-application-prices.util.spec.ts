import { ApplicationRegistrationSourceType } from 'src/engine/core-modules/application/application-registration/enums/application-registration-source-type.enum';
import { type FlatApplicationCacheMaps } from 'src/engine/core-modules/application/types/flat-application-cache-maps.type';
import { type FlatApplication } from 'src/engine/core-modules/application/types/flat-application.type';
import { collectDeclaredApplicationPrices } from 'src/engine/core-modules/billing/utils/collect-declared-application-prices.util';

const price = {
  universalIdentifier: 'b7e41d08-2a93-4f5c-8d16-0c9e3b5a7f21',
  label: 'Per member',
  type: 'RECURRING',
  billingPeriod: 'MONTHLY',
  amountCents: 1000,
  per: 'WORKSPACE_MEMBER',
};

const collect = (application: Record<string, unknown>) =>
  collectDeclaredApplicationPrices({
    flatApplicationMaps: {
      byId: {
        application: {
          universalIdentifier: 'application-universal-identifier',
          name: 'LinkedIn',
          version: '1.0.0',
          sourceType: ApplicationRegistrationSourceType.NPM,
          billing: { prices: [price] },
          ...application,
        } as unknown as FlatApplication,
      },
      idByUniversalIdentifier: {},
    } satisfies FlatApplicationCacheMaps,
  });

describe('collectDeclaredApplicationPrices', () => {
  it('collects the prices of an installed application', () => {
    expect(collect({})).toEqual([
      {
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

  it.each([
    ['is deleted', { deletedAt: new Date() }],
    ['has not completed its install', { version: null }],
    ['is synced from a local source', { sourceType: 'local' }],
    ['declares no price', { billing: {} }],
    ['declares prices that are not a list', { billing: { prices: price } }],
  ])('collects nothing when the application %s', (_, application) => {
    expect(collect(application)).toEqual([]);
  });
});
