import { supabase } from '../supabase';

export interface TransactionRecord {
  id: string;
  userId: string;
  amount: number;
  reason: string;
  type: 'earn' | 'spend';
  createdAt: string;
}

export async function getTransactions(userId: string): Promise<TransactionRecord[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('transactions').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50);
  if (error) return [];
  return (data || []).map((t: any) => ({
    id: t.id,
    userId: t.user_id,
    amount: t.amount,
    reason: t.reason,
    type: t.type,
    createdAt: t.created_at,
  }));
}

export async function addTransaction(userId: string, amount: number, reason: string, type: 'earn' | 'spend'): Promise<void> {
  if (!supabase) return;
  await supabase.from('transactions').insert({ user_id: userId, amount, reason, type });
}
