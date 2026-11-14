const mockRpc = jest.fn();

jest.mock('../../../src/lib/supabase', () => ({
  get supabase() {
    return { rpc: mockRpc };
  },
}));

import { persistComparePair } from '../../../src/lib/services/compare';

describe('compare history service', () => {
  it('serializes history writes through the atomic RPC', async () => {
    let finishFirst!: (result: { error: null }) => void;
    mockRpc
      .mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; }))
      .mockResolvedValue({ error: null });

    persistComparePair('card-a', 'card-b');
    persistComparePair('card-c', 'card-d');

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenNthCalledWith(1, 'add_compare_history', {
      p_a_uid: 'card-a',
      p_b_uid: 'card-b',
    });

    finishFirst({ error: null });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(mockRpc).toHaveBeenNthCalledWith(2, 'add_compare_history', {
      p_a_uid: 'card-c',
      p_b_uid: 'card-d',
    });
  });
});
