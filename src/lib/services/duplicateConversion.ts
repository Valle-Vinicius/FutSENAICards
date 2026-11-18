export interface DuplicateConversionBatch {
  count: number;
  coins: number;
}

export async function convertDuplicateBatches(
  convertBatch: () => Promise<DuplicateConversionBatch>,
): Promise<DuplicateConversionBatch> {
  let count = 0;
  let coins = 0;

  while (true) {
    const batch = await convertBatch();
    count += batch.count;
    coins += batch.coins;
    if (batch.count === 0) return { count, coins };
  }
}
