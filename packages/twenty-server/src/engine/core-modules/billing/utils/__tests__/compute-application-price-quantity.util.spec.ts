import { computeApplicationPriceQuantity } from 'src/engine/core-modules/billing/utils/compute-application-price-quantity.util';

const counts = { workspaceMemberCount: 7, connectedAccountCount: 3 };

describe('computeApplicationPriceQuantity', () => {
  it('bills a flat price once', () => {
    expect(computeApplicationPriceQuantity({ per: undefined, ...counts })).toBe(
      1,
    );
  });

  it('bills a price per workspace member for each member', () => {
    expect(
      computeApplicationPriceQuantity({ per: 'WORKSPACE_MEMBER', ...counts }),
    ).toBe(7);
  });

  it('bills a price per connected account for each connected account', () => {
    expect(
      computeApplicationPriceQuantity({ per: 'CONNECTED_ACCOUNT', ...counts }),
    ).toBe(3);
  });
});
