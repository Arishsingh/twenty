/* @license Enterprise */

import { Scope } from '@nestjs/common';

import { BillingApplicationSubscriptionService } from 'src/engine/core-modules/billing/services/billing-application-subscription.service';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';

export type SyncApplicationSubscriptionItemsJobData = {
  workspaceId: string;
};

@Processor({
  queueName: MessageQueue.billingQueue,
  scope: Scope.REQUEST,
})
export class SyncApplicationSubscriptionItemsJob {
  constructor(
    private readonly billingApplicationSubscriptionService: BillingApplicationSubscriptionService,
  ) {}

  @Process(SyncApplicationSubscriptionItemsJob.name)
  async handle({
    workspaceId,
  }: SyncApplicationSubscriptionItemsJobData): Promise<void> {
    await this.billingApplicationSubscriptionService.syncApplicationItems(
      workspaceId,
    );
  }
}
