-- The previous migration reopened false wins but left the incorrectly identified ball pocketed.
with reopened_matches as (
  select m.id, m.table_state
  from public.pool_matches m
  where m.status = 'playing'
    and m.finish_reason is null
    and exists (
      select 1
      from jsonb_array_elements(m.table_state->'balls') as ball
      where ball->>'id' = '15' and ball->>'type' = 'eight' and ball->>'pocketed' = 'true'
    )
    and exists (
      select 1
      from public.pool_shots s
      where s.match_id = m.id and s.result->'pocketed' @> '[15]'::jsonb
    )
), corrected_states as (
  select
    m.id,
    jsonb_agg(
      case
        when (ball->>'id')::int = 15 then
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(ball, '{x}', '1.7'::jsonb),
                  '{y}', '0.605'::jsonb
                ),
                '{vx}', '0'::jsonb
              ),
              '{vy}', '0'::jsonb
            ),
            '{pocketed}', 'false'::jsonb
          )
        else ball
      end
      order by (ball->>'id')::int
    ) as balls
  from reopened_matches m
  cross join lateral jsonb_array_elements(m.table_state->'balls') as ball
  group by m.id
)
update public.pool_matches m
set table_state = jsonb_set(m.table_state, '{balls}', c.balls, false),
    updated_at = now()
from corrected_states c
where m.id = c.id;
