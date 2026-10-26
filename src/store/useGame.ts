import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import type { GameState, PlayerCard, Squad, SavedSquad, Listing } from '../types';
import { DEFAULT_PACKS, DEFAULT_MISSIONS, DEFAULT_ACHIEVEMENTS, rollRarity, levelFromXp, FORMATIONS_FUTSAL } from '../lib/game';
import { supabase } from '../lib/supabase';
import { getCards, addCard } from '../lib/services/cards';
import { addMatch } from '../lib/services/matches';
import { saveSquad as saveSquadService, getSavedSquads } from '../lib/services/squads';
import { getMissions, upsertMissions, claimMissionDb } from '../lib/services/missions';
import { getAchievements, upsertAchievements } from '../lib/services/achievements';
import { recordSBCCompletion } from '../lib/services/sbc';
import { getListings, createListing, cancelListing as cancelListingService } from '../lib/services/marketplace';
import { generatePlayerCard, randomTemplate } from '../data/players';
import { RARITY_META, SPECIAL_META } from '../types';

interface Actions {
  init: () => void;
  addCoins: (n: number, reason: string) => void;
  spendCoins: (n: number, reason: string) => boolean;
  addXp: (n: number) => void;
  openPack: (packId: string) => { cards: PlayerCard[] } | null;
  claimDaily: () => { ok: boolean; amount: number };
  toggleFavorite: (uid: string) => void;
  markSeen: (uids: string[]) => void;
  updateMissionProgress: () => void;
  claimMission: (id: string) => boolean;
  setSquadSport: (sport: 'futsal') => void;
  assignSlot: (sport: 'futsal', index: number, cardUid: string | null, bench?: boolean, benchIndex?: number) => void;
  clearSlot: (sport: 'futsal', index: number, bench?: boolean, benchIndex?: number) => void;
  setFormation: (sport: 'futsal', formation: string) => void;
  resetAll: () => void;
  unlockLegendary: () => void;
  addEvent: () => void;
  saveSquad: (name: string, sport: 'futsal') => string;
  deleteSquad: (id: string) => void;
  setPrimarySquad: (id: string) => void;
  loadSquad: (id: string) => void;
  addCompareHistory: (aUid: string, bUid: string) => void;
  addMatchHistory: (entry: { id: string; date: number; sport: string; homeScore: number; awayScore: number; opponent: string }) => void;
  updateSettings: (s: Partial<{ audio: boolean; animations: boolean; highContrast: boolean }>) => void;
  addPlayerXp: (uid: string, amount: number) => void;
  upgradePlayer: (uid: string, attr: 'pace' | 'shooting' | 'passing' | 'dribbling' | 'defending' | 'physical') => boolean;
  recordMatchStats: (uid: string, goals: number, assists: number) => void;
  convertDuplicates: () => number;
  recordEvolution: (uid: string, attr: string) => void;
  listCard: (cardUid: string, price: number, buyNow: number, hours: number) => string | null;
  cancelListing: (id: string) => void;
  buyListing: (id: string) => boolean;
  bidListing: (id: string, amount: number) => boolean;
  previewPack: (packId: string) => PlayerCard[] | null;
  claimPreviewedCard: (card: PlayerCard) => void;
  completeSBC: (sbcId: string, cardUids: string[]) => boolean;
  seedMarket: () => void;
  recordPrice: (cardName: string, price: number) => void;
  recordTransfer: (cardName: string, price: number, type: 'buy' | 'sell') => void;
}

const seedCards = (): PlayerCard[] => {
  const out: PlayerCard[] = [];
  const rarities: any[] = ['common','common','uncommon','rare','uncommon'];
  for (let i = 0; i < 5; i++) {
    const t = randomTemplate();
    out.push(generatePlayerCard(t, rarities[i], 'none'));
  }
  return out;
};
const initialSquadFutsal = (): Squad => ({
  sport: 'futsal',
  formation: '1-2-1',
  starters: [
    { position: 'GK', uid: null },
    { position: 'Fixo', uid: null },
    { position: 'Ala', uid: null },
    { position: 'Ala', uid: null },
    { position: 'Pivo', uid: null },
  ],
  bench: [null, null, null, null, null],
});

const initialState: GameState = {
  coins: 5000,
  xp: 0,
  level: 1,
  cards: seedCards(),
  packsOpened: 0,
  missions: DEFAULT_MISSIONS.map(m => ({ ...m })),
  achievements: DEFAULT_ACHIEVEMENTS.map(a => ({ ...a })),
  transactions: [],
  squads: { futsal: initialSquadFutsal() },
  savedSquads: [],
  compareHistory: [],
  matchHistory: [],
  listings: [],
  sbcs: [
    { id: 'sbc1', title: 'Desafio Ouro', description: 'Entregue 5 cartas com overall mínimo 75.', requirements: { minOverall: 75, count: 5 }, reward: { type: 'pack', value: 'gold' }, repeatable: false },
    { id: 'sbc2', title: 'Desafio Futsal', description: 'Entregue 1 goleiro, 1 fixo, 2 alas e 1 pivô.', requirements: { position: 'any', count: 5 }, reward: { type: 'coins', value: 2000 }, repeatable: true },
    { id: 'sbc3', title: 'Desafio de Clube', description: 'Entregue 3 cartas do mesmo clube.', requirements: { count: 3, sameClub: true }, reward: { type: 'pack', value: 'silver' }, repeatable: true },
  ],
  priceHistory: [],
  recentTransfers: [],
  settings: { audio: true, animations: true, highContrast: false },
  lastDailyClaim: null,
  events: [],
  eventHistory: [],
  favorites: [],
  newCardUids: [],
  packConfigs: DEFAULT_PACKS.map(p => ({ ...p, probabilities: { ...p.probabilities } })),
};

// helper: generate a card from a rarity

// special edition roll (10% chance for special)
function rollSpecial(): 'none'|'totw'|'potm'|'revelation'|'legend'|'futsal' {
  const r = Math.random();
  if (r < 0.85) return 'none';
  const opts: any[] = ['totw','potm','revelation','legend','futsal'];
  return opts[Math.floor(Math.random() * opts.length)];
}

export const useGame = create<GameState & Actions>()(
  persist(
    (set, get) => ({
      ...initialState,
      init: () => {
        const s = get();
        // migrate persisted packs: fix goalkeeper pack position
        const fixedPacks = s.packConfigs.map(p =>
          p.id === 'position_gk' ? { ...p, position: 'GK' as any, sport: 'futsal' as any } : p
        );
        set({ packConfigs: fixedPacks });
        if (s.events.length === 0) {
          const now = Date.now();
          set({
            events: [
              { id: 'e1', name: 'Copa Futsenai', endsAt: now + 1000*60*60*24*3, reward: 'Pacote Lendário' },
              { id: 'e2', name: 'Semana do Ícone', endsAt: now + 1000*60*60*24*7, reward: 'Carta Ícone garantida' },
            ],
          });
        }
        get().seedMarket();
        get().updateMissionProgress();
        if (supabase) {
          supabase.auth.getSession().then(async ({ data }) => {
            const uid = data.session?.user?.id;
            if (!uid) return;
            const remote = await getCards(uid);
            if (remote.length > 0) {
              set({ cards: remote });
            } else {
              const local = get().cards;
              for (const c of local) await addCard(uid, c);
            }
            // sync coins from profile
            const { data: prof } = await supabase!.from('profiles').select('coins').eq('id', uid).single();
            if (prof) set({ coins: prof.coins });
            const squads = await getSavedSquads(uid);
            if (squads.length > 0) set({ savedSquads: squads });
            const listings = await getListings();
            if (listings.length > 0) set({ listings: listings.map(l => ({ id: l.id, cardUid: l.cardUid, seller: 'user', sellerName: 'Mercado', price: l.price, buyNow: l.buyNow, bids: [], createdAt: new Date(l.createdAt).getTime(), expiresAt: new Date(l.expiresAt).getTime(), status: l.status as any })) });
            const remoteMissions = await getMissions(uid);
            if (remoteMissions.length > 0) {
              set({ missions: remoteMissions });
            } else {
              await upsertMissions(uid, get().missions);
            }
            const remoteAchievements = await getAchievements(uid);
            if (remoteAchievements.length > 0) set({ achievements: remoteAchievements });
          });
        }
      },
      addCoins: (n, reason) => {
        set(st => ({
          coins: st.coins + n,
          transactions: [{ id: nanoid(8), type: 'earn' as const, amount: n, reason, at: Date.now() }, ...st.transactions].slice(0, 50),
        }));
        if (supabase) {
          supabase.auth.getSession().then(async ({ data }) => {
            const uid = data.session?.user?.id;
            if (uid) await supabase!.from('profiles').update({ coins: get().coins }).eq('id', uid);
          });
        }
      },
      spendCoins: (n, reason) => {
        const s = get();
        if (s.coins < n) return false;
        set(st => ({
          coins: st.coins - n,
          transactions: [{ id: nanoid(8), type: 'spend' as const, amount: n, reason, at: Date.now() }, ...st.transactions].slice(0, 50),
        }));
        if (supabase) {
          supabase.auth.getSession().then(async ({ data }) => {
            const uid = data.session?.user?.id;
            if (uid) await supabase!.from('profiles').update({ coins: get().coins }).eq('id', uid);
          });
        }
        return true;
      },
      addXp: (n) => set(st => {
        const newXp = st.xp + n;
        return { xp: newXp, level: levelFromXp(newXp) };
      }),
      openPack: (packId) => {
        const s = get();
        const pack = s.packConfigs.find(p => p.id === packId);
        if (!pack || !pack.unlocked) return null;
        if (s.coins < pack.price) return null;
        // deduct once
        const ok = get().spendCoins(pack.price, `Abertura ${pack.name}`);
        if (!ok) return null;
        // generate cards
        const cards: PlayerCard[] = [];
        for (let i = 0; i < pack.cards; i++) {
          const rarity = rollRarity(pack.probabilities);
          const special = rollSpecial();
          const t = randomTemplate(pack.position as any);
          const card = generatePlayerCard(t, rarity, special === 'none' ? 'none' : special);
          cards.push(card);
        }
        // sync new cards to Supabase
        if (supabase) {
          supabase.auth.getSession().then(async ({ data }) => {
            const uid = data.session?.user?.id;
            if (uid) for (const c of cards) await addCard(uid, c);
          });
        }
        // ensure legendary pack has no common
        set(st => ({
          cards: [...cards, ...st.cards],
          packsOpened: st.packsOpened + 1,
          newCardUids: [...cards.map(c => c.uid), ...st.newCardUids].slice(0, 50),
        }));
        get().addXp(pack.cards * 10);
        // mission progress
        get().updateMissionProgress();
        // achievements
        const st2 = get();
        if (st2.cards.length >= 1) {
          const a = st2.achievements.find(x => x.id === 'a1');
          if (a && !a.unlocked) set(st => ({ achievements: st.achievements.map(x => x.id === 'a1' ? { ...x, unlocked: true, unlockedAt: Date.now() } : x) }));
        }
        if (st2.cards.length >= 20) {
          const a = st2.achievements.find(x => x.id === 'a2');
          if (a && !a.unlocked) set(st => ({ achievements: st.achievements.map(x => x.id === 'a2' ? { ...x, unlocked: true, unlockedAt: Date.now() } : x) }));
        }
        if (cards.some(c => c.rarity === 'legendary' || c.rarity === 'icon')) {
          const a = get().achievements.find(x => x.id === 'a5');
          if (a && !a.unlocked) set(st => ({ achievements: st.achievements.map(x => x.id === 'a5' ? { ...x, unlocked: true, unlockedAt: Date.now() } : x) }));
        }
        if (cards.some(c => c.rarity === 'icon')) {
          const a = get().achievements.find(x => x.id === 'a6');
          if (a && !a.unlocked) set(st => ({ achievements: st.achievements.map(x => x.id === 'a6' ? { ...x, unlocked: true, unlockedAt: Date.now() } : x) }));
        }
        return { cards };
      },
      claimDaily: () => {
        const s = get();
        const now = Date.now();
        const last = s.lastDailyClaim;
        const oneDay = 1000 * 60 * 60 * 20; // 20h
        if (last && now - last < oneDay) return { ok: false, amount: 0 };
        const amount = 500 + Math.floor(Math.random() * 500);
        get().addCoins(amount, 'Recompensa diária');
        get().addXp(40);
        set({ lastDailyClaim: now });
        // mission daily
        const m = get().missions.find(x => x.id === 'm9');
        if (m && !m.completed) {
          set(st => ({ missions: st.missions.map(x => x.id === 'm9' ? { ...x, progress: 1, completed: true } : x) }));
        }
        return { ok: true, amount };
      },
      toggleFavorite: (uid) => set(st => ({
        cards: st.cards.map(c => c.uid === uid ? { ...c, favorite: !c.favorite } : c),
      })),
      markSeen: (uids) => set(st => ({
        cards: st.cards.map(c => uids.includes(c.uid) ? { ...c, isNew: false } : c),
        newCardUids: st.newCardUids.filter(u => !uids.includes(u)),
      })),
      updateMissionProgress: () => {
        set(st => {
          const missions = st.missions.map(m => {
            if (m.completed) return m;
            let progress = m.progress;
            if (m.type === 'open_packs') progress = st.packsOpened;
            if (m.type === 'collect') progress = st.cards.length;
            if (m.type === 'rarity') {
              const has = st.cards.some(c => {
                if (m.id === 'm4') return ['epic','legendary','icon'].includes(c.rarity);
                if (m.id === 'm8') return c.rarity === 'legendary' || c.rarity === 'icon';
                return false;
              });
              progress = has ? 1 : 0;
            }
            if (m.type === 'squad' || m.type === 'futsal_squad') {
              const filled = st.squads.futsal.starters.filter(s => s.uid).length;
              progress = filled;
            }
            const completed = progress >= m.target;
            return { ...m, progress: Math.min(progress, m.target), completed };
          });
          // unlock legendary pack if missions m8 or total packs? unlock when 3 missions complete
          const completedCount = missions.filter(m => m.completed).length;
          const packs = st.packConfigs.map(p => p.id === 'legendary' ? { ...p, unlocked: completedCount >= 3 || p.unlocked } : p);
          return { missions, packConfigs: packs };
        });
        // achievements coins
        const st2 = get();
        if (st2.coins >= 10000) {
          const a = st2.achievements.find(x => x.id === 'a3');
          if (a && !a.unlocked) set(st => ({ achievements: st.achievements.map(x => x.id === 'a3' ? { ...x, unlocked: true, unlockedAt: Date.now() } : x) }));
        }
        const fFilled = st2.squads.futsal.starters.every(s => s.uid);
        if (fFilled) {
          const a = st2.achievements.find(x => x.id === 'a4');
          if (a && !a.unlocked) set(st => ({ achievements: st.achievements.map(x => x.id === 'a4' ? { ...x, unlocked: true, unlockedAt: Date.now() } : x) }));
        }
        // sync achievements to Supabase
        if (supabase) {
          supabase.auth.getSession().then(async ({ data }) => {
            const uid = data.session?.user?.id;
            if (uid) await upsertAchievements(uid, get().achievements);
          });
        }
        // sync missions to Supabase
        if (supabase) {
          supabase.auth.getSession().then(async ({ data }) => {
            const uid = data.session?.user?.id;
            if (uid) await upsertMissions(uid, get().missions);
          });
        }
      },
      claimMission: (id) => {
        const s = get();
        const m = s.missions.find(x => x.id === id);
        if (!m || !m.completed || m.claimed) return false;
        get().addCoins(m.reward, `MissÃ£o: ${m.title}`);
        get().addXp(m.rewardXp);
        set(st => ({ missions: st.missions.map(x => x.id === id ? { ...x, claimed: true } : x) }));
        if (supabase) {
          supabase.auth.getSession().then(async ({ data }) => {
            const uid = data.session?.user?.id;
            if (uid) await claimMissionDb(uid, id);
          });
        }
        return true;
      },
      setSquadSport: () => {},
      assignSlot: (sport, index, cardUid, bench, benchIndex) => {
        set(st => {
          const squad = { ...st.squads[sport] };
          // remove uid from any existing slot
          if (cardUid) {
            squad.starters = squad.starters.map(s => s.uid === cardUid ? { ...s, uid: null } : s);
            squad.bench = squad.bench.map(u => u === cardUid ? null : u);
          }
          if (bench) {
            if (benchIndex === undefined) return st;
            const b = [...squad.bench];
            b[benchIndex] = cardUid;
            squad.bench = b;
          } else {
            squad.starters[index] = { ...squad.starters[index], uid: cardUid };
          }
          return { squads: { ...st.squads, [sport]: squad } };
        });
        get().updateMissionProgress();
      },
      clearSlot: (sport, index, bench, benchIndex) => {
        set(st => {
          const squad = { ...st.squads[sport] };
          if (bench) {
            if (benchIndex === undefined) return st;
            const b = [...squad.bench];
            b[benchIndex] = null;
            squad.bench = b;
          } else {
            squad.starters[index] = { ...squad.starters[index], uid: null };
          }
          return { squads: { ...st.squads, [sport]: squad } };
        });
        get().updateMissionProgress();
      },
      setFormation: (sport, formation) => {
        const positions = (FORMATIONS_FUTSAL[formation] ?? FORMATIONS_FUTSAL['1-2-1']);
        set(st => {
          const squad = st.squads[sport];
          const oldStarters = squad.starters.map(s => ({ pos: s.position, uid: s.uid }));
          const used = new Set<string>();
          const newStarters = positions.map(pos => {
            const match = oldStarters.find(s => s.pos === pos && s.uid && !used.has(s.uid));
            if (match && match.uid) { used.add(match.uid); return { position: pos as any, uid: match.uid }; }
            return { position: pos as any, uid: null };
          });
          // unmatched starters to bench
          const unmatched = oldStarters.filter(s => s.uid && !used.has(s.uid)).map(s => s.uid);
          const newBench = [...squad.bench];
          for (const u of unmatched) {
            const idx = newBench.indexOf(null);
            if (idx >= 0) newBench[idx] = u; else newBench.push(u);
          }
          return {
            squads: {
              ...st.squads,
              [sport]: { ...squad, formation, starters: newStarters, bench: newBench },
            },
          };
        });
      },
      saveSquad: (name, sport) => {
        const id = nanoid(8);
        const s = get();
        const squad = s.squads[sport];
        const saved: SavedSquad = {
          id, name, sport,
          formation: squad.formation,
          starters: squad.starters.map(x => x.uid),
          bench: [...squad.bench],
          createdAt: Date.now(),
          isPrimary: s.savedSquads.filter(x => x.sport === sport).length === 0,
        };
        set(st => ({ savedSquads: [saved, ...st.savedSquads] }));
        if (supabase) {
          supabase.auth.getSession().then(async ({ data }) => {
            const uid = data.session?.user?.id;
            if (uid) {
              const remote = await saveSquadService(uid, squad, name);
              if (remote) {
                set(st => ({ savedSquads: st.savedSquads.map(x => x.id === id ? { ...x, id: remote.id } : x) }));
              }
            }
          });
        }
        return id;
      },
      deleteSquad: (id) => set(st => ({ savedSquads: st.savedSquads.filter(s => s.id !== id) })),
      setPrimarySquad: (id) => set(st => ({
        savedSquads: st.savedSquads.map(s => ({ ...s, isPrimary: s.id === id ? true : (s.sport === st.savedSquads.find(x=>x.id===id)?.sport ? false : s.isPrimary) }))
      })),
      loadSquad: (id) => {
        const s = get();
        const saved = s.savedSquads.find(x => x.id === id);
        if (!saved) return;
        const sport = saved.sport;
        // rebuild squad starters positions based on current formation? Use saved formation
        const positions = (FORMATIONS_FUTSAL[saved.formation] ?? FORMATIONS_FUTSAL['1-2-1']);
        // if saved formation different, keep positions from a map? We'll use saved starters length
        const starters = saved.starters.map((uid, i) => ({ position: (positions[i] ?? 'GK') as any, uid }));
        set(st => ({
          squads: {
            ...st.squads,
            [sport]: { sport, formation: saved.formation, starters, bench: [...saved.bench] },
          },
        }));
      },
      addCompareHistory: (aUid, bUid) => set(st => ({
        compareHistory: [{ aUid, bUid, at: Date.now() }, ...st.compareHistory].slice(0, 20),
      })),
      addMatchHistory: (entry) => {
        set(st => ({ matchHistory: [entry, ...st.matchHistory].slice(0, 50) }));
        if (supabase) {
          supabase.auth.getSession().then(async ({ data }) => {
            const uid = data.session?.user?.id;
            if (uid) await addMatch(uid, { sport: entry.sport, homeScore: entry.homeScore, awayScore: entry.awayScore, opponent: entry.opponent });
          });
        }
      },
      updateSettings: (s) => set((st) => ({ settings: { ...st.settings, ...s } })),
      addPlayerXp: (uid, amount) => set(st => ({
        cards: st.cards.map(c => {
          if (c.uid !== uid) return c;
          const xp = (c.xp ?? 0) + amount;
          const evoPoints = (c.evoPoints ?? 0) + Math.floor(amount / 100);
          return { ...c, xp, evoPoints };
        }),
      })),
      upgradePlayer: (uid, attr) => {
        const c = get().cards.find(x => x.uid === uid);
        if (!c) return false;
        const evoPoints = c.evoPoints ?? 0;
        if (evoPoints <= 0) return false;
        const upgrades = c.upgrades ?? { pace: 0, shooting: 0, passing: 0, dribbling: 0, defending: 0, physical: 0 };
        const totalUpgrades = Object.values(upgrades).reduce((a, b) => a + b, 0);
        if (totalUpgrades >= 15) return false; // limit
        if ((upgrades as any)[attr] >= 10) return false; // per-attr limit
        const newUpgrades = { ...upgrades, [attr]: (upgrades as any)[attr] + 1 };
        // apply to attrs
        const attrMap: any = { pace: 'pace', shooting: 'shooting', passing: 'passing', dribbling: 'dribbling', defending: 'defending', physical: 'physical' };
        const field = attrMap[attr];
        const newVal = Math.min(99, (c as any)[field] + 1);
        const newOverall = Math.min(99, Math.round(((c.pace + (attr==='pace'?1:0)) + (c.shooting + (attr==='shooting'?1:0)) + (c.passing + (attr==='passing'?1:0)) + (c.dribbling + (attr==='dribbling'?1:0)) + (c.defending + (attr==='defending'?1:0)) + (c.physical + (attr==='physical'?1:0))) / 6));
        set(st => ({
          cards: st.cards.map(x => x.uid === uid ? {
            ...x,
            [field]: newVal,
            upgrades: newUpgrades,
            evoPoints: (x.evoPoints ?? 0) - 1,
            overall: newOverall,
            evolutionLog: [...(x.evolutionLog ?? []), { attr, at: Date.now() }],
          } : x),
        }));
        return true;
      },
      convertDuplicates: () => {
        const cards = get().cards;
        const byName: Record<string, string[]> = {};
        cards.forEach(c => { (byName[c.name] = byName[c.name] || []).push(c.uid); });
        const toRemove: string[] = [];
        Object.values(byName).forEach(uids => {
          if (uids.length > 1) {
            uids.slice(1).forEach(u => toRemove.push(u));
          }
        });
        if (toRemove.length === 0) return 0;
        const reward = toRemove.length * 200;
        get().addCoins(reward, `Conversão de ${toRemove.length} duplicatas`);
        set(st => ({ cards: st.cards.filter(c => !toRemove.includes(c.uid)) }));
        return toRemove.length;
      },
      recordEvolution: (uid, attr) => set(st => ({
        cards: st.cards.map(c => c.uid === uid ? { ...c, evolutionLog: [...(c.evolutionLog ?? []), { attr, at: Date.now() }] } : c),
      })),
      recordMatchStats: (uid, goals, assists) => set(st => ({
        cards: st.cards.map(c => c.uid === uid ? {
          ...c,
          seasonStats: { matches: (c.seasonStats?.matches ?? 0) + 1, goals: (c.seasonStats?.goals ?? 0) + goals, assists: (c.seasonStats?.assists ?? 0) + assists },
        } : c),
      })),
      listCard: (cardUid, price, buyNow, hours) => {
        const c = get().cards.find(x => x.uid === cardUid);
        if (!c) return null;
        const id = nanoid(8);
        const listing: Listing = {
          id, cardUid, seller: 'user', sellerName: 'VocÃª',
          price, buyNow, bids: [], createdAt: Date.now(),
          expiresAt: Date.now() + hours * 3600000, status: 'active',
        };
        set(st => ({
          listings: [listing, ...st.listings],
          cards: st.cards.map(x => x.uid === cardUid ? { ...x, isNew: false } : x),
        }));
        if (supabase) {
          supabase.auth.getSession().then(async ({ data }) => {
            const uid = data.session?.user?.id;
            if (uid) {
              const remote = await createListing({ sellerId: uid, cardUid, cardName: c.name, price, buyNow, expiresAt: new Date(Date.now() + hours * 3600000).toISOString(), status: 'active' });
              if (remote) set(st => ({ listings: st.listings.map(l => l.id === id ? { ...l, id: remote.id } : l) }));
            }
          });
        }
        return id;
      },
      cancelListing: (id) => {
        set(st => ({ listings: st.listings.map(l => l.id === id ? { ...l, status: 'cancelled' } : l) }));
        if (supabase) cancelListingService(id);
      },
      buyListing: (id) => {
        const listing = get().listings.find(l => l.id === id);
        if (!listing || listing.status !== 'active') return false;
        const cost = listing.buyNow > 0 ? listing.buyNow : listing.price;
        if (get().coins < cost) return false;
        if (supabase) {
          supabase.functions.invoke('buy-listing', { body: { listingId: id } }).then(({ data, error }) => {
            if (error || !data?.ok) return;
            get().spendCoins(cost, `Compra mercado: ${listing.id}`);
            const existing = get().cards.find(c => c.uid === listing.cardUid);
            if (existing) {
              set(st => ({ cards: st.cards.map(c => c.uid === listing.cardUid ? { ...c, isNew: true } : c) }));
            }
            set(st => ({ listings: st.listings.map(l => l.id === id ? { ...l, status: 'sold' } : l) }));
          });
          return true;
        }
        get().spendCoins(cost, `Compra mercado: ${listing.id}`);
        const existing = get().cards.find(c => c.uid === listing.cardUid);
        if (existing) {
          set(st => ({ cards: st.cards.map(c => c.uid === listing.cardUid ? { ...c, isNew: true } : c) }));
        }
        set(st => ({ listings: st.listings.map(l => l.id === id ? { ...l, status: 'sold' } : l) }));
        return true;
      },
      bidListing: (id, amount) => {
        const listing = get().listings.find(l => l.id === id);
        if (!listing || listing.status !== 'active') return false;
        if (amount <= (listing.bids.length ? listing.bids[listing.bids.length-1].amount : listing.price)) return false;
        if (get().coins < amount) return false;
        set(st => ({
          listings: st.listings.map(l => l.id === id ? { ...l, bids: [...l.bids, { amount, at: Date.now() }] } : l),
        }));
        return true;
      },
      previewPack: (packId) => {
        const s = get();
        const pack = s.packConfigs.find(p => p.id === packId);
        if (!pack || !pack.unlocked) return null;
        if (s.coins < pack.price) return null;
        const ok = get().spendCoins(pack.price, `Prévia ${pack.name}`);
        if (!ok) return null;
        const cards = [];
        const count = pack.choice || pack.cards;
        for (let i = 0; i < count; i++) {
          const rarity = rollRarity(pack.probabilities);
          const t = randomTemplate(pack.position as any);
          cards.push(generatePlayerCard(t, rarity, 'none'));
        }
        return cards;
      },
      claimPreviewedCard: (card) => {
        set(st => ({
          cards: [card, ...st.cards],
          newCardUids: [card.uid, ...st.newCardUids].slice(0, 50),
        }));
        get().addXp(10);
        get().updateMissionProgress();
      },
      completeSBC: (sbcId, cardUids) => {
        const sbc = get().sbcs.find(s => s.id === sbcId);
        if (!sbc) return false;
        const cards = get().cards.filter(c => cardUids.includes(c.uid));
        if (cards.length !== cardUids.length) return false;
        // validate count
        if (cards.length < sbc.requirements.count) return false;
        if (sbc.requirements.minOverall && cards.some(c => c.overall < sbc.requirements.minOverall!)) return false;
        if (sbc.requirements.sameClub) {
          const clubs = new Set(cards.map(c => c.club));
          if (clubs.size !== 1) return false;
        }
        // remove cards
        set(st => ({ cards: st.cards.filter(c => !cardUids.includes(c.uid)) }));
        if (supabase) {
          supabase.auth.getSession().then(async ({ data }) => {
            const uid = data.session?.user?.id;
            if (uid) {
              for (const cu of cardUids) await supabase!.from('cards').delete().eq('id', cu);
              await recordSBCCompletion(uid, sbcId);
            }
          });
        }
        // reward
        if (sbc.reward.type === 'coins') {
          get().addCoins(Number(sbc.reward.value), `SBC: ${sbc.title}`);
        } else if (sbc.reward.type === 'pack') {
          // unlock pack? just grant coins equivalent
          get().addCoins(1000, `SBC: ${sbc.title}`);
        }
        get().addXp(100);
        return true;
      },
      seedMarket: () => {
        const s = get();
        if (s.listings.length > 0) return;
        const npcs = ['Trader FC', 'Scout Pro', 'Mercado FC', 'Bola Cheia'];
        const newListings: Listing[] = [];
        for (let i = 0; i < 8; i++) {
    const t = randomTemplate();
          const rarity = rollRarity({ common: 0.3, uncommon: 0.3, rare: 0.25, epic: 0.12, legendary: 0.025, icon: 0.005 });
          const card = generatePlayerCard(t, rarity, 'none');
          // add card to a hidden pool? For demo, store card in inventory? We'll store card uid and also add to cards list as NPC-owned (marked)
          const price = Math.round(card.overall * 100 + Math.random() * 500);
          newListings.push({
            id: nanoid(8),
            cardUid: card.uid,
            seller: 'npc',
            sellerName: npcs[i % npcs.length],
            price,
            buyNow: Math.round(price * 1.3),
            bids: [],
            createdAt: Date.now(),
            expiresAt: Date.now() + 24 * 3600000,
            status: 'active',
          });
          // add the card to global cards list so it can be displayed
          set(st => ({ cards: [card, ...st.cards] }));
        }
        set(st => ({ listings: [...newListings, ...st.listings] }));
      },
      recordPrice: (cardName, price) => set(st => ({
        priceHistory: [{ cardName, price, at: Date.now() }, ...st.priceHistory].slice(0, 200),
      })),
      recordTransfer: (cardName, price, type) => set(st => ({
        recentTransfers: [{ cardName, price, at: Date.now(), type }, ...st.recentTransfers].slice(0, 50),
      })),
      resetAll: () => set({ ...initialState, missions: DEFAULT_MISSIONS.map(m=>({...m})), achievements: DEFAULT_ACHIEVEMENTS.map(a=>({...a})), packConfigs: DEFAULT_PACKS.map(p=>({...p, probabilities:{...p.probabilities}})), savedSquads: [], compareHistory: [], matchHistory: [], listings: [], priceHistory: [], recentTransfers: [], settings: { audio: true, animations: true, highContrast: false } }),
      unlockLegendary: () => set(st => ({ packConfigs: st.packConfigs.map(p => p.id === 'legendary' ? { ...p, unlocked: true } : p) })),
      addEvent: () => {},
    }),
    { name: 'futsenai-cards-v3' }
  )
);

export function cardById(cards: PlayerCard[], uid: string) { return cards.find(c => c.uid === uid); }
export function squadOverall(squad: Squad, cards: PlayerCard[]): number {
  const uids = squad.starters.map(s => s.uid).filter(Boolean) as string[];
  if (uids.length === 0) return 0;
  const ovrs = uids.map(u => cards.find(c => c.uid === u)?.overall ?? 0);
  return Math.round(ovrs.reduce((a,b)=>a+b,0)/ovrs.length);
}
export function rarityColor(r: string) {
  return (RARITY_META as any)[r]?.color ?? '#fff';
}
export function specialColor(s: string) {
  return (SPECIAL_META as any)[s]?.color ?? '';
}
