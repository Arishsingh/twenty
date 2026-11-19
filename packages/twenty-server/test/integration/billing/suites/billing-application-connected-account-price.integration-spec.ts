import { randomUUID } from 'node:crypto';

import {
  getSeededBillingWorkspaceId,
  TEST_STRIPE_SUBSCRIPTION_ID,
} from 'test/integration/billing/utils/billing-credit-fixtures.util';
import { buildBaseManifest } from 'test/integration/metadata/suites/application/utils/build-base-manifest.util';
import { cleanupApplicationAndAppRegistration } from 'test/integration/metadata/suites/application/utils/cleanup-application-and-app-registration.util';
import { setupApplicationForSync } from 'test/integration/metadata/suites/application/utils/setup-application-for-sync.util';
import { syncApplication } from 'test/integration/metadata/suites/application/utils/sync-application.util';
import { findConnectionProvidersByApplication } from 'test/integration/metadata/suites/connection-provider/utils/find-connection-providers-by-application.util';
import { getAppProviderByClassName } from 'test/integration/utils/get-app-provider-by-class-name.util';
import {
  deleteConnectedAccount,
  disconnectConnectedAccount,
} from 'test/integration/utils/query-messaging.util';
import { waitForAllJobsToFinish } from 'test/integration/utils/wait-for-all-jobs-to-finish.util';
import { type ApplicationBillingPrice } from 'twenty-shared/application';
import { ConnectedAccountProvider, FeatureFlagKey } from 'twenty-shared/types';

import type Stripe from 'stripe';

import { type ConnectionProviderConnectedAccountService } from 'src/engine/core-modules/application/connection-provider/connection-provider-connected-account.service';
import { type AppOAuthRevokeService } from 'src/engine/core-modules/application/connection-provider/refresh/services/app-oauth-revoke.service';
import { type BillingApplicationSubscriptionService } from 'src/engine/core-modules/billing/services/billing-application-subscription.service';
import { type BillingSubscriptionService } from 'src/engine/core-modules/billing/services/billing-subscription.service';
import { type StripeSubscriptionItemService } from 'src/engine/core-modules/billing/stripe/services/stripe-subscription-item.service';
import { type StripeSubscriptionScheduleService } from 'src/engine/core-modules/billing/stripe/services/stripe-subscription-schedule.service';
import { type StripeSubscriptionService } from 'src/engine/core-modules/billing/stripe/services/stripe-subscription.service';
import { buildApplicationStripeProductId } from 'src/engine/core-modules/billing/utils/build-application-stripe-product-id.util';
import { type FeatureFlagService } from 'src/engine/core-modules/feature-flag/services/feature-flag.service';
import { type WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

type StripeItem = { id: string; price: { id: string }; quantity: number };

const PRICE: ApplicationBillingPrice = {
  universalIdentifier: '6f0d2c1e-8a47-4b93-9e15-3c7d5a2b4f80',
  label: 'Per connected account',
  type: 'RECURRING',
  billingPeriod: 'MONTHLY',
  amountCents: 1000,
  per: 'CONNECTED_ACCOUNT',
};

const query = async <TRow>(
  sql: string,
  params: unknown[] = [],
): Promise<TRow[]> => globalThis.testDataSource.query(sql, params);

describe('Application price per connected account (integration)', () => {
  let workspaceId: string;
  let appId: string;
  let stripeProductId: string;
  let monthPriceId: string;
  let stripeItems: StripeItem[];
  let updateSubscriptionSpy: jest.SpyInstance;
  let spies: jest.SpyInstance[];

  const findApplicationItem = () =>
    stripeItems.find(({ price }) => price.id === monthPriceId);

  const connectAccount = async ({
    handle,
    reconnectingConnectedAccountId = null,
  }: {
    handle: string;
    reconnectingConnectedAccountId?: string | null;
  }): Promise<string> => {
    const [provider] = await findConnectionProvidersByApplication(appId);
    const [userWorkspace] = await query<{ id: string; userId: string }>(
      `SELECT id, "userId" FROM core."userWorkspace" WHERE "workspaceId" = $1 LIMIT 1`,
      [workspaceId],
    );

    const connectedAccount =
      await getAppProviderByClassName<ConnectionProviderConnectedAccountService>(
        'ConnectionProviderConnectedAccountService',
      ).persist({
        provider,
        credentials: undefined,
        handle,
        identifiedAccount: null,
        workspaceId,
        userId: userWorkspace.userId,
        userWorkspaceId: userWorkspace.id,
        scope: 'WORKSPACE',
        reconnectingConnectedAccountId,
      });

    await waitForAllJobsToFinish();

    return connectedAccount.id;
  };

  const insertConnectedAccount = async ({
    applicationId,
    archivedAt = null,
  }: {
    applicationId: string;
    archivedAt?: Date | null;
  }): Promise<void> => {
    const [userWorkspace] = await query<{ id: string }>(
      `SELECT id FROM core."userWorkspace" WHERE "workspaceId" = $1 LIMIT 1`,
      [workspaceId],
    );

    await query(
      `INSERT INTO core."connectedAccount"
         (id, handle, provider, scope, "workspaceId", "userWorkspaceId", "applicationId", "archivedAt")
       VALUES ($1, $2, $3, 'WORKSPACE', $4, $5, $6, $7)`,
      [
        randomUUID(),
        `not-billed-${randomUUID()}@apple.dev`,
        ConnectedAccountProvider.APP,
        workspaceId,
        userWorkspace.id,
        applicationId,
        archivedAt,
      ],
    );
  };

  beforeEach(async () => {
    workspaceId = await getSeededBillingWorkspaceId();
    appId = randomUUID();
    stripeProductId = buildApplicationStripeProductId({
      applicationUniversalIdentifier: appId,
      price: PRICE,
    });
    monthPriceId = `price_month_${stripeProductId}`;
    stripeItems = [];

    await setupApplicationForSync({
      applicationUniversalIdentifier: appId,
      name: 'Test Application',
      description: 'App billed per connected account',
      sourcePath: 'test-connected-account-price',
    });

    jest.useRealTimers();

    const baseManifest = buildBaseManifest({ appId, roleId: randomUUID() });

    await syncApplication({
      manifest: {
        ...baseManifest,
        connectionProviders: [
          {
            universalIdentifier: randomUUID(),
            name: 'fathom',
            displayName: 'Fathom',
            type: 'oauth',
            oauth: {
              authorizationEndpoint: 'https://fathom.video/oauth2/authorize',
              tokenEndpoint: 'https://api.fathom.ai/oauth2/token',
              scopes: ['public_api'],
              clientIdVariable: 'FATHOM_CLIENT_ID',
              clientSecretVariable: 'FATHOM_CLIENT_SECRET',
            },
          },
        ],
      },
      expectToFail: false,
    });

    await query(
      `UPDATE core."application"
       SET "sourceType" = 'npm', version = '1.0.0', "acceptedBillingPrices" = $3::jsonb
       WHERE "universalIdentifier" = $1 AND "workspaceId" = $2`,
      [appId, workspaceId, JSON.stringify([PRICE])],
    );
    await query(
      `UPDATE core."billingSubscription" SET interval = 'month', status = 'active'
       WHERE "stripeSubscriptionId" = $1`,
      [TEST_STRIPE_SUBSCRIPTION_ID],
    );
    await query(
      `INSERT INTO core."billingProduct" ("stripeProductId", active, name, description, metadata)
       VALUES ($1, true, 'Test Application - Per connected account', '', $2)`,
      [
        stripeProductId,
        JSON.stringify({
          productKey: 'APPLICATION',
          priceUsageBased: 'LICENSED',
        }),
      ],
    );
    await query(
      `INSERT INTO core."billingPrice"
         ("stripePriceId", "stripeProductId", active, currency, "taxBehavior",
          type, "billingScheme", "usageType", interval, "unitAmount", metadata)
       VALUES ($1, $3, true, 'usd', 'UNSPECIFIED', 'RECURRING', 'PER_UNIT', 'LICENSED', 'month', 1000, '{}'),
              ($2, $3, true, 'usd', 'UNSPECIFIED', 'RECURRING', 'PER_UNIT', 'LICENSED', 'year', 12000, '{}')`,
      [monthPriceId, `price_year_${stripeProductId}`, stripeProductId],
    );

    await getAppProviderByClassName<FeatureFlagService>(
      'FeatureFlagService',
    ).enableFeatureFlags(
      [FeatureFlagKey.IS_APPLICATION_PRICE_BILLING_ENABLED],
      workspaceId,
    );
    await getAppProviderByClassName<WorkspaceCacheService>(
      'WorkspaceCacheService',
    ).invalidateAndRecompute(workspaceId, ['flatApplicationMaps']);

    const buildStripeSubscription = () =>
      ({
        id: TEST_STRIPE_SUBSCRIPTION_ID,
        items: { data: stripeItems },
      }) as unknown as Stripe.Subscription;

    updateSubscriptionSpy = jest
      .spyOn(
        getAppProviderByClassName<StripeSubscriptionService>(
          'StripeSubscriptionService',
        ),
        'updateSubscription',
      )
      .mockImplementation(async (_stripeSubscriptionId, { items = [] }) => {
        for (const item of items) {
          if (item.deleted === true) {
            stripeItems = stripeItems.filter(({ id }) => id !== item.id);
            continue;
          }

          const existingItem = stripeItems.find(({ id }) => id === item.id);

          if (existingItem) {
            existingItem.quantity = item.quantity ?? existingItem.quantity;
            continue;
          }

          stripeItems.push({
            id: `si_${randomUUID()}`,
            price: { id: item.price ?? '' },
            quantity: item.quantity ?? 1,
          });
        }

        return buildStripeSubscription();
      });

    spies = [
      updateSubscriptionSpy,
      jest
        .spyOn(
          getAppProviderByClassName<StripeSubscriptionScheduleService>(
            'StripeSubscriptionScheduleService',
          ),
          'loadSubscriptionSchedule',
        )
        .mockImplementation(
          async () =>
            ({ subscription: buildStripeSubscription() }) as Awaited<
              ReturnType<
                StripeSubscriptionScheduleService['loadSubscriptionSchedule']
              >
            >,
        ),
      jest
        .spyOn(
          getAppProviderByClassName<StripeSubscriptionItemService>(
            'StripeSubscriptionItemService',
          ),
          'listSubscriptionItems',
        )
        .mockImplementation(
          async () => stripeItems as unknown as Stripe.SubscriptionItem[],
        ),
      jest
        .spyOn(
          getAppProviderByClassName<BillingSubscriptionService>(
            'BillingSubscriptionService',
          ),
          'syncSubscriptionToDatabase',
        )
        .mockImplementation(
          async () =>
            ({}) as Awaited<
              ReturnType<
                BillingSubscriptionService['syncSubscriptionToDatabase']
              >
            >,
        ),
      jest
        .spyOn(
          getAppProviderByClassName<AppOAuthRevokeService>(
            'AppOAuthRevokeService',
          ),
          'revokeIfApp',
        )
        .mockResolvedValue(undefined),
    ];
  }, 120000);

  afterEach(async () => {
    await waitForAllJobsToFinish();
    spies.forEach((spy) => spy.mockRestore());

    await query(
      `DELETE FROM core."connectedAccount" WHERE "workspaceId" = $1 AND handle LIKE '%@apple.dev' AND provider = $2`,
      [workspaceId, ConnectedAccountProvider.APP],
    );
    await query(
      `DELETE FROM core."billingPrice" WHERE "stripeProductId" = $1`,
      [stripeProductId],
    );
    await query(
      `DELETE FROM core."billingProduct" WHERE "stripeProductId" = $1`,
      [stripeProductId],
    );
    await query(
      `DELETE FROM core."featureFlag" WHERE "workspaceId" = $1 AND key = $2`,
      [workspaceId, FeatureFlagKey.IS_APPLICATION_PRICE_BILLING_ENABLED],
    );
    await getAppProviderByClassName<WorkspaceCacheService>(
      'WorkspaceCacheService',
    ).invalidateAndRecompute(workspaceId, ['featureFlagsMap']);
    await query(
      `UPDATE core."application" SET "sourceType" = 'local'
       WHERE "universalIdentifier" = $1 AND "workspaceId" = $2`,
      [appId, workspaceId],
    );
    await cleanupApplicationAndAppRegistration({
      applicationUniversalIdentifier: appId,
    });
  }, 120000);

  it('bills each connected account of the application and stops with the last one', async () => {
    const firstConnectedAccountId = await connectAccount({
      handle: 'first-linkedin@apple.dev',
    });

    expect(findApplicationItem()?.quantity).toBe(1);

    const secondConnectedAccountId = await connectAccount({
      handle: 'second-linkedin@apple.dev',
    });

    expect(findApplicationItem()?.quantity).toBe(2);

    const updateCallCount = updateSubscriptionSpy.mock.calls.length;

    await connectAccount({
      handle: 'first-linkedin@apple.dev',
      reconnectingConnectedAccountId: firstConnectedAccountId,
    });

    expect(findApplicationItem()?.quantity).toBe(2);
    expect(updateSubscriptionSpy).toHaveBeenCalledTimes(updateCallCount);

    const [application] = await query<{ id: string }>(
      `SELECT id FROM core."application" WHERE "universalIdentifier" = $1 AND "workspaceId" = $2`,
      [appId, workspaceId],
    );
    const [otherApplication] = await query<{ id: string }>(
      `SELECT id FROM core."application" WHERE "workspaceId" = $1 AND id <> $2 LIMIT 1`,
      [workspaceId, application.id],
    );

    await insertConnectedAccount({
      applicationId: application.id,
      archivedAt: new Date(),
    });
    await insertConnectedAccount({ applicationId: otherApplication.id });

    await getAppProviderByClassName<BillingApplicationSubscriptionService>(
      'BillingApplicationSubscriptionService',
    ).syncApplicationItems(workspaceId);

    expect(findApplicationItem()?.quantity).toBe(2);

    await disconnectConnectedAccount(firstConnectedAccountId);
    await waitForAllJobsToFinish();

    expect(findApplicationItem()?.quantity).toBe(1);

    await deleteConnectedAccount(secondConnectedAccountId);

    expect(findApplicationItem()).toBeUndefined();
    expect(updateSubscriptionSpy).toHaveBeenLastCalledWith(
      TEST_STRIPE_SUBSCRIPTION_ID,
      expect.objectContaining({
        items: [expect.objectContaining({ deleted: true })],
      }),
    );
  }, 120000);
});
