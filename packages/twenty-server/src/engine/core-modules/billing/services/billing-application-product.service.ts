/* @license Enterprise */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isDefined } from 'twenty-shared/utils';
import { Repository } from 'typeorm';

import { BILLING_SUBSCRIPTION_STATE_LOCK_OPTIONS } from 'src/engine/core-modules/billing/constants/billing-subscription-state-lock-options.constant';
import { BillingPriceEntity } from 'src/engine/core-modules/billing/entities/billing-price.entity';
import { BillingProductEntity } from 'src/engine/core-modules/billing/entities/billing-product.entity';
import { BillingProductKey } from 'src/engine/core-modules/billing/enums/billing-product-key.enum';
import { SubscriptionInterval } from 'src/engine/core-modules/billing/enums/billing-subscription-interval.enum';
import { BillingUsageType } from 'src/engine/core-modules/billing/enums/billing-usage-type.enum';
import { StripePriceService } from 'src/engine/core-modules/billing/stripe/services/stripe-price.service';
import { StripeProductService } from 'src/engine/core-modules/billing/stripe/services/stripe-product.service';
import { buildApplicationStripePriceParams } from 'src/engine/core-modules/billing/utils/build-application-stripe-price-params.util';
import { buildApplicationStripeProductId } from 'src/engine/core-modules/billing/utils/build-application-stripe-product-id.util';
import { buildBillingApplicationProductLockKey } from 'src/engine/core-modules/billing/utils/build-billing-application-product-lock-key.util';
import { type DeclaredApplicationPrice } from 'src/engine/core-modules/billing/utils/collect-declared-application-prices.util';
import { transformStripePriceToDatabasePrice } from 'src/engine/core-modules/billing/utils/transform-stripe-price-to-database-price.util';
import { transformStripeProductToDatabaseProduct } from 'src/engine/core-modules/billing/utils/transform-stripe-product-to-database-product.util';
import { CacheLockService } from 'src/engine/core-modules/cache-lock/cache-lock.service';

const APPLICATION_PRICE_INTERVALS = Object.values(SubscriptionInterval);

@Injectable()
export class BillingApplicationProductService {
  constructor(
    private readonly stripeProductService: StripeProductService,
    private readonly stripePriceService: StripePriceService,
    private readonly cacheLockService: CacheLockService,
    @InjectRepository(BillingProductEntity)
    private readonly billingProductRepository: Repository<BillingProductEntity>,
    @InjectRepository(BillingPriceEntity)
    private readonly billingPriceRepository: Repository<BillingPriceEntity>,
  ) {}

  async getOrCreateProduct({
    applicationUniversalIdentifier,
    applicationName,
    price,
  }: DeclaredApplicationPrice): Promise<BillingProductEntity> {
    const stripeProductId = buildApplicationStripeProductId({
      applicationUniversalIdentifier,
      price,
    });

    const billingProduct = await this.billingProductRepository.findOne({
      where: { stripeProductId },
      relations: ['billingPrices'],
    });

    const hasEveryIntervalPrice =
      isDefined(billingProduct) &&
      APPLICATION_PRICE_INTERVALS.every((interval) =>
        billingProduct.billingPrices.some(
          (billingPrice) =>
            billingPrice.active && billingPrice.interval === interval,
        ),
      );

    if (isDefined(billingProduct) && hasEveryIntervalPrice) {
      return billingProduct;
    }

    return await this.cacheLockService.withLock(
      async () => {
        const stripeProduct =
          await this.stripeProductService.getOrCreateProduct({
            id: stripeProductId,
            name: `${applicationName} - ${price.label}`,
            description: price.description,
            metadata: {
              productKey: BillingProductKey.APPLICATION,
              priceUsageBased: BillingUsageType.LICENSED,
              applicationUniversalIdentifier,
              applicationPriceUniversalIdentifier: price.universalIdentifier,
            },
          });

        const existingStripePrices =
          await this.stripePriceService.getPricesByProductId(stripeProductId);

        const createdStripePrices = await Promise.all(
          APPLICATION_PRICE_INTERVALS.filter(
            (interval) =>
              !existingStripePrices.some(
                (stripePrice) =>
                  stripePrice.active &&
                  stripePrice.recurring?.interval === interval,
              ),
          ).map((interval) =>
            this.stripePriceService.createPrice(
              buildApplicationStripePriceParams({
                stripeProductId,
                price,
                interval,
              }),
            ),
          ),
        );

        await this.billingProductRepository.upsert(
          transformStripeProductToDatabaseProduct(stripeProduct),
          { conflictPaths: ['stripeProductId'] },
        );

        await this.billingPriceRepository.upsert(
          [...existingStripePrices, ...createdStripePrices].map(
            transformStripePriceToDatabasePrice,
          ),
          { conflictPaths: ['stripePriceId'] },
        );

        return await this.billingProductRepository.findOneOrFail({
          where: { stripeProductId },
          relations: ['billingPrices'],
        });
      },
      buildBillingApplicationProductLockKey(stripeProductId),
      BILLING_SUBSCRIPTION_STATE_LOCK_OPTIONS,
    );
  }
}
