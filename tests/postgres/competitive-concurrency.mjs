import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
const setupFile = fileURLToPath(new URL('./competitive-concurrency-setup.sql', import.meta.url));
const bootstrapFile = fileURLToPath(new URL('./competitive-concurrency-bootstrap.sql', import.meta.url));
const competitiveAssertionsFile = fileURLToPath(new URL('../../supabase/tests/competitive_leaderboard.sql', import.meta.url));
const integrityAssertionsFile = fileURLToPath(new URL('../../supabase/tests/pvp_integrity.sql', import.meta.url));

if (!databaseUrl) throw new Error('Set DATABASE_URL to an isolated local PostgreSQL or Supabase database.');
if (process.env.PVP_TEST_ALLOW_RESET !== '1') {
  throw new Error('Set PVP_TEST_ALLOW_RESET=1 only for a disposable local database; the fixture resets its fixed test IDs.');
}

const connection = new URL(databaseUrl);
if (!['localhost', '127.0.0.1', '::1'].includes(connection.hostname) || !['5432', '54322'].includes(connection.port)) {
  throw new Error('Refusing to run destructive test fixtures unless DATABASE_URL points to localhost port 5432 or 54322.');
}

const ids = {
  users: [
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000004',
  ],
  challenges: {
    same: '00000000-0000-4000-8000-000000001001',
    sharedA: '00000000-0000-4000-8000-000000001002',
    sharedB: '00000000-0000-4000-8000-000000001003',
    rollback: '00000000-0000-4000-8000-000000001004',
    ai: '00000000-0000-4000-8000-000000001005',
    incomplete: '00000000-0000-4000-8000-000000001006',
    cancelled: '00000000-0000-4000-8000-000000001007',
    friendly: '00000000-0000-4000-8000-000000001008',
  },
  tokens: {
    same: '00000000-0000-4000-8000-000000002001',
    sharedA: '00000000-0000-4000-8000-000000002002',
    sharedB: '00000000-0000-4000-8000-000000002003',
    rollback: '00000000-0000-4000-8000-000000002004',
    ai: '00000000-0000-4000-8000-000000002005',
    incomplete: '00000000-0000-4000-8000-000000002006',
    cancelled: '00000000-0000-4000-8000-000000002007',
    friendly: '00000000-0000-4000-8000-000000002008',
  },
};

function createClient(applicationName = 'pvp_integrity_test') {
  const url = new URL(databaseUrl);
  url.searchParams.set('application_name', applicationName);
  return new Client({ connectionString: url.toString() });
}

async function withClient(callback, applicationName) {
  const client = createClient(applicationName);
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

async function query(sql, values = [], applicationName = 'pvp_integrity_test') {
  if (typeof values === 'string') {
    applicationName = values;
    values = [];
  }
  return withClient(client => client.query(sql, values), applicationName);
}

async function runFile(file) {
  const sql = await readFile(file, 'utf8');
  await query(sql, 'pvp_integrity_setup');
}

async function bootstrapAndMigrate() {
  await runFile(bootstrapFile);
  for (const migrationName of [
    '20261104013505_pvp_authority_reconciliation.sql',
    '20261104150000_competitive_leaderboard.sql',
    '20261104154500_pvp_competitive_integrity.sql',
    '20261104165000_competitive_account_anonymization.sql',
  ]) {
    const migrationFile = fileURLToPath(new URL(`../../supabase/migrations/${migrationName}`, import.meta.url));
    await runFile(migrationFile);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function executeAsRole(role, userId, statement, applicationName = `pvp_role_${role}_test`) {
  return withClient(async client => {
    await client.query('begin');
    try {
      await client.query(`set local role ${role}`);
      await client.query('select set_config($1, $2, true), set_config($3, $4, true)', [
        'request.jwt.claim.role', role, 'request.jwt.claim.sub', userId,
      ]);
      const result = await client.query(statement);
      await client.query('commit');
      return { result };
    } catch (error) {
      await client.query('rollback');
      return { error };
    }
  }, applicationName);
}

async function assertRoleWriteBlocked(role, userId, statement, description) {
  const outcome = await executeAsRole(role, userId, statement);
  if (!outcome.error) {
    if (outcome.result?.rowCount === 0 && /^\s*(UPDATE|DELETE)\b/i.test(statement)) return;
    throw new Error(`${role} unexpectedly succeeded: ${description}`);
  }
  if (/permission denied to set role|role .* does not exist/i.test(outcome.error.message)) {
    throw new Error(`Could not establish the real ${role} database role: ${outcome.error.message}`);
  }
  if (!['42501', 'P0001', '23505', '23503'].includes(outcome.error.code)) {
    throw new Error(`${role} ${description} failed for an unexpected reason: ${outcome.error.message}`);
  }
}

async function assertRoleExists(role) {
  const outcome = await executeAsRole(role, ids.users[0], 'select current_user');
  assert(outcome.result?.rows[0]?.current_user === role, `Could not establish the real ${role} database role.`);
}

async function completeAsServiceRole(client, challengeId, token) {
  try {
    await client.query('set local role service_role');
    await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
    await client.query("set local statement_timeout = '30s'");
    const result = await client.query(
      'select public.complete_challenge($1, $2, pvp_test.match_result(12345)) as result',
      [challengeId, token],
    );
    await client.query('commit');
    return result.rows[0].result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

async function waitForBlockedSessions(gate, names, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let lastActivity = [];
  while (Date.now() < deadline) {
    const result = await gate.query(
      `select application_name, state, wait_event_type, wait_event
       from pg_stat_activity
       where application_name = any($1::text[])`,
      [names],
    );
    lastActivity = result.rows;
    if (result.rows.length === names.length
        && result.rows.every(session => session.wait_event_type === 'Lock')) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Concurrent sessions did not reach the PostgreSQL lock barrier: ${JSON.stringify(lastActivity)}`);
}

async function runConcurrentPair(lockId, lockSql, calls) {
  const gate = createClient(`pvp_test_gate_${lockId}`);
  await gate.connect();
  await gate.query('begin');
  await gate.query(lockSql);

  const sessions = calls.map((_, index) => ({
    name: `pvp_test_${lockId}_${index}`,
    client: createClient(`pvp_test_${lockId}_${index}`),
  }));
  let barrierError;

  try {
    await Promise.all(sessions.map(session => session.client.connect()));
    await Promise.all(sessions.map(session => session.client.query('begin')));
    const operations = sessions.map((session, index) =>
      completeAsServiceRole(session.client, calls[index].challengeId, calls[index].token));
    try {
      await waitForBlockedSessions(gate, sessions.map(session => session.name));
    } catch (error) {
      barrierError = error;
    }

    await gate.query('commit');
    const outcomes = await Promise.allSettled(operations);
    if (barrierError) throw barrierError;
    const rejected = outcomes.find(outcome => outcome.status === 'rejected');
    if (rejected) throw rejected.reason;
    return outcomes.map(outcome => outcome.value);
  } finally {
    await Promise.all(sessions.map(session => session.client.end()));
    await gate.end();
  }
}

async function readCounts(challengeIds) {
  const result = await query(
    `select
       (select count(*)::integer from public.competitive_rating_events where challenge_id = any($1::uuid[])) as events,
       (select count(*)::integer from public.challenge_rewards where challenge_id = any($1::uuid[])) as rewards,
       (select count(*)::integer from public.matches where challenge_id = any($1::uuid[])) as matches,
       (select count(*)::integer from (
          select challenge_id, user_id from public.matches
          where challenge_id = any($1::uuid[])
          group by challenge_id, user_id having count(*) <> 1
        ) duplicates) as duplicate_history_users`,
    [challengeIds],
    'pvp_integrity_read_counts',
  );
  return result.rows[0];
}

async function assertTwoParticipantsPerChallenge(challengeIds) {
  const result = await query(
    `select count(*)::integer as invalid_groups from (
       select challenge_id from public.competitive_rating_events
       where challenge_id = any($1::uuid[])
       group by challenge_id having count(*) <> 2 or count(distinct user_id) <> 2
       union all
       select challenge_id from public.challenge_rewards
       where challenge_id = any($1::uuid[])
       group by challenge_id having count(*) <> 2 or count(distinct user_id) <> 2
       union all
       select challenge_id from public.matches
       where challenge_id = any($1::uuid[])
       group by challenge_id having count(*) <> 2 or count(distinct user_id) <> 2
     ) invalid`,
    [challengeIds],
    'pvp_integrity_participants',
  );
  assert(result.rows[0].invalid_groups === 0, 'A completed test challenge did not have exactly two rows for its two participants.');
}

async function assertDirectPvpWritesAreBlocked() {
  const userId = ids.users[0];
  for (const role of ['anon', 'authenticated']) {
    await assertRoleExists(role);
    await assertRoleWriteBlocked(role, userId,
      `insert into public.matches (user_id, sport, match_type, challenge_id, status, home_score, away_score, opponent)
       values ('${userId}', 'futsal', 'pvp', null, 'completed', 2, 1, 'forged')`,
      'PvP match insert');
    await assertRoleWriteBlocked(role, userId,
      `insert into public.matches (user_id, sport, match_type, challenge_id, status, home_score, away_score, opponent)
       values ('${userId}', 'futsal', 'friendly', '${ids.challenges.same}', 'completed', 2, 1, 'forged')`,
      'challenge-linked match insert');
    await assertRoleWriteBlocked(role, userId, 'truncate public.matches', 'TRUNCATE matches');
  }

  for (const [statement, description] of [
    [`update public.matches set match_type = 'pvp' where user_id = '${userId}' and opponent = 'Local AI guard test'`, 'match_type conversion'],
    [`update public.matches set challenge_id = '${ids.challenges.same}' where user_id = '${userId}' and opponent = 'Local AI guard test'`, 'challenge_id assignment'],
    [`update public.matches set home_score = 99 where user_id = '${userId}' and challenge_id = '${ids.challenges.same}'`, 'official PvP result modification'],
    [`update public.matches set opponent = 'tampered' where user_id = '${userId}' and challenge_id = '${ids.challenges.same}'`, 'official PvP result update'],
    [`delete from public.matches where user_id = '${userId}' and challenge_id = '${ids.challenges.same}'`, 'official PvP history deletion'],
  ]) {
    await assertRoleWriteBlocked('authenticated', userId, statement, description);
  }

  const localInsert = await executeAsRole('authenticated', userId,
    `insert into public.matches (user_id, sport, match_type, challenge_id, status, home_score, away_score, opponent)
     values ('${userId}', 'futsal', 'friendly', null, 'completed', 2, 1, 'Local AI guard test')`);
  assert(!localInsert.error, `Authenticated local/AI history insert failed: ${localInsert.error?.message}`);

  const localDelete = await executeAsRole('authenticated', userId,
    `delete from public.matches where user_id = '${userId}' and opponent = 'Local AI guard test'`);
  assert(!localDelete.error, `Authenticated local/AI history delete failed: ${localDelete.error?.message}`);

  await assertRoleWriteBlocked('service_role', userId,
    `insert into public.matches (user_id, sport, match_type, challenge_id, status, home_score, away_score, opponent)
     values ('${userId}', 'futsal', 'pvp', '${ids.challenges.same}', 'completed', 2, 1, 'forged retry')`,
    'direct service_role PvP match insert');
  await assertRoleWriteBlocked('service_role', userId, 'truncate public.matches', 'service_role TRUNCATE matches');
}

async function assertProtectedWritesAreBlocked() {
  const userId = ids.users[0];
  const blockedOperations = [
    [`insert into public.challenges (id, challenger_id, challenged_id, status) values ('00000000-0000-4000-8000-000000001099', '${userId}', '${ids.users[1]}', 'pending')`, 'direct challenge insert'],
    [`update public.challenges set result = '{}'::jsonb where id = '${ids.challenges.same}'`, 'completed challenge result update'],
    [`delete from public.challenges where id = '${ids.challenges.same}'`, 'challenge deletion'],
    [`insert into public.challenge_rewards (challenge_id, user_id) values ('${ids.challenges.rollback}', '${ids.users[3]}')`, 'manual reward insert'],
    [`update public.challenge_rewards set created_at = created_at + interval '1 second' where challenge_id = '${ids.challenges.same}' and user_id = '${userId}'`, 'reward modification'],
    [`delete from public.challenge_rewards where challenge_id = '${ids.challenges.same}' and user_id = '${userId}'`, 'reward deletion'],
    [`insert into public.player_competitive_ratings (user_id) values ('${ids.users[3]}')`, 'manual rating insert'],
    [`update public.player_competitive_ratings set rating = rating + 5000 where user_id = '${ids.users[1]}'`, 'rating modification'],
    [`delete from public.player_competitive_ratings where user_id = '${ids.users[1]}'`, 'rating deletion'],
    [`insert into public.competitive_rating_events (challenge_id, user_id, opponent_id, rating_before, rating_after, rating_change, result, algorithm_version) values ('${ids.challenges.rollback}', '${ids.users[3]}', '${ids.users[1]}', 1000, 1016, 16, 'win', 'forged')`, 'manual rating event insert'],
    [`update public.competitive_rating_events set created_at = created_at + interval '1 second' where challenge_id = '${ids.challenges.same}' and user_id = '${userId}'`, 'rating event modification'],
    [`delete from public.competitive_rating_events where challenge_id = '${ids.challenges.same}' and user_id = '${userId}'`, 'rating event deletion'],
    [`select public.delete_account_owned_data('${userId}')`, 'authenticated account-data deletion RPC'],
  ];

  for (const role of ['anon', 'authenticated']) {
    for (const [statement, description] of blockedOperations) {
      await assertRoleWriteBlocked(role, userId, statement, description);
    }
  }

  await assertRoleExists('service_role');
  for (const [statement, description] of [
    [`insert into public.competitive_rating_events (challenge_id, user_id, opponent_id, rating_before, rating_after, rating_change, result, algorithm_version) values ('${ids.challenges.rollback}', '${ids.users[3]}', '${ids.users[1]}', 1000, 1016, 16, 'win', 'forged')`, 'service_role manual rating event insert'],
    [`update public.player_competitive_ratings set rating = rating + 5000 where user_id = '${ids.users[1]}'`, 'service_role direct rating modification'],
    [`update public.challenges set result = '{}'::jsonb where id = '${ids.challenges.same}'`, 'service_role completed challenge modification'],
    [`update public.challenge_rewards set user_id = '${ids.users[3]}' where challenge_id = '${ids.challenges.same}' and user_id = '${userId}'`, 'service_role reward modification'],
    [`delete from public.matches where user_id = '${userId}' and challenge_id = '${ids.challenges.same}'`, 'service_role PvP history deletion'],
    ['truncate public.competitive_rating_events', 'service_role rating ledger TRUNCATE'],
  ]) {
    await assertRoleWriteBlocked('service_role', userId, statement, description);
  }
}

async function assertRollbackOnEventFailure() {
  const challengeId = ids.challenges.rollback;
  const token = ids.tokens.rollback;
  await query(`
    create or replace function pvp_test.fail_rating_event()
    returns trigger language plpgsql as $$
    begin
      if new.challenge_id = '${challengeId}'::uuid
         and new.user_id = '${ids.users[2]}'::uuid then
        raise exception 'PVP_TEST_EVENT_FAILURE';
      end if;
      return new;
    end;
    $$;
    drop trigger if exists pvp_test_fail_rating_event on public.competitive_rating_events;
    create trigger pvp_test_fail_rating_event
      before insert on public.competitive_rating_events
      for each row execute function pvp_test.fail_rating_event();
  `);

  const outcome = await executeAsRole('service_role', ids.users[0],
    `select public.complete_challenge('${challengeId}', '${token}', pvp_test.match_result(12345))`);
  await query(`
    drop trigger pvp_test_fail_rating_event on public.competitive_rating_events;
    drop function pvp_test.fail_rating_event();
  `);
  assert(outcome.error?.message.includes('PVP_TEST_EVENT_FAILURE'), 'Expected failure while writing the second rating event did not occur.');

  const state = await query(
    `select
       (select status from public.challenges where id = $1) as status,
       (select count(*)::integer from public.competitive_rating_events where challenge_id = $1) as events,
       (select count(*)::integer from public.challenge_rewards where challenge_id = $1) as rewards,
       (select count(*)::integer from public.matches where challenge_id = $1) as matches,
       (select matches_played from public.player_competitive_ratings where user_id = $2) as home_played,
       (select matches_played from public.player_competitive_ratings where user_id = $3) as away_played`,
    [challengeId, ids.users[1], ids.users[2]],
  );
  const row = state.rows[0];
  assert(row.status === 'accepted' && row.events === 0 && row.rewards === 0 && row.matches === 0,
    'Failed rating event did not roll back challenge, rewards, and history.');
  assert(row.home_played === 2 && row.away_played === 1, 'Failed rating event did not roll back both player ratings.');
}

async function assertIneligibleChallengeDoesNotRate(challengeId, token, mode, description) {
  const outcome = await executeAsRole('service_role', ids.users[0],
    `select public.complete_challenge('${challengeId}', '${token}', pvp_test.match_result(12345, '${mode}'))`);
  if (!outcome.error) throw new Error(`${description} unexpectedly completed.`);
  const counts = await readCounts([challengeId]);
  assert(counts.events === 0 && counts.rewards === 0 && counts.matches === 0,
    `${description} wrote rating, reward, or history rows.`);
}

async function assertAccountAnonymization() {
  const userId = ids.users[0];
  const opponentId = ids.users[1];
  const before = await query(
    'select rating, matches_played, wins, losses, draws from public.player_competitive_ratings where user_id = $1',
    [opponentId],
  );
  const previousRating = before.rows[0];
  const anonIdBefore = await query(
    `select id from public.pvp_anonymized_players where source_user_id = $1`,
    [userId],
  );
  assert(anonIdBefore.rowCount === 0, 'Fixture unexpectedly already has an account-anonymization mapping.');

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const outcome = await executeAsRole('service_role', userId, `select public.delete_account_owned_data('${userId}')`);
    assert(!outcome.error, `Privileged account anonymization failed: ${outcome.error?.message}`);
  }

  const anonymized = await query(
    `select id from public.pvp_anonymized_players where source_user_id = $1`,
    [userId],
  );
  assert(anonymized.rowCount === 1, 'Account deletion did not create exactly one anonymized identity.');
  const anonymizedId = anonymized.rows[0].id;
  assert(anonymizedId !== userId, 'The anonymized identity reused the deleted account UUID.');

  const preserved = await query(
    `select
       (select count(*)::integer from public.challenges where id = any($1::uuid[])) as challenges,
       (select count(*)::integer from public.competitive_rating_events where challenge_id = any($1::uuid[])) as events,
       (select count(*)::integer from public.challenge_rewards where challenge_id = any($1::uuid[])) as rewards,
       (select count(*)::integer from public.matches where challenge_id = any($1::uuid[]) and user_id = any($2::uuid[])) as opponent_matches,
       (select count(*)::integer from public.matches where challenge_id = any($1::uuid[]) and user_id = $3) as deleted_user_matches,
       (select count(*)::integer from public.player_competitive_ratings where user_id = $3) as deleted_user_rating,
       (select count(*)::integer from public.competitive_rating_events where user_id = $3 or opponent_id = $3) as direct_old_user_events,
       (select count(*)::integer from public.competitive_rating_events where user_id = $4 or opponent_id = $4) as anon_event_refs,
       (select count(*)::integer from public.challenge_rewards where user_id = $4) as anon_rewards`,
    [[ids.challenges.same, ids.challenges.sharedA, ids.challenges.sharedB, '00000000-0000-4000-8000-000000001009'],
      [ids.users[1], ids.users[2]], userId, anonymizedId],
  );
  const counts = preserved.rows[0];
  assert(counts.challenges === 4 && counts.events === 6 && counts.rewards === 6,
    'Account deletion did not preserve all completed PvP challenges, rating events, and rewards.');
  assert(counts.opponent_matches === 3 && counts.deleted_user_matches === 0,
    'Account deletion did not retain only the surviving opponent match history.');
  assert(counts.deleted_user_rating === 0 && counts.direct_old_user_events === 0,
    'Account deletion retained the deleted user rating aggregate or direct user references.');
  assert(counts.anon_event_refs === 6 && counts.anon_rewards === 3,
    'Competitive ledger and rewards were not consistently reassigned to the pseudonymous identity.');

  const retainedRating = await query(
    'select rating, matches_played, wins, losses, draws from public.player_competitive_ratings where user_id = $1',
    [opponentId],
  );
  assert(JSON.stringify(retainedRating.rows[0]) === JSON.stringify(previousRating),
    "Account deletion changed the opponent's competitive rating or statistics.");

  const redacted = await query(
    `select challenger_id, challenged_id, home_snapshot, away_snapshot, result, playback_state
     from public.challenges where id = $1`,
    [ids.challenges.same],
  );
  const challenge = redacted.rows[0];
  assert([challenge.challenger_id, challenge.challenged_id].includes(anonymizedId),
    'The canonical challenge participant was not pseudonymized.');
  assert(challenge.home_snapshot.cards.length === 0 && challenge.away_snapshot.cards.length === 0,
    'Card identities remain in an anonymized challenge snapshot.');
  assert(challenge.result.frames === undefined && challenge.result.playerStats === undefined,
    'Playback frames or player statistics remain in the anonymized competitive result.');
  assert(challenge.result.config.homeName === 'Jogador removido' && challenge.result.config.awayName === 'Jogador removido',
    'Identifying player names remain in the anonymized result.');

  const identityProfile = await withClient(async client => {
    await client.query('select set_config($1, $2, false)', ['request.jwt.claim.sub', opponentId]);
    return client.query('select public.competitive_get_profile($1) as profile', [anonymizedId]);
  }, 'pvp_account_profile');
  const accountProfile = identityProfile.rows[0].profile;
  assert(accountProfile.name === 'Jogador removido' && accountProfile.avatarUrl === null
    && accountProfile.matchesPlayed === 0 && accountProfile.position === null,
  'Anonymized identity was not hidden from the competitive profile/ranking.');

  const matching = await withClient(async client => {
    await client.query('select set_config($1, $2, false)', ['request.jwt.claim.sub', opponentId]);
    return client.query(
      `select user_id, name, rating
       from public.competitive_search_head_to_head_opponents($1, 'Jogador removido', 10)
       where user_id = $2`,
      [opponentId, anonymizedId],
    );
  }, 'pvp_account_h2h_search');
  assert(matching.rowCount === 1 && matching.rows[0].name === 'Jogador removido' && matching.rows[0].rating === null,
    'H2H search does not expose a redacted historical opponent separately from ranked players.');

  await query('delete from auth.users where id = $1', [userId]);
  const orphanedMapping = await query(
    'select source_user_id from public.pvp_anonymized_players where id = $1',
    [anonymizedId],
  );
  assert(orphanedMapping.rows[0].source_user_id === null,
    'Deleting the Auth identity did not destroy the temporary source-to-pseudonym link.');
  const authStillExists = await query('select count(*)::integer as count from auth.users where id = $1', [userId]);
  assert(authStillExists.rows[0].count === 0, 'Auth account was not deleted after anonymization.');
}

if (process.env.PVP_TEST_BOOTSTRAP === '1') {
  await bootstrapAndMigrate();
}
await runFile(setupFile);
await runFile(competitiveAssertionsFile);
await runFile(integrityAssertionsFile);

const sameResults = await runConcurrentPair(1,
  `select id from public.challenges where id = '${ids.challenges.same}' for update`,
  [
    { challengeId: ids.challenges.same, token: ids.tokens.same },
    { challengeId: ids.challenges.same, token: ids.tokens.same },
  ]);
assert(JSON.stringify(sameResults[0]) === JSON.stringify(sameResults[1]),
  'Concurrent retries did not return the same canonical result.');

let sameCounts = await readCounts([ids.challenges.same]);
assert(sameCounts.events === 2 && sameCounts.rewards === 2 && sameCounts.matches === 2,
  'Same-challenge concurrency did not produce exactly two events, rewards, and history rows.');
const sameRatings = await query(
  `select count(*)::integer as count from public.player_competitive_ratings
   where user_id = any($1::uuid[]) and matches_played = 1`,
  [[ids.users[0], ids.users[1]]],
);
assert(sameRatings.rows[0].count === 2, 'Same-challenge concurrency did not update both ratings exactly once.');

const retry = await query(
  `select public.complete_challenge($1, $2, pvp_test.match_result(12345)) as result
   from (select set_config('request.jwt.claim.role', 'service_role', false)) role_setting`,
  [ids.challenges.same, ids.tokens.same],
);
assert(JSON.stringify(retry.rows[0].result) === JSON.stringify(sameResults[0]),
  'Retry after completion did not return the canonical stored result.');
sameCounts = await readCounts([ids.challenges.same]);
assert(sameCounts.events === 2 && sameCounts.rewards === 2 && sameCounts.matches === 2
  && sameCounts.duplicate_history_users === 0,
'Retry after completion duplicated rating, rewards, or history.');
await assertTwoParticipantsPerChallenge([ids.challenges.same]);

const sharedResults = await runConcurrentPair(2,
  `select user_id from public.player_competitive_ratings where user_id = '${ids.users[0]}' for update`,
  [
    { challengeId: ids.challenges.sharedA, token: ids.tokens.sharedA },
    { challengeId: ids.challenges.sharedB, token: ids.tokens.sharedB },
  ]);
assert(sharedResults.length === 2, 'Concurrent challenges with a shared player did not both complete.');
const sharedCounts = await readCounts([ids.challenges.sharedA, ids.challenges.sharedB]);
assert(sharedCounts.events === 4 && sharedCounts.rewards === 4 && sharedCounts.matches === 4
  && sharedCounts.duplicate_history_users === 0,
'Shared-player concurrency produced incomplete or duplicate ledger, rewards, or history.');
await assertTwoParticipantsPerChallenge([ids.challenges.sharedA, ids.challenges.sharedB]);
const sharedPlayer = await query(
  'select matches_played from public.player_competitive_ratings where user_id = $1',
  [ids.users[0]],
);
assert(sharedPlayer.rows[0].matches_played === 3, 'Shared player rating updates were lost or duplicated.');

const historicalSeries = await withClient(async client => {
  await client.query('select set_config($1, $2, false)', ['request.jwt.claim.sub', ids.users[0]]);
  const h2h = await client.query(
    'select public.competitive_get_head_to_head($1, $2, 20, 0) as history',
    [ids.users[0], ids.users[1]],
  );
  const competitive = await client.query(
    'select challenge_id from public.competitive_get_rating_history($1, 50, 0) where challenge_id = $2',
    [ids.users[0], '00000000-0000-4000-8000-000000001009'],
  );
  return { h2h: h2h.rows[0].history, competitive };
}, 'pvp_history_series_test');
assert(historicalSeries.h2h.historyType === 'historical_pvp'
  && historicalSeries.h2h.totalMatches === 3
  && historicalSeries.h2h.matches.some(match => match.challenge_id === '00000000-0000-4000-8000-000000001009'),
'Historical H2H did not include the official pre-ELO PvP challenge.');
assert(historicalSeries.competitive.rowCount === 0,
  'The pre-ELO challenge was incorrectly included in competitive rating history.');

await assertRollbackOnEventFailure();
for (const [challengeId, token, mode, label] of [
  [ids.challenges.ai, ids.tokens.ai, 'ai', 'AI match'],
  [ids.challenges.friendly, ids.tokens.friendly, 'friendly', 'Friendly match'],
  [ids.challenges.incomplete, ids.tokens.incomplete, 'pvp', 'Incomplete challenge'],
  [ids.challenges.cancelled, ids.tokens.cancelled, 'pvp', 'Cancelled challenge'],
]) {
  await assertIneligibleChallengeDoesNotRate(challengeId, token, mode, label);
}

const eligibleRatings = await query(
  `select count(*)::integer as count from public.player_competitive_ratings where
   (user_id = $1 and matches_played = 3) or
   (user_id = $2 and matches_played = 2) or
   (user_id = $3 and matches_played = 1)`,
  [ids.users[0], ids.users[1], ids.users[2]],
);
assert(eligibleRatings.rows[0].count === 3, 'AI, incomplete, or cancelled challenges changed a player rating.');

const localInsert = await executeAsRole('authenticated', ids.users[0],
  `insert into public.matches (user_id, sport, match_type, challenge_id, status, home_score, away_score, opponent)
   values ('${ids.users[0]}', 'futsal', 'friendly', null, 'completed', 2, 1, 'Local AI guard test')`);
assert(!localInsert.error, `Local/AI history insertion failed: ${localInsert.error?.message}`);

await assertDirectPvpWritesAreBlocked();
await assertProtectedWritesAreBlocked();
await assertAccountAnonymization();

const unchangedRatings = await query(
  `select count(*)::integer as count from public.player_competitive_ratings where
   (user_id = $1 and matches_played = 3) or
   (user_id = $2 and matches_played = 2) or
   (user_id = $3 and matches_played = 1)`,
  [ids.users[0], ids.users[1], ids.users[2]],
);
assert(unchangedRatings.rows[0].count === 2,
  'A local/AI history write changed competitive ratings or account deletion changed the surviving opponent rating.');

console.log('PASS: PostgreSQL concurrent completion/retry, shared-player locking, atomic ELO/rewards/history, rollback, ineligible matches, role write denials/TRUNCATE, local history, and account anonymization preserving opponent ratings.');
