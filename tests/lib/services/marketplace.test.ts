const mockRpc = jest.fn();
const mockOrder = jest.fn();
const mockGt = jest.fn(() => ({ order: mockOrder }));
const mockEq = jest.fn(() => ({ gt: mockGt }));
const mockSelect = jest.fn(() => ({ eq: mockEq }));
const mockTransactionSelect = jest.fn();
const mockTransactionEq = jest.fn();
const mockTransactionOr = jest.fn();
const mockTransactionIlike = jest.fn();
const mockTransactionGte = jest.fn();
const mockTransactionOrder = jest.fn();
const mockTransactionRange = jest.fn();
const mockTransactionThen = jest.fn();
let mockTransactionResult: { data: unknown[] | null; error: Error | null; count: number | null };
const mockTransactionQuery = {
  eq: mockTransactionEq,
  or: mockTransactionOr,
  ilike: mockTransactionIlike,
  gte: mockTransactionGte,
  order: mockTransactionOrder,
  range: mockTransactionRange,
  then: (resolve: (value: typeof mockTransactionResult) => unknown, reject: (reason: unknown) => unknown) =>
    mockTransactionThen(resolve, reject),
};
const mockFrom = jest.fn((table: string) => (
  table === 'listings' ? { select: mockSelect } : { select: mockTransactionSelect }
));

jest.mock('../../../src/lib/supabase', () => ({
  get supabase() {
    return { from: mockFrom, rpc: mockRpc };
  },
}));

jest.mock('../../../src/data/players', () => ({
  getPlayerImage: jest.fn(),
}));

import { getListings } from '../../../src/lib/services/marketplace';
import { getMarketplaceTransactions, getMarketplaceTransactionSummary, updateListingPrice } from '../../../src/lib/services/marketplace';

describe('marketplace service', () => {
  beforeEach(() => {
    mockRpc.mockReset().mockResolvedValue({ data: 0, error: null });
    mockOrder.mockReset().mockResolvedValue({ data: [], error: null });
    mockGt.mockClear();
    mockEq.mockClear();
    mockSelect.mockClear();
    mockFrom.mockClear();
    mockTransactionSelect.mockReset().mockReturnValue(mockTransactionQuery);
    mockTransactionEq.mockReset().mockReturnValue(mockTransactionQuery);
    mockTransactionOr.mockReset().mockReturnValue(mockTransactionQuery);
    mockTransactionIlike.mockReset().mockReturnValue(mockTransactionQuery);
    mockTransactionGte.mockReset().mockReturnValue(mockTransactionQuery);
    mockTransactionOrder.mockReset().mockReturnValue(mockTransactionQuery);
    mockTransactionRange.mockReset().mockReturnValue(mockTransactionQuery);
    mockTransactionThen.mockReset().mockImplementation((resolve, reject) => Promise.resolve(mockTransactionResult).then(resolve, reject));
    mockTransactionResult = { data: [], error: null, count: 0 };
  });

  it('expires stale listings and queries only active listings that have not expired', async () => {
    await expect(getListings()).resolves.toEqual([]);

    expect(mockRpc).toHaveBeenCalledWith('expire_marketplace_listings');
    expect(mockFrom).toHaveBeenCalledWith('listings');
    expect(mockEq).toHaveBeenCalledWith('status', 'active');
    expect(mockGt).toHaveBeenCalledWith('expires_at', expect.any(String));
  });

  it('filters, orders, paginates, and maps confirmed marketplace transactions', async () => {
    mockTransactionResult = {
      data: [{
        id: 'transaction-1',
        listing_id: 'listing-1',
        card_id: 'card-1',
        buyer_id: 'buyer-1',
        seller_id: 'seller-1',
        buyer_name: 'Comprador',
        seller_name: 'Vendedor',
        card_name: 'Jogador',
        card_overall: 86,
        card_rarity: 'epic',
        card_image: 'card.png',
        price: 1250,
        completed_at: '2026-11-16T12:00:00Z',
      }],
      error: null,
      count: 1,
    };

    await expect(getMarketplaceTransactions('seller-1', {
      kind: 'sell',
      search: 'Jogador',
      since: '2026-11-01T00:00:00Z',
      offset: 25,
      limit: 25,
    })).resolves.toEqual({
      rows: [{
        id: 'transaction-1',
        listingId: 'listing-1',
        cardId: 'card-1',
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
        buyerName: 'Comprador',
        sellerName: 'Vendedor',
        cardName: 'Jogador',
        cardOverall: 86,
        cardRarity: 'epic',
        cardImage: 'card.png',
        price: 1250,
        completedAt: '2026-11-16T12:00:00Z',
      }],
      total: 1,
    });

    expect(mockTransactionEq).toHaveBeenCalledWith('seller_id', 'seller-1');
    expect(mockTransactionIlike).toHaveBeenCalledWith('card_name', '%Jogador%');
    expect(mockTransactionGte).toHaveBeenCalledWith('completed_at', '2026-11-01T00:00:00Z');
    expect(mockTransactionOrder).toHaveBeenCalledWith('completed_at', { ascending: false });
    expect(mockTransactionRange).toHaveBeenCalledWith(25, 49);
  });

  it('requests the summary for all completed purchases and sales', async () => {
    mockRpc.mockResolvedValue({
      data: { purchaseCount: 2, saleCount: 1, spent: 500, received: 300, volume: 800, net: -200 },
      error: null,
    });

    await expect(getMarketplaceTransactionSummary()).resolves.toEqual({
      purchaseCount: 2,
      saleCount: 1,
      spent: 500,
      received: 300,
      volume: 800,
      net: -200,
    });
    expect(mockRpc).toHaveBeenCalledWith('marketplace_transaction_summary');
  });

  it('updates an active listing through the price-edit RPC', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });

    await expect(updateListingPrice('listing-1', 1400)).resolves.toBe(true);

    expect(mockRpc).toHaveBeenCalledWith('update_listing_price', {
      p_listing_id: 'listing-1',
      p_price: 1400,
    });
  });

  it('surfaces errors from the listing price-edit RPC', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('update failed') });

    await expect(updateListingPrice('listing-1', 1400)).rejects.toThrow('update failed');
  });

  it('does not hide errors when loading transaction history', async () => {
    mockTransactionResult = { data: null, error: new Error('query failed'), count: null };
    await expect(getMarketplaceTransactions('user-1', {
      kind: 'all',
      search: '',
      offset: 0,
      limit: 25,
    })).rejects.toThrow('query failed');
  });
});
