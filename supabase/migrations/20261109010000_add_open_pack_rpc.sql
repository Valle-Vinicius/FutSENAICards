-- Migration: RPC open_pack (server-side pack opening)
-- Valida preço, debita moedas, sorteia cartas e insere no servidor
-- O cliente só chama o RPC; não faz INSERT direto em cards

create or replace function public.open_pack(p_pack_id uuid, p_price integer, p_card_count integer)
returns table(
  uid uuid,
  player_id uuid,
  name text,
  card_position text,
  sport text,
  rarity text,
  edition text,
  special text,
  overall integer,
  pace integer,
  shooting integer,
  passing integer,
  dribbling integer,
  defending integer,
  physical integer,
  reflexes integer,
  positioning integer,
  handling integer,
  image text,
  rarity_bonus integer,
  special_bonus integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_coins integer;
  v_i integer := 0;
  v_rarity text;
  v_special text;
  v_card_record record;
  v_pace integer;
  v_shooting integer;
  v_passing integer;
  v_dribbling integer;
  v_defending integer;
  v_physical integer;
  v_reflexes integer;
  v_positioning integer;
  v_handling integer;
  v_base_overall integer;
  v_overall integer;
  v_name text;
  v_card_position text;
  v_nationality text;
  v_age integer;
  v_club text;
  v_image text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  -- Verifica se o usuário tem coins suficientes
  select coins into v_coins from public.profiles where id = v_uid;
  if v_coins is null or v_coins < p_price then
    raise exception 'Saldo insuficiente';
  end if;

  -- Debita as moedas
  update public.profiles set coins = coins - p_price where id = v_uid;

  -- Sorteia e insere cada carta
  for v_i in 1..p_card_count loop
    -- Sorteia raridade com pesos
    select 
      case 
        when random() < 0.50 then 'common'
        when random() < 0.80 then 'uncommon'
        when random() < 0.95 then 'rare'
        when random() < 0.99 then 'epic'
        when random() < 0.995 then 'legendary'
        else 'icon'
      end into v_rarity;

    -- Sorteia especial
    select 
      case 
        when random() < 0.85 then 'none'
        when random() < 0.88 then 'totw'
        when random() < 0.91 then 'potm'
        when random() < 0.94 then 'revelation'
        when random() < 0.97 then 'legend'
        else 'futsal'
      end into v_special;

    -- Sorteia um template aleatório da tabela cards (se houver) ou usa valores padrão
    select c.name, c.position, c.nationality, c.age, c.club, c.image,
           c.pace, c.shooting, c.passing, c.dribbling, c.defending, c.physical,
           c.reflexes, c.positioning, c.handling
    into v_name, v_card_position, v_nationality, v_age, v_club, v_image,
         v_pace, v_shooting, v_passing, v_dribbling, v_defending, v_physical,
         v_reflexes, v_positioning, v_handling
    from public.cards c
    where c.user_id = v_uid
    order by random()
    limit 1;

    -- Se não houver templates do usuário, usa valores padrão
    if v_name is null then
      v_name := 'Jogador';
      v_card_position := 'Ala';
      v_nationality := 'Brasil';
      v_age := 20;
      v_club := 'Clube';
      v_image := null;
      v_pace := 70;
      v_shooting := 70;
      v_passing := 70;
      v_dribbling := 70;
      v_defending := 70;
      v_physical := 70;
      v_reflexes := 50;
      v_positioning := 50;
      v_handling := 50;
    end if;

    -- Aplica multiplicador de raridade aos atributos
    v_pace := least(99, greatest(0, round(v_pace * (
      case v_rarity 
        when 'common' then 0.88
        when 'uncommon' then 1.00
        when 'rare' then 1.05
        when 'epic' then 1.10
        when 'legendary' then 1.15
        when 'icon' then 1.20
        else 1.00
      end
    )));
    v_shooting := least(99, greatest(0, round(v_shooting * (
      case v_rarity 
        when 'common' then 0.88
        when 'uncommon' then 1.00
        when 'rare' then 1.05
        when 'epic' then 1.10
        when 'legendary' then 1.15
        when 'icon' then 1.20
        else 1.00
      end
    )));
    v_passing := least(99, greatest(0, round(v_passing * (
      case v_rarity 
        when 'common' then 0.88
        when 'uncommon' then 1.00
        when 'rare' then 1.05
        when 'epic' then 1.10
        when 'legendary' then 1.15
        when 'icon' then 1.20
        else 1.00
      end
    )));
    v_dribbling := least(99, greatest(0, round(v_dribbling * (
      case v_rarity 
        when 'common' then 0.88
        when 'uncommon' then 1.00
        when 'rare' then 1.05
        when 'epic' then 1.10
        when 'legendary' then 1.15
        when 'icon' then 1.20
        else 1.00
      end
    )));
    v_defending := least(99, greatest(0, round(v_defending * (
      case v_rarity 
        when 'common' then 0.88
        when 'uncommon' then 1.00
        when 'rare' then 1.05
        when 'epic' then 1.10
        when 'legendary' then 1.15
        when 'icon' then 1.20
        else 1.00
      end
    )));
    v_physical := least(99, greatest(0, round(v_physical * (
      case v_rarity 
        when 'common' then 0.88
        when 'uncommon' then 1.00
        when 'rare' then 1.05
        when 'epic' then 1.10
        when 'legendary' then 1.15
        when 'icon' then 1.20
        else 1.00
      end
    )));
    v_reflexes := least(99, greatest(0, round(coalesce(v_reflexes, 50) * (
      case v_rarity 
        when 'common' then 0.88
        when 'uncommon' then 1.00
        when 'rare' then 1.05
        when 'epic' then 1.10
        when 'legendary' then 1.15
        when 'icon' then 1.20
        else 1.00
      end
    )));
    v_positioning := least(99, greatest(0, round(coalesce(v_positioning, 50) * (
      case v_rarity 
        when 'common' then 0.88
        when 'uncommon' then 1.00
        when 'rare' then 1.05
        when 'epic' then 1.10
        when 'legendary' then 1.15
        when 'icon' then 1.20
        else 1.00
      end
    )));
    v_handling := least(99, greatest(0, round(coalesce(v_handling, 50) * (
      case v_rarity 
        when 'common' then 0.88
        when 'uncommon' then 1.00
        when 'rare' then 1.05
        when 'epic' then 1.10
        when 'legendary' then 1.15
        when 'icon' then 1.20
        else 1.00
      end
    )));

    -- Calcula overall base (média dos atributos) + bônus de raridade + bônus de especial
    v_base_overall := round((v_pace + v_shooting + v_passing + v_dribbling + v_defending + v_physical) / 6.0);
    v_overall := least(99, 
      v_base_overall + 
      case v_rarity 
        when 'common' then -2
        when 'uncommon' then 0
        when 'rare' then 2
        when 'epic' then 4
        when 'legendary' then 6
        when 'icon' then 8
        else 0
      end + 
      case v_special 
        when 'totw' then 2
        when 'potm' then 2
        when 'revelation' then 1
        when 'legend' then 3
        when 'futsal' then 2
        else 0
      end);

    -- Insere a carta no banco
    insert into public.cards (
      user_id, name, position, sport, rarity, edition, special,
      overall, pace, shooting, passing, dribbling, defending, physical,
      reflexes, positioning, handling, xp, evo_points, upgrades,
      evolution_log, season_stats, image, favorite, is_new, obtained_at, schema_version, player_id,
      nationality, age, club
    ) values (
      v_uid, v_name, v_card_position, 'futsal', v_rarity, '2025/26', v_special,
      v_overall, v_pace, v_shooting, v_passing, v_dribbling, v_defending, v_physical,
      v_reflexes, v_positioning, v_handling, 0, 0, null,
      null, '{}'::jsonb, v_image, false, true, now(), 4,
      lower(replace(v_name, ' ', '-')) || '-' || v_rarity,
      v_nationality, v_age, v_club
    ) returning * into v_card_record;

    return next v_card_record;
  end loop;

  return;
end;
$$