import { buildApplicationSchedulePhasesUpdate } from 'src/engine/core-modules/billing/utils/build-application-schedule-phases-update.util';

const currentPhase = {
  start_date: 100,
  end_date: 150,
  items: [
    { price: 'price_base_year', quantity: 7 },
    { price: 'price_application_year', quantity: 7 },
  ],
};

const nextPhase = {
  start_date: 150,
  items: [
    { price: 'price_base_month', quantity: 7 },
    { price: 'price_application_month', quantity: 7 },
  ],
};

const build = (applicationItems: { price: string; quantity: number }[]) =>
  buildApplicationSchedulePhasesUpdate({
    currentPhase,
    nextPhase,
    applicationPriceIds: new Set([
      'price_application_year',
      'price_application_month',
    ]),
    applicationItems,
    subscriptionCurrentPeriodEnd: 200,
  });

describe('buildApplicationSchedulePhasesUpdate', () => {
  it('replaces the application items of the next phase', () => {
    expect(build([{ price: 'price_other_month', quantity: 1 }])).toEqual([
      { ...currentPhase, end_date: 200 },
      {
        start_date: 200,
        proration_behavior: 'none',
        items: [
          { price: 'price_base_month', quantity: 7 },
          { price: 'price_other_month', quantity: 1 },
        ],
      },
    ]);
  });

  it('removes the application items of the next phase when none is left', () => {
    expect(build([])?.[1].items).toEqual([
      { price: 'price_base_month', quantity: 7 },
    ]);
  });

  it('returns nothing when the next phase already matches', () => {
    expect(
      build([{ price: 'price_application_month', quantity: 7 }]),
    ).toBeUndefined();
  });
});
