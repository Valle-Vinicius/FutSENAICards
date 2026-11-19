CREATE OR REPLACE FUNCTION public.sync_game_progress(
  p_missions jsonb DEFAULT '[]'::jsonb,
  p_achievements jsonb DEFAULT '[]'::jsonb,
  p_preferences jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF jsonb_typeof(p_missions) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_achievements) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_preferences) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid game progress payload';
  END IF;

  INSERT INTO public.missions AS existing (
    user_id,
    mission_id,
    title,
    description,
    target,
    progress,
    reward,
    reward_xp,
    type,
    completed,
    claimed
  )
  SELECT
    v_uid,
    payload.mission_id,
    payload.title,
    payload.description,
    payload.target,
    payload.progress,
    payload.reward,
    payload.reward_xp,
    payload.type,
    payload.completed,
    payload.claimed
  FROM jsonb_to_recordset(p_missions) AS payload(
    mission_id text,
    title text,
    description text,
    target integer,
    progress integer,
    reward integer,
    reward_xp integer,
    type text,
    completed boolean,
    claimed boolean
  )
  ON CONFLICT (user_id, mission_id) DO UPDATE
  SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    target = EXCLUDED.target,
    progress = GREATEST(COALESCE(existing.progress, 0), COALESCE(EXCLUDED.progress, 0)),
    reward = EXCLUDED.reward,
    reward_xp = EXCLUDED.reward_xp,
    type = EXCLUDED.type,
    completed = COALESCE(existing.completed, false) OR COALESCE(EXCLUDED.completed, false),
    claimed = COALESCE(existing.claimed, false) OR COALESCE(EXCLUDED.claimed, false)
  WHERE
    existing.title IS DISTINCT FROM EXCLUDED.title
    OR existing.description IS DISTINCT FROM EXCLUDED.description
    OR existing.target IS DISTINCT FROM EXCLUDED.target
    OR existing.progress IS DISTINCT FROM GREATEST(COALESCE(existing.progress, 0), COALESCE(EXCLUDED.progress, 0))
    OR existing.reward IS DISTINCT FROM EXCLUDED.reward
    OR existing.reward_xp IS DISTINCT FROM EXCLUDED.reward_xp
    OR existing.type IS DISTINCT FROM EXCLUDED.type
    OR existing.completed IS DISTINCT FROM (COALESCE(existing.completed, false) OR COALESCE(EXCLUDED.completed, false))
    OR existing.claimed IS DISTINCT FROM (COALESCE(existing.claimed, false) OR COALESCE(EXCLUDED.claimed, false));

  INSERT INTO public.achievements AS existing (
    user_id,
    achievement_id,
    title,
    description,
    unlocked,
    unlocked_at
  )
  SELECT
    v_uid,
    payload.achievement_id,
    payload.title,
    payload.description,
    payload.unlocked,
    payload.unlocked_at
  FROM jsonb_to_recordset(p_achievements) AS payload(
    achievement_id text,
    title text,
    description text,
    unlocked boolean,
    unlocked_at timestamptz
  )
  ON CONFLICT (user_id, achievement_id) DO UPDATE
  SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    unlocked = COALESCE(existing.unlocked, false) OR COALESCE(EXCLUDED.unlocked, false),
    unlocked_at = COALESCE(existing.unlocked_at, EXCLUDED.unlocked_at)
  WHERE
    existing.title IS DISTINCT FROM EXCLUDED.title
    OR existing.description IS DISTINCT FROM EXCLUDED.description
    OR existing.unlocked IS DISTINCT FROM (COALESCE(existing.unlocked, false) OR COALESCE(EXCLUDED.unlocked, false))
    OR existing.unlocked_at IS DISTINCT FROM COALESCE(existing.unlocked_at, EXCLUDED.unlocked_at);

  UPDATE public.profiles
  SET preferences = COALESCE(preferences, '{}'::jsonb) || p_preferences
  WHERE id = v_uid
    AND COALESCE(preferences, '{}'::jsonb)
      IS DISTINCT FROM COALESCE(preferences, '{}'::jsonb) || p_preferences;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_game_progress(jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_game_progress(jsonb, jsonb, jsonb) TO authenticated;
