-- Migration: Normalizar formato de saved_squads.starters e garantir um único primário por usuário

-- 1) Converter elementos do tipo objeto {position, uid} para strings de uid em starters
update saved_squads
set starters = sub.new_starters
from (
  select id, jsonb_agg(
    case
      when jsonb_typeof(elem) = 'object' then to_jsonb(elem->>'uid')
      else to_jsonb(elem::text)
    end
    order by ord
  ) as new_starters
  from saved_squads, jsonb_array_elements(starters) with ordinality as t(elem, ord)
  group by id
) sub
where saved_squads.id = sub.id;

-- 2) Deixar apenas um elenco primário por usuário (mantém o mais recente)
update saved_squads
set is_primary = false
where id in (
  select id from (
    select id,
      row_number() over (partition by user_id order by case when is_primary then 0 else 1 end, created_at desc) as rn
    from saved_squads
  ) t
  where rn > 1 and is_primary = true
);

-- 3) Garantir um único elenco primário por usuário em saved_squads
create unique index if not exists one_primary_saved_squad_per_user
on saved_squads (user_id)
where is_primary = true;
