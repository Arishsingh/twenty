import { buildApplicationSubscriptionUpdate } from 'src/engine/core-modules/billing/utils/build-application-subscription-update.util';

const currentItem = { id: 'si_application', price: 'price_a', quantity: 4 };

const build = (
  params: Partial<Parameters<typeof buildApplicationSubscriptionUpdate>[0]>,
) =>
  buildApplicationSubscriptionUpdate({
    currentItems: [],
    desiredItems: [],
    isTrialing: false,
    isSendInvoice: false,
    ...params,
  });

describe('buildApplicationSubscriptionUpdate', () => {
  it('adds an item and invoices it right away', () => {
    expect(
      build({ desiredItems: [{ price: 'price_a', quantity: 4 }] }),
    ).toEqual({
      items: [{ price: 'price_a', quantity: 4 }],
      proration_behavior: 'always_invoice',
    });
  });

  it('removes an item and credits it on the next invoice', () => {
    expect(build({ currentItems: [currentItem] })).toEqual({
      items: [{ id: 'si_application', deleted: true }],
      proration_behavior: 'create_prorations',
    });
  });

  it('raises a quantity and invoices it right away', () => {
    expect(
      build({
        currentItems: [currentItem],
        desiredItems: [{ price: 'price_a', quantity: 5 }],
      }),
    ).toEqual({
      items: [{ id: 'si_application', quantity: 5 }],
      proration_behavior: 'always_invoice',
    });
  });

  it('lowers a quantity and credits it on the next invoice', () => {
    expect(
      build({
        currentItems: [currentItem],
        desiredItems: [{ price: 'price_a', quantity: 3 }],
      }),
    ).toEqual({
      items: [{ id: 'si_application', quantity: 3 }],
      proration_behavior: 'create_prorations',
    });
  });

  it('replaces an item whose price changed', () => {
    expect(
      build({
        currentItems: [currentItem],
        desiredItems: [{ price: 'price_b', quantity: 4 }],
      }),
    ).toEqual({
      items: [
        { id: 'si_application', deleted: true },
        { price: 'price_b', quantity: 4 },
      ],
      proration_behavior: 'always_invoice',
    });
  });

  it('does not invoice right away a subscription billed by invoice', () => {
    expect(
      build({
        desiredItems: [{ price: 'price_a', quantity: 4 }],
        isSendInvoice: true,
      })?.proration_behavior,
    ).toBe('create_prorations');
  });

  it('does not prorate during a trial', () => {
    expect(
      build({
        desiredItems: [{ price: 'price_a', quantity: 4 }],
        isTrialing: true,
      })?.proration_behavior,
    ).toBe('none');
  });

  it('returns nothing when the items already match', () => {
    expect(
      build({
        currentItems: [currentItem],
        desiredItems: [{ price: 'price_a', quantity: 4 }],
      }),
    ).toBeUndefined();
  });
});
