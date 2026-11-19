CREATE OR REPLACE FUNCTION public.get_home_pending_counts()
RETURNS TABLE (
  challenges bigint,
  friend_requests bigint,
  sold_listings bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    (
      SELECT COUNT(*)
      FROM public.challenges AS challenge
      WHERE challenge.challenged_id = (SELECT auth.uid())
        AND challenge.status = 'pending'
    ) + (
      SELECT COUNT(*)
      FROM public.pool_matches AS pool_match
      WHERE pool_match.player2_id = (SELECT auth.uid())
        AND pool_match.status = 'pending'
    ) AS challenges,
    (
      SELECT COUNT(*)
      FROM public.friendships AS friendship
      WHERE friendship.addressee_id = (SELECT auth.uid())
        AND friendship.status = 'pending'
    ) AS friend_requests,
    (
      SELECT COUNT(*)
      FROM public.listings AS listing
      WHERE listing.seller_id = (SELECT auth.uid())
        AND listing.status = 'sold'
    ) AS sold_listings
  WHERE (SELECT auth.uid()) IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_home_pending_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_home_pending_counts() TO authenticated;

NOTIFY pgrst, 'reload schema';
