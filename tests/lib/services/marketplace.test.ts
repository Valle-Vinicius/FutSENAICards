const mockRpc = jest.fn();
const mockOrder = jest.fn();
const mockGt = jest.fn(() => ({ order: mockOrder }));
const mockEq = jest.fn(() => ({ gt: mockGt }));
const mockSelect = jest.fn(() => ({ eq: mockEq }));
const mockFrom = jest.fn(() => ({ select: mockSelect }));

jest.mock('../../../src/lib/supabase', () => ({
  get supabase() {
    return { from: mockFrom, rpc: mockRpc };
  },
}));

jest.mock('../../../src/data/players', () => ({
  getPlayerImage: jest.fn(),
}));

import { getListings } from '../../../src/lib/services/marketplace';

describe('marketplace service', () => {
  beforeEach(() => {
    mockRpc.mockReset().mockResolvedValue({ data: 0, error: null });
    mockOrder.mockReset().mockResolvedValue({ data: [], error: null });
    mockGt.mockClear();
    mockEq.mockClear();
    mockSelect.mockClear();
    mockFrom.mockClear();
  });

  it('expires stale listings and queries only active listings that have not expired', async () => {
    await expect(getListings()).resolves.toEqual([]);

    expect(mockRpc).toHaveBeenCalledWith('expire_marketplace_listings');
    expect(mockFrom).toHaveBeenCalledWith('listings');
    expect(mockEq).toHaveBeenCalledWith('status', 'active');
    expect(mockGt).toHaveBeenCalledWith('expires_at', expect.any(String));
  });
});
