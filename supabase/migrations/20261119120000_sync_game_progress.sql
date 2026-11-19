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
  v_packs_opened integer;
  v_cards_count integer;
  v_has_epic_card boolean;
  v_has_legendary_card boolean;
  v_squad_starters integer;
  v_has_daily_claim boolean;
  v_needs_packs_opened boolean;
  v_needs_card_count boolean;
  v_needs_epic_card boolean;
  v_needs_legendary_card boolean;
  v_needs_squad boolean;
  v_needs_daily_claim boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF jsonb_typeof(p_missions) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_achievements) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_preferences) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid game progress payload';
  END IF;

  SELECT
    COALESCE(bool_or(mission_id IN ('m1', 'm3', 'm10')), false),
    COALESCE(bool_or(mission_id IN ('m2', 'm7')), false),
    COALESCE(bool_or(mission_id = 'm4'), false),
    COALESCE(bool_or(mission_id = 'm8'), false),
    COALESCE(bool_or(mission_id IN ('m5', 'm6')), false),
    COALESCE(bool_or(mission_id = 'm9'), false)
  INTO
    v_needs_packs_opened,
    v_needs_card_count,
    v_needs_epic_card,
    v_needs_legendary_card,
    v_needs_squad,
    v_needs_daily_claim
  FROM jsonb_to_recordset(p_missions) AS payload(mission_id text);

  IF v_needs_packs_opened OR v_needs_daily_claim THEN
    SELECT
      COALESCE(profile.packs_opened, 0),
      profile.last_daily_claim IS NOT NULL
    INTO v_packs_opened, v_has_daily_claim
    FROM public.profiles AS profile
    WHERE profile.id = v_uid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Profile not found';
    END IF;
  END IF;

  IF v_needs_card_count THEN
    SELECT COUNT(*)::integer
    INTO v_cards_count
    FROM public.cards AS card
    WHERE card.user_id = v_uid;
  END IF;

  IF v_needs_epic_card THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.cards AS card
      WHERE card.user_id = v_uid
        AND card.rarity IN ('epic', 'legendary', 'icon', 'secret')
    )
    INTO v_has_epic_card;
  END IF;

  IF v_needs_legendary_card THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.cards AS card
      WHERE card.user_id = v_uid
        AND card.rarity IN ('legendary', 'icon', 'secret')
    )
    INTO v_has_legendary_card;
  END IF;

  IF v_needs_squad THEN
    SELECT COUNT(DISTINCT card.id)::integer
    INTO v_squad_starters
    FROM public.squads AS squad
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(squad.starters) = 'array' THEN squad.starters
        ELSE '[]'::jsonb
      END
    ) AS starter(value)
    JOIN public.cards AS card
      ON card.id::text = starter.value #>> '{}'
      AND card.user_id = v_uid
    WHERE squad.user_id = v_uid
      AND squad.is_primary;
  END IF;

  WITH mission_definitions (
    mission_id,
    title,
    description,
    target,
    reward,
    reward_xp,
    type
  ) AS (
    VALUES
      ('m1', 'Primeiros passos', 'Abra 1 pacote', 1, 300, 50, 'open_packs'),
      ('m2', 'Colecionador iniciante', 'Colecione 10 jogadores', 10, 500, 80, 'collect'),
      ('m3', 'Abridor dedicado', 'Abra 3 pacotes', 3, 800, 120, 'open_packs'),
      ('m4', 'Carta épica', 'Consiga uma carta Épica ou superior', 1, 1000, 200, 'rarity'),
      ('m5', 'Elenco completo', 'Monte um elenco de futsal completo (5 titulares)', 5, 1200, 250, 'futsal_squad'),
      ('m6', 'Futsal na veia', 'Monte um elenco de futsal completo (5 titulares)', 5, 900, 180, 'futsal_squad'),
      ('m7', 'Colecionador avançado', 'Colecione 25 jogadores', 25, 1500, 300, 'collect'),
      ('m8', 'Lendário', 'Consiga uma carta Lendária', 1, 2000, 400, 'rarity'),
      ('m9', 'Login diário', 'Receba a recompensa diária', 1, 200, 30, 'daily_login'),
      ('m10', 'Mestre das cartas', 'Abra 10 pacotes', 10, 3000, 600, 'open_packs')
  ),
  requested_missions AS (
    SELECT DISTINCT mission_id
    FROM jsonb_to_recordset(p_missions) AS payload(
      mission_id text
    )
  ),
  authoritative_missions AS (
    SELECT
      mission_definition.mission_id,
      mission_definition.title,
      mission_definition.description,
      mission_definition.target,
      mission_definition.reward,
      mission_definition.reward_xp,
      mission_definition.type,
      LEAST(
        GREATEST(
          CASE mission_definition.type
            WHEN 'open_packs' THEN v_packs_opened
            WHEN 'collect' THEN v_cards_count
            WHEN 'rarity' THEN
              CASE
                WHEN mission_definition.mission_id = 'm4' AND v_has_epic_card THEN 1
                WHEN mission_definition.mission_id = 'm8' AND v_has_legendary_card THEN 1
                ELSE 0
              END
            WHEN 'futsal_squad' THEN v_squad_starters
            WHEN 'daily_login' THEN CASE WHEN v_has_daily_claim THEN 1 ELSE 0 END
            ELSE 0
          END,
          0
        ),
        mission_definition.target
      ) AS progress
    FROM requested_missions
    JOIN mission_definitions AS mission_definition USING (mission_id)
  )
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
    authoritative_mission.mission_id,
    authoritative_mission.title,
    authoritative_mission.description,
    authoritative_mission.target,
    authoritative_mission.progress,
    authoritative_mission.reward,
    authoritative_mission.reward_xp,
    authoritative_mission.type,
    authoritative_mission.progress >= authoritative_mission.target,
    false
  FROM authoritative_missions AS authoritative_mission
  ON CONFLICT (user_id, mission_id) DO UPDATE
  SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    target = EXCLUDED.target,
    progress = LEAST(
      GREATEST(COALESCE(existing.progress, 0), COALESCE(EXCLUDED.progress, 0)),
      EXCLUDED.target
    ),
    reward = EXCLUDED.reward,
    reward_xp = EXCLUDED.reward_xp,
    type = EXCLUDED.type,
    completed = COALESCE(existing.completed, false) OR EXCLUDED.completed
  WHERE
    existing.title IS DISTINCT FROM EXCLUDED.title
    OR existing.description IS DISTINCT FROM EXCLUDED.description
    OR existing.target IS DISTINCT FROM EXCLUDED.target
    OR existing.progress IS DISTINCT FROM LEAST(
      GREATEST(COALESCE(existing.progress, 0), COALESCE(EXCLUDED.progress, 0)),
      EXCLUDED.target
    )
    OR existing.reward IS DISTINCT FROM EXCLUDED.reward
    OR existing.reward_xp IS DISTINCT FROM EXCLUDED.reward_xp
    OR existing.type IS DISTINCT FROM EXCLUDED.type
    OR existing.completed IS DISTINCT FROM (COALESCE(existing.completed, false) OR EXCLUDED.completed);

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

DROP POLICY IF EXISTS "own missions" ON public.missions;
DROP POLICY IF EXISTS "read own missions" ON public.missions;
CREATE POLICY "read own missions"
  ON public.missions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON TABLE public.missions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.missions TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_mission(p_mission_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_mission public.missions%rowtype;
  v_title text;
  v_description text;
  v_type text;
  v_target integer;
  v_progress integer;
  v_reward integer;
  v_reward_xp integer;
  v_packs_opened integer;
  v_has_daily_claim boolean;
  v_new_coins integer;
  v_xp integer;
  v_level integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
  INTO v_mission
  FROM public.missions
  WHERE user_id = v_uid AND mission_id = p_mission_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mission not found';
  END IF;
  IF v_mission.claimed THEN
    RAISE EXCEPTION 'Already claimed';
  END IF;

  CASE p_mission_id
    WHEN 'm1' THEN
      v_title := 'Primeiros passos'; v_description := 'Abra 1 pacote';
      v_type := 'open_packs'; v_target := 1; v_reward := 300; v_reward_xp := 50;
    WHEN 'm2' THEN
      v_title := 'Colecionador iniciante'; v_description := 'Colecione 10 jogadores';
      v_type := 'collect'; v_target := 10; v_reward := 500; v_reward_xp := 80;
    WHEN 'm3' THEN
      v_title := 'Abridor dedicado'; v_description := 'Abra 3 pacotes';
      v_type := 'open_packs'; v_target := 3; v_reward := 800; v_reward_xp := 120;
    WHEN 'm4' THEN
      v_title := 'Carta épica'; v_description := 'Consiga uma carta Épica ou superior';
      v_type := 'rarity'; v_target := 1; v_reward := 1000; v_reward_xp := 200;
    WHEN 'm5' THEN
      v_title := 'Elenco completo'; v_description := 'Monte um elenco de futsal completo (5 titulares)';
      v_type := 'futsal_squad'; v_target := 5; v_reward := 1200; v_reward_xp := 250;
    WHEN 'm6' THEN
      v_title := 'Futsal na veia'; v_description := 'Monte um elenco de futsal completo (5 titulares)';
      v_type := 'futsal_squad'; v_target := 5; v_reward := 900; v_reward_xp := 180;
    WHEN 'm7' THEN
      v_title := 'Colecionador avançado'; v_description := 'Colecione 25 jogadores';
      v_type := 'collect'; v_target := 25; v_reward := 1500; v_reward_xp := 300;
    WHEN 'm8' THEN
      v_title := 'Lendário'; v_description := 'Consiga uma carta Lendária';
      v_type := 'rarity'; v_target := 1; v_reward := 2000; v_reward_xp := 400;
    WHEN 'm9' THEN
      v_title := 'Login diário'; v_description := 'Receba a recompensa diária';
      v_type := 'daily_login'; v_target := 1; v_reward := 200; v_reward_xp := 30;
    WHEN 'm10' THEN
      v_title := 'Mestre das cartas'; v_description := 'Abra 10 pacotes';
      v_type := 'open_packs'; v_target := 10; v_reward := 3000; v_reward_xp := 600;
    ELSE
      RAISE EXCEPTION 'Unknown mission';
  END CASE;

  CASE v_type
    WHEN 'open_packs' THEN
      SELECT COALESCE(profile.packs_opened, 0)
      INTO v_packs_opened
      FROM public.profiles AS profile
      WHERE profile.id = v_uid;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Profile not found';
      END IF;
      v_progress := v_packs_opened;
    WHEN 'collect' THEN
      SELECT COUNT(*)::integer
      INTO v_progress
      FROM public.cards AS card
      WHERE card.user_id = v_uid;
    WHEN 'rarity' THEN
      IF p_mission_id = 'm4' THEN
        SELECT CASE WHEN EXISTS (
          SELECT 1
          FROM public.cards AS card
          WHERE card.user_id = v_uid
            AND card.rarity IN ('epic', 'legendary', 'icon', 'secret')
        ) THEN 1 ELSE 0 END
        INTO v_progress;
      ELSE
        SELECT CASE WHEN EXISTS (
          SELECT 1
          FROM public.cards AS card
          WHERE card.user_id = v_uid
            AND card.rarity IN ('legendary', 'icon', 'secret')
        ) THEN 1 ELSE 0 END
        INTO v_progress;
      END IF;
    WHEN 'futsal_squad' THEN
      SELECT COUNT(DISTINCT card.id)::integer
      INTO v_progress
      FROM public.squads AS squad
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(squad.starters) = 'array' THEN squad.starters
          ELSE '[]'::jsonb
        END
      ) AS starter(value)
      JOIN public.cards AS card
        ON card.id::text = starter.value #>> '{}'
        AND card.user_id = v_uid
      WHERE squad.user_id = v_uid
        AND squad.is_primary;
    WHEN 'daily_login' THEN
      SELECT profile.last_daily_claim IS NOT NULL
      INTO v_has_daily_claim
      FROM public.profiles AS profile
      WHERE profile.id = v_uid;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Profile not found';
      END IF;
      v_progress := CASE WHEN v_has_daily_claim THEN 1 ELSE 0 END;
  END CASE;

  IF COALESCE(v_progress, 0) < v_target THEN
    RAISE EXCEPTION 'Mission not completed';
  END IF;

  UPDATE public.missions
  SET title = v_title,
      description = v_description,
      target = v_target,
      progress = v_target,
      reward = v_reward,
      reward_xp = v_reward_xp,
      type = v_type,
      completed = true,
      claimed = true
  WHERE user_id = v_uid
    AND mission_id = p_mission_id
    AND claimed = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Already claimed';
  END IF;

  UPDATE public.profiles
  SET coins = coins + v_reward,
      xp = xp + v_reward_xp
  WHERE id = v_uid
  RETURNING coins, xp, least(99, floor(xp / 500)::integer + 1)
  INTO v_new_coins, v_xp, v_level;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  UPDATE public.profiles
  SET level = v_level
  WHERE id = v_uid;

  INSERT INTO public.transactions (user_id, amount, reason, type)
  VALUES (v_uid, v_reward, 'Missão: ' || v_title, 'earn');

  RETURN json_build_object('coins', v_new_coins, 'xp', v_xp, 'level', v_level);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_mission(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_mission(text) TO authenticated;
