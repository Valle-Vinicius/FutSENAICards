import { supabase } from '../supabase';

let compareHistoryWriteChain: Promise<void> = Promise.resolve();

export function persistComparePair(aUid: string, bUid: string) {
  const client = supabase;
  if (!client) return;

  compareHistoryWriteChain = compareHistoryWriteChain
    .then(async () => {
      const { error } = await client.rpc('add_compare_history', {
        p_a_uid: aUid,
        p_b_uid: bUid,
      });
      if (error) throw error;
    })
    .catch(error => {
      console.error('[compare] failed to persist comparison history:', error);
    });
}
