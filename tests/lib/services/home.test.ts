const mockSingle = jest.fn();
const mockRpc = jest.fn(() => ({ single: mockSingle }));

jest.mock('../../../src/lib/supabase', () => ({
  get supabase() {
    return { rpc: mockRpc };
  },
}));

import { getHomePendingCounts } from '../../../src/lib/services/home';

describe('home pending counts', () => {
  beforeEach(() => {
    mockRpc.mockClear();
    mockSingle.mockReset();
  });

  it('loads all pending counts through one RPC', async () => {
    mockSingle.mockResolvedValue({
      data: { challenges: 3, friend_requests: 2, sold_listings: 1 },
      error: null,
    });

    await expect(getHomePendingCounts()).resolves.toEqual({
      challenges: 3,
      friendRequests: 2,
      soldListings: 1,
    });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('get_home_pending_counts');
  });

  it('surfaces errors instead of treating failed counts as zero', async () => {
    const error = new Error('RPC failed');
    mockSingle.mockResolvedValue({ data: null, error });

    await expect(getHomePendingCounts()).rejects.toBe(error);
  });
});
