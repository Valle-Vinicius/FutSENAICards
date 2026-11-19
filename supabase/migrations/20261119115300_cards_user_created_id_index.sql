CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cards_user_created_id
ON public.cards (user_id, created_at DESC, id ASC);
