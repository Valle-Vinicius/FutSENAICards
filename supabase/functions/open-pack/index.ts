import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const RARITY_MOD = { common: 0.88, uncommon: 1.0, rare: 1.05, epic: 1.10, legendary: 1.15, icon: 1.20 };
const SPECIAL_BONUS = { none: 0, totw: 2, potm: 2, revelation: 1, legend: 3, futsal: 2 };
const RARITY_META = {
  common: { minOvr: 50, maxOvr: 69 },
  uncommon: { minOvr: 60, maxOvr: 74 },
  rare: { minOvr: 70, maxOvr: 79 },
  epic: { minOvr: 80, maxOvr: 87 },
  legendary: { minOvr: 88, maxOvr: 94 },
  icon: { minOvr: 95, maxOvr: 99 },
};

function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }
function calcOverall(pos: string, a: any, gk?: any): number {
  if (pos === 'GK') return Math.round((gk?.reflexes ?? 50) * 0.30 + (gk?.positioning ?? 50) * 0.25 + (a.defending ?? 0) * 0.20 + (a.passing ?? 0) * 0.10 + (a.physical ?? 0) * 0.10 + (a.pace ?? 0) * 0.05);
  if (pos === 'Fixo') return Math.round((a.defending ?? 0) * 0.35 + (a.physical ?? 0) * 0.20 + (a.passing ?? 0) * 0.20 + (a.pace ?? 0) * 0.10 + (a.dribbling ?? 0) * 0.08 + (a.shooting ?? 0) * 0.07);
  if (pos === 'Ala') return Math.round((a.pace ?? 0) * 0.25 + (a.passing ?? 0) * 0.22 + (a.dribbling ?? 0) * 0.20 + (a.shooting ?? 0) * 0.13 + (a.defending ?? 0) * 0.12 + (a.physical ?? 0) * 0.08);
  return Math.round((a.shooting ?? 0) * 0.32 + (a.physical ?? 0) * 0.22 + (a.dribbling ?? 0) * 0.18 + (a.passing ?? 0) * 0.12 + (a.pace ?? 0) * 0.10 + (a.defending ?? 0) * 0.06);
}

const TEMPLATES = [
  { name: 'Pietro Guedes', position: 'Pivo', nationality: 'Brasil', age: 20, club: 'Aurora Futsal', attributes: { pace: 81, shooting: 88, passing: 83, dribbling: 78, defending: 73, physical: 87 }, baseRarity: 'uncommon' },
  { name: 'Muzy', position: 'Pivo', nationality: 'Brasil', age: 21, club: 'Fênix Futsal', attributes: { pace: 78, shooting: 76, passing: 69, dribbling: 66, defending: 67, physical: 80 }, baseRarity: 'uncommon' },
  { name: 'Mateus Lopes', position: 'Pivo', nationality: 'Brasil', age: 19, club: 'Estrela Futsal', attributes: { pace: 41, shooting: 61, passing: 63, dribbling: 61, defending: 50, physical: 55 }, baseRarity: 'uncommon' },
  { name: 'Thiago Tavares', position: 'Ala', nationality: 'Brasil', age: 24, club: 'Leões Futsal', attributes: { pace: 83, shooting: 82, passing: 85, dribbling: 92, defending: 76, physical: 81 }, baseRarity: 'uncommon' },
  { name: 'João Marcos', position: 'Ala', nationality: 'Brasil', age: 23, club: 'Leões Futsal', attributes: { pace: 88, shooting: 77, passing: 75, dribbling: 85, defending: 70, physical: 67 }, baseRarity: 'uncommon' },
  { name: 'Rafael Dutra', position: 'Ala', nationality: 'Brasil', age: 21, club: 'Tigres Futsal', attributes: { pace: 70, shooting: 83, passing: 77, dribbling: 66, defending: 74, physical: 92 }, baseRarity: 'uncommon' },
  { name: 'Vinícius Assunção', position: 'Ala', nationality: 'Brasil', age: 22, club: 'Aurora Futsal', attributes: { pace: 91, shooting: 71, passing: 73, dribbling: 68, defending: 66, physical: 66 }, baseRarity: 'uncommon' },
  { name: 'Enzo Thomas', position: 'Ala', nationality: 'Brasil', age: 19, club: 'Aurora Futsal', attributes: { pace: 79, shooting: 67, passing: 70, dribbling: 84, defending: 58, physical: 65 }, baseRarity: 'uncommon' },
  { name: 'Heitor Barbosa', position: 'Fixo', nationality: 'Brasil', age: 22, club: 'Tigres Futsal', attributes: { pace: 75, shooting: 73, passing: 78, dribbling: 67, defending: 89, physical: 77 }, baseRarity: 'uncommon' },
  { name: 'Gabriel Ortelan', position: 'Fixo', nationality: 'Brasil', age: 21, club: 'Estrela Futsal', attributes: { pace: 58, shooting: 45, passing: 60, dribbling: 52, defending: 80, physical: 80 }, baseRarity: 'uncommon' },
  { name: 'Jonas Daniel', position: 'GK', nationality: 'Brasil', age: 18, club: 'Aurora Futsal', attributes: { pace: 45, shooting: 42, passing: 57, dribbling: 40, defending: 70, physical: 75 }, gkAttributes: { reflexes: 74, positioning: 64, handling: 72 }, baseRarity: 'uncommon' },
  { name: 'Rafinha', position: 'GK', nationality: 'Brasil', age: 22, club: 'Aurora Futsal', attributes: { pace: 60, shooting: 30, passing: 70, dribbling: 40, defending: 86, physical: 62 }, gkAttributes: { reflexes: 82, positioning: 90, handling: 80 }, baseRarity: 'uncommon' },
  { name: 'Monteiro', position: 'Pivo', nationality: 'Brasil', age: 20, club: 'Fênix Futsal', attributes: { pace: 55, shooting: 30, passing: 50, dribbling: 20, defending: 60, physical: 40 }, baseRarity: 'uncommon' },
  { name: 'Eduardo', position: 'Ala', nationality: 'Brasil', age: 21, club: 'Aurora Futsal', attributes: { pace: 80, shooting: 80, passing: 70, dribbling: 70, defending: 60, physical: 85 }, baseRarity: 'common' },
  { name: 'Enzo Antonio', position: 'GK', nationality: 'Brasil', age: 20, club: 'Aurora Futsal', attributes: { pace: 60, shooting: 30, passing: 70, dribbling: 40, defending: 70, physical: 70 }, gkAttributes: { reflexes: 78, positioning: 80, handling: 75 }, baseRarity: 'common' },
  { name: 'Ricardo', position: 'Pivo', nationality: 'Brasil', age: 22, club: 'Fênix Futsal', attributes: { pace: 80, shooting: 85, passing: 78, dribbling: 78, defending: 80, physical: 88 }, baseRarity: 'common' },
];

const PACKS: Record<string, { price: number; cards: number; probabilities: Record<string, number>; position?: string }> = {
  bronze: { price: 500, cards: 3, probabilities: { common: 0.62, uncommon: 0.25, rare: 0.10, epic: 0.025, legendary: 0.004, icon: 0.001 } },
  silver: { price: 1500, cards: 5, probabilities: { common: 0.30, uncommon: 0.35, rare: 0.22, epic: 0.10, legendary: 0.025, icon: 0.005 } },
  gold: { price: 3000, cards: 5, probabilities: { common: 0.10, uncommon: 0.25, rare: 0.35, epic: 0.22, legendary: 0.07, icon: 0.01 } },
  premium: { price: 7500, cards: 5, probabilities: { common: 0.05, uncommon: 0.15, rare: 0.35, epic: 0.30, legendary: 0.12, icon: 0.03 } },
  rareplayers: { price: 5000, cards: 3, probabilities: { common: 0.0, uncommon: 0.10, rare: 0.40, epic: 0.35, legendary: 0.12, icon: 0.03 } },
  legends: { price: 12000, cards: 4, probabilities: { common: 0.0, uncommon: 0.0, rare: 0.20, epic: 0.40, legendary: 0.30, icon: 0.10 } },
  position_gk: { price: 4000, cards: 3, probabilities: { common: 0.20, uncommon: 0.30, rare: 0.30, epic: 0.15, legendary: 0.04, icon: 0.01 }, position: 'GK' },
  choice: { price: 10000, cards: 3, probabilities: { common: 0.0, uncommon: 0.0, rare: 0.20, epic: 0.40, legendary: 0.30, icon: 0.10 }, choice: 3 },
};

function rollRarity(probabilities: Record<string, number>): string {
  const r = Math.random();
  let acc = 0;
  for (const [rarity, prob] of Object.entries(probabilities)) {
    acc += prob;
    if (r < acc) return rarity;
  }
  return 'common';
}

function rollSpecial(): string {
  const r = Math.random();
  if (r < 0.85) return 'none';
  const opts = ['totw', 'potm', 'revelation', 'legend', 'futsal'];
  return opts[Math.floor(Math.random() * opts.length)];
}

function applyModifier(value: number, mod: number): number {
  return Math.max(0, Math.min(99, Math.round(value * mod)));
}

function calculateOverall(pos: string, a: any, gk?: any): number {
  if (pos === 'GK') return Math.round((gk?.reflexes ?? 50) * 0.30 + (gk?.positioning ?? 50) * 0.25 + (a.defending ?? 0) * 0.20 + (a.passing ?? 0) * 0.10 + (a.physical ?? 0) * 0.10 + (a.pace ?? 0) * 0.05);
  if (pos === 'Fixo') return Math.round((a.defending ?? 0) * 0.35 + (a.physical ?? 0) * 0.20 + (a.passing ?? 0) * 0.20 + (a.pace ?? 0) * 0.10 + (a.dribbling ?? 0) * 0.08 + (a.shooting ?? 0) * 0.07);
  if (pos === 'Ala') return Math.round((a.pace ?? 0) * 0.25 + (a.passing ?? 0) * 0.22 + (a.dribbling ?? 0) * 0.20 + (a.shooting ?? 0) * 0.13 + (a.defending ?? 0) * 0.12 + (a.physical ?? 0) * 0.08);
  return Math.round((a.shooting ?? 0) * 0.32 + (a.physical ?? 0) * 0.22 + (a.dribbling ?? 0) * 0.18 + (a.passing ?? 0) * 0.12 + (a.pace ?? 0) * 0.10 + (a.defending ?? 0) * 0.06);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response('Unauthorized', { status: 401, headers: corsHeaders });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SERVICE_ROLE_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return new Response('Unauthorized', { status: 401, headers: corsHeaders });

  const { packId } = await req.json();
  const pack = PACKS[packId];
  if (!pack) return new Response(JSON.stringify({ error: 'Pacote não encontrado.' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  // Check coins
  const { data: profile } = await supabase.from('profiles').select('coins').eq('id', user.id).single();
  if (!profile || profile.coins < pack.price) return new Response(JSON.stringify({ error: 'Saldo insuficiente.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  // Deduct coins
  await supabase.from('profiles').update({ coins: profile.coins - pack.price }).eq('id', user.id);

  // Generate cards
  const cards = [];
  const count = pack.choice || pack.cards;
  for (let i = 0; i < count; i++) {
    const rarity = rollRarity(pack.probabilities);
    const special = rollSpecial();
    const pool = pack.position ? TEMPLATES.filter(t => t.position === pack.position) : TEMPLATES;
    const t = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : TEMPLATES[0];
    const mod = RARITY_MOD[rarity];
    const a = t.attributes;
    const attrs = {
      pace: applyModifier(a.pace, mod), shooting: applyModifier(a.shooting, mod), passing: applyModifier(a.passing, mod),
      dribbling: applyModifier(a.dribbling, mod), defending: applyModifier(a.defending, mod), physical: applyModifier(a.physical, mod),
    };
    const gk = t.gkAttributes ? { reflexes: applyModifier(t.gkAttributes.reflexes, mod), positioning: applyModifier(t.gkAttributes.positioning, mod), handling: applyModifier(t.gkAttributes.handling, mod) } : null;
    let overall = calcOverall(t.position, attrs, gk);
    const bonus = SPECIAL_BONUS[special] ?? 0;
    overall = Math.min(99, overall + bonus);
    const meta = RARITY_META[rarity];
    overall = Math.max(meta.minOvr, Math.min(meta.maxOvr, overall));

    const card = {
      user_id: user.id,
      player_id: t.name.toLowerCase().replace(/\s+/g, '-') + '-' + rarity,
      name: t.name, position: t.position, sport: 'futsal', nationality: t.nationality, age: t.age, club: t.club,
      rarity, edition: '2025/26', special, overall, image: t.image,
      pace: attrs.pace, shooting: attrs.shooting, passing: attrs.passing, dribbling: attrs.dribbling, defending: attrs.defending, physical: attrs.physical,
      ...(gk || {}), xp: 0, evo_points: 0, upgrades: {}, evolution_log: [], season_stats: { matches: 0, goals: 0, assists: 0 },
      favorite: false, is_new: true, obtained_at: new Date().toISOString(), schema_version: 2,
    };
    const { data: inserted, error: insertError } = await supabase.from('cards').insert(card).select().single();
    if (insertError) {
      // refund coins on failure
      await supabase.from('profiles').update({ coins: profile.coins }).eq('id', user.id);
      return new Response(JSON.stringify({ error: 'Erro ao gerar carta.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    cards.push({ ...inserted, uid: inserted.id });
  }

  // Update XP
  await supabase.from('profiles').update({ xp: (profile.xp || 0) + 50 }).eq('id', user.id);

  return new Response(JSON.stringify({ cards, coins: profile.coins - pack.price }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
