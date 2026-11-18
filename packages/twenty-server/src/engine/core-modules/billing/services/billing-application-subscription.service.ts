/* @license Enterprise */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import {
  assertIsDefinedOrThrow,
  isDefined,
  isNonEmptyArray,
} from 'twenty-shared/utils';
import { In, Repository } from 'typeorm';

import { BILLING_SUBSCRIPTION_STATE_LOCK_OPTIONS } from 'src/engine/core-modules/billing/constants/billing-subscription-state-lock-options.constant';
import { BillingPriceEntity } from 'src/engine/core-modules/billing/entities/billing-price.entity';
import { BillingSubscriptionItemEntity } from 'src/engine/core-modules/billing/entities/billing-subscription-item.entity';
import { BillingProductKey } from 'src/engine/core-modules/billing/enums/billing-product-key.enum';
import { type SubscriptionInterval } from 'src/engine/core-modules/billing/enums/billing-subscription-interval.enum';
import { SubscriptionStatus } from 'src/engine/core-modules/billing/enums/billing-subscription-status.enum';
import { BillingApplicationProductService } from 'src/engine/core-modules/billing/services/billing-application-product.service';
import { BillingSeatService } from 'src/engine/core-modules/billing/services/billing-seat.service';
import { BillingSubscriptionService } from 'src/engine/core-modules/billing/services/billing-subscription.service';
import { StripeSubscriptionScheduleService } from 'src/engine/core-modules/billing/stripe/services/stripe-subscription-schedule.service';
import { StripeSubscriptionService } from 'src/engine/core-modules/billing/stripe/services/stripe-subscription.service';
import { buildApplicationSchedulePhasesUpdate } from 'src/engine/core-modules/billing/utils/build-application-schedule-phases-update.util';
import { buildApplicationSubscriptionUpdate } from 'src/engine/core-modules/billing/utils/build-application-subscription-update.util';
import { buildBillingSubscriptionUpdateLockKey } from 'src/engine/core-modules/billing/utils/build-billing-subscription-update-lock-key.util';
import { collectDeclaredApplicationPrices } from 'src/engine/core-modules/billing/utils/collect-declared-application-prices.util';
import { findProductPriceForIntervalOrThrow } from 'src/engine/core-modules/billing/utils/find-product-price-for-interval-or-throw.util';
import { isSendInvoiceSubscription } from 'src/engine/core-modules/billing/utils/is-send-invoice-subscription.util';
import { normalizePriceRef } from 'src/engine/core-modules/billing/utils/normalize-price-ref.utils';
import { toPhaseUpdateParams } from 'src/engine/core-modules/billing/utils/to-phase-update-params.util';
import { CacheLockService } from 'src/engine/core-modules/cache-lock/cache-lock.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

@Injectable()
export class BillingApplicationSubscriptionService {
  constructor(
    private readonly twentyConfigService: TwentyConfigService,
    private readonly billingSubscriptionService: BillingSubscriptionService,
    private readonly billingApplicationProductService: BillingApplicationProductService,
    private readonly billingSeatService: BillingSeatService,
    private readonly stripeSubscriptionService: StripeSubscriptionService,
    private readonly stripeSubscriptionScheduleService: StripeSubscriptionScheduleService,
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly cacheLockService: CacheLockService,
    @InjectRepository(BillingPriceEntity)
    private readonly billingPriceRepository: Repository<BillingPriceEntity>,
    @InjectRepository(BillingSubscriptionItemEntity)
    private readonly billingSubscriptionItemRepository: Repository<BillingSubscriptionItemEntity>,
  ) {}

  async syncApplicationItems(workspaceId: string): Promise<void> {
    if (!this.twentyConfigService.get('IS_BILLING_ENABLED')) {
      return;
    }

    await this.cacheLockService.withLock(
      () => this.applyApplicationItemsSync(workspaceId),
      buildBillingSubscriptionUpdateLockKey(workspaceId),
      BILLING_SUBSCRIPTION_STATE_LOCK_OPTIONS,
    );
  }

  private async applyApplicationItemsSync(workspaceId: string): Promise<void> {
    const billingSubscription =
      await this.billingSubscriptionService.getCurrentBillingSubscription({
        workspaceId,
      });

    if (!isDefined(billingSubscription)) {
      return;
    }

    const { flatApplicationMaps } =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        'flatApplicationMaps',
      ]);

    const declaredPrices = collectDeclaredApplicationPrices({
      flatApplicationMaps,
    });

    const applicationBillingSubscriptionItems =
      billingSubscription.billingSubscriptionItems.filter(
        (item) =>
          item.billingProduct?.metadata?.productKey ===
          BillingProductKey.APPLICATION,
      );

    if (
      !isNonEmptyArray(declaredPrices) &&
      !isNonEmptyArray(applicationBillingSubscriptionItems)
    ) {
      return;
    }

    const workspaceMemberCount = declaredPrices.some(
      ({ price }) => price.per === 'WORKSPACE_MEMBER',
    )
      ? await this.billingSeatService.countWorkspaceMembers(workspaceId)
      : 0;

    const applicationProducts = await Promise.all(
      declaredPrices.map(async (declaredPrice) => ({
        billingProduct:
          await this.billingApplicationProductService.getOrCreateProduct(
            declaredPrice,
          ),
        quantity:
          declaredPrice.price.per === 'WORKSPACE_MEMBER'
            ? workspaceMemberCount
            : 1,
      })),
    );

    const buildApplicationItems = (interval: SubscriptionInterval) =>
      applicationProducts.map(({ billingProduct, quantity }) => ({
        price: findProductPriceForIntervalOrThrow(billingProduct, interval)
          .stripePriceId,
        quantity,
      }));

    const {
      subscription: stripeSubscription,
      schedule,
      nextPhase,
    } = await this.stripeSubscriptionScheduleService.loadSubscriptionSchedule(
      billingSubscription.stripeSubscriptionId,
    );

    const nextPhasePriceIds = (nextPhase?.items ?? []).map(({ price }) =>
      normalizePriceRef(price),
    );

    const itemPrices = await this.billingPriceRepository.find({
      where: {
        stripePriceId: In([
          ...stripeSubscription.items.data.map(({ price }) => price.id),
          ...nextPhasePriceIds,
        ]),
      },
      relations: ['billingProduct'],
    });

    const applicationPriceIds = new Set(
      itemPrices
        .filter(
          ({ billingProduct }) =>
            billingProduct?.metadata?.productKey ===
            BillingProductKey.APPLICATION,
        )
        .map(({ stripePriceId }) => stripePriceId),
    );

    const subscriptionUpdate = buildApplicationSubscriptionUpdate({
      currentItems: stripeSubscription.items.data
        .filter(({ price }) => applicationPriceIds.has(price.id))
        .map(({ id, price, quantity }) => ({
          id,
          price: price.id,
          quantity: quantity ?? 1,
        })),
      desiredItems: buildApplicationItems(billingSubscription.interval),
      isTrialing: billingSubscription.status === SubscriptionStatus.Trialing,
      isSendInvoice: isSendInvoiceSubscription(billingSubscription),
    });

    const updatedStripeSubscription = isDefined(subscriptionUpdate)
      ? await this.stripeSubscriptionService.updateSubscription(
          billingSubscription.stripeSubscriptionId,
          subscriptionUpdate,
        )
      : stripeSubscription;

    if (isDefined(schedule) && isDefined(nextPhase)) {
      const nextPhaseInterval = itemPrices.find(
        ({ stripePriceId, billingProduct }) =>
          nextPhasePriceIds.includes(stripePriceId) &&
          billingProduct?.metadata?.productKey ===
            BillingProductKey.BASE_PRODUCT,
      )?.interval;

      assertIsDefinedOrThrow(nextPhaseInterval);

      const { currentPhase } =
        await this.stripeSubscriptionScheduleService.loadSubscriptionSchedule(
          billingSubscription.stripeSubscriptionId,
        );

      assertIsDefinedOrThrow(currentPhase);

      const phases = buildApplicationSchedulePhasesUpdate({
        currentPhase: toPhaseUpdateParams(currentPhase),
        nextPhase: toPhaseUpdateParams(nextPhase),
        applicationPriceIds,
        applicationItems: buildApplicationItems(nextPhaseInterval),
        subscriptionCurrentPeriodEnd:
          updatedStripeSubscription.items.data[0].current_period_end,
      });

      if (isDefined(phases)) {
        await this.stripeSubscriptionScheduleService.updateSchedule(
          schedule.id,
          { phases },
        );
      }
    }

    const staleBillingSubscriptionItemIds = applicationBillingSubscriptionItems
      .filter(
        ({ stripeSubscriptionItemId }) =>
          !updatedStripeSubscription.items.data.some(
            ({ id }) => id === stripeSubscriptionItemId,
          ),
      )
      .map(({ id }) => id);

    if (isNonEmptyArray(staleBillingSubscriptionItemIds)) {
      await this.billingSubscriptionItemRepository.delete(
        staleBillingSubscriptionItemIds,
      );
    }

    await this.billingSubscriptionService.syncSubscriptionToDatabase({
      workspaceId,
      stripeSubscriptionId: billingSubscription.stripeSubscriptionId,
    });
  }
}
