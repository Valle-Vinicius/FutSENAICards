import { convertDuplicateBatches } from '../../../src/lib/services/duplicateConversion';

describe('convertDuplicateBatches', () => {
  it('keeps requesting batches until the server returns zero and aggregates the totals', async () => {
    const convertBatch = jest.fn()
      .mockResolvedValueOnce({ count: 100, coins: 1200 })
      .mockResolvedValueOnce({ count: 35, coins: 410 })
      .mockResolvedValueOnce({ count: 0, coins: 0 });

    await expect(convertDuplicateBatches(convertBatch)).resolves.toEqual({ count: 135, coins: 1610 });
    expect(convertBatch).toHaveBeenCalledTimes(3);
  });
});
