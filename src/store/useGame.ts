import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import type { GameState, PlayerCard, Squad, SavedSquad, Listing } from '../types';
import { RARITY_META, SPECIAL_META } from '../types';
import type { UpgradeAttr } from '../types';
import { toast } from './toast';
import { DEFAULT_PACKS, DEFAULT_MISSIONS, DEFAULT_ACHIEVEMENTS, levelFromXp, FORMATIONS_FUTSAL, mergeCardProgress, totalUpgrades, UUID_RE } from '../lib/game';
import { supabase } from '../lib/supabase';
import { getCards, addCard, updateCard } from '../lib/services/cards';
import { addMatch } from '../lib/services/matches';
import { saveSquad as saveSquadService, getSavedSquads, getSquad as getPrimarySquadService, upsertPrimarySquad } from '../lib/services/squads';
import { getMissions, upsertMissions } from '../lib/services/missions';
import { getAchievements, upsertAchievements } from '../lib/services/achievements';
import { getSettings, updateSettings as updateSettingsService } from '../lib/services/settings';
import { updateCollectorRanking } from '../lib/services/leaderboard';
import { getListings, createListing, cancelListing as cancelListingService } from '../lib/services/marketplace';
import { generatePlayerCard, randomTemplate, allTemplates, applyTemplateToCard, overallFromAttributes } from '../data/players';

// --- Elenco ativo: autosave + serialização do sync ---
let squadSaveTimer: ReturnType<typeof setTimeout> | null = null;
let squadSavePending = false; // true enquanto há alteração local ainda não confirmada no servidor
let syncChain: Promise<void> = Promise.resolve();
let dailyClaimPending = false;
let duplicateConversionPending = false;
const sbcCompletionsPending = new Set<string>();
const listingsPending = new Set<string>();
let demoCoinClaimPending = false;

interface OpenPackRow {
  uid: string;
  player_id: string;
  name: string;
  card_position: string;
  sport: string;
  nationality: string;
  age: number;
  club: string;
  rarity: string;
  edition: string;
  special: string;
  overall: number;
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physical: number;
  reflexes: number | null;
  positioning: number | null;
  handling: number | null;
  image: string | null;
  choice_id: string | null;
  remaining_coins: number;
  created_at: string;
}

function mapOpenPackCard(row: OpenPackRow): PlayerCard {
  return {
    uid: row.uid,
    playerId: row.player_id,
    name: row.name,
    position: row.card_position as PlayerCard['position'],
    sport: row.sport as PlayerCard['sport'],
    nationality: row.nationality,
    age: row.age,
    club: row.club,
    rarity: row.rarity as PlayerCard['rarity'],
    edition: row.edition,
    special: row.special as PlayerCard['special'],
    overall: row.overall,
    pace: row.pace,
    shooting: row.shooting,
    passing: row.passing,
    dribbling: row.dribbling,
    defending: row.defending,
    physical: row.physical,
    reflexes: row.reflexes ?? undefined,
    positioning: row.positioning ?? undefined,
    handling: row.handling ?? undefined,
    image: row.image || allTemplates().find(template => template.name === row.name)?.image,
    favorite: false,
    isNew: true,
    obtainedAt: new Date(row.created_at).getTime(),
    xp: 0,
    evoPoints: 0,
    upgrades: { pace: 0, shooting: 0, passing: 0, dribbling: 0, defending: 0, physical: 0 },
    evolutionLog: [],
    seasonStats: { matches: 0, goals: 0, assists: 0 },
  };
}

function scheduleSquadSave(getSquad: () => Squad) {
  if (!supabase) return;
  squadSavePending = true;
  if (squadSaveTimer) clearTimeout(squadSaveTimer);
  squadSaveTimer = setTimeout(async () => {
    squadSaveTimer = null;
    try {
      const { data } = await supabase!.auth.getSession();
      const uid = data.session?.user?.id;
      if (!uid) return;
      const ok = await upsertPrimarySquad(uid, getSquad());
      if (ok && !squadSaveTimer) squadSavePending = false;
    } catch (e) {
      console.error('[squad] autosave falhou', e);
    }
  }, 500);
}

interface Actions {
  init: () => void;
  syncUserData: (userId: string) => Promise<boolean>;
  claimDemoCoins: () => Promise<boolean>;
  spendCoins: (n: number, reason: string) => boolean;
  addXp: (n: number) => void;
  openPack: (packId: string) => Promise<{ cards: PlayerCard[] } | null>;
  claimDaily: () => Promise<{ ok: boolean; amount: number; error?: string }>;
  toggleFavorite: (uid: string) => void;
  markSeen: (uids: string[]) => void;
  updateMissionProgress: () => void;
  claimMission: (id: string) => Promise<boolean>;
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
  addMatchHistory: (entry: { id: string; date: number; sport: string; homeScore: number; awayScore: number; opponent: string; challengeId?: string }) => void;
  addLocalMatchHistory: (entry: { id: string; date: number; sport: string; homeScore: number; awayScore: number; opponent: string; challengeId?: string }) => void;
  updateSettings: (s: Partial<{ audio: boolean; animations: boolean; highContrast: boolean }>) => void;
  setPendingFriends: (n: number) => void;
  addPlayerXp: (uid: string, amount: number) => void;
  upgradePlayer: (uid: string, attr: UpgradeAttr) => boolean;
  recordMatchStats: (uid: string, goals: number, assists: number) => void;
  convertDuplicates: () => Promise<number>;
  recordEvolution: (uid: string, attr: string) => void;
  listCard: (cardUid: string, price: number, buyNow: number, hours: number) => Promise<string | null>;
  cancelListing: (id: string) => Promise<boolean>;
  buyListing: (id: string) => Promise<boolean>;
  bidListing: (id: string, amount: number) => boolean;
  previewPack: (packId: string) => Promise<{ cards: PlayerCard[]; choiceId: string } | null>;
  claimPreviewedCard: (card: PlayerCard, choiceId: string) => Promise<PlayerCard | null>;
  addLocalCard: (card: PlayerCard) => void;
  completeSBC: (sbcId: string, cardUids: string[]) => Promise<boolean>;
  seedMarket: () => void;
  recordPrice: (cardName: string, price: number) => void;
  recordTransfer: (cardName: string, price: number, type: 'buy' | 'sell') => void;
}

const seedCards = (): PlayerCard[] => {
  const out: PlayerCard[] = [];
  const rarities: any[] = ['common','common','uncommon','rare','uncommon'];
  for (let i = 0; i < 5; i++) {
    const t = randomTemplate();
    out.push({ ...generatePlayerCard(t, rarities[i], 'none'), seed: true });
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
  avatarUrl: null,
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
  pendingFriends: 0,
  lastDailyClaim: null,
  events: [],
  eventHistory: [],
  favorites: [],
  newCardUids: [],
  packConfigs: DEFAULT_PACKS.map(p => ({ ...p, probabilities: { ...p.probabilities } })),
};

// helper: generate a card from a rarity

export const useGame = create<GameState & Actions>()(
  persist(
    (set, get) => ({
      ...initialState,
      init: () => {
        // migra cartas locais antigas para os valores do template (só cartas não-customizadas,
        // ainda não migradas e sem evolução, para não apagar o progresso do jogador a cada carregamento)
        const localCards = get().cards;
        if (localCards.length > 0) {
          const migrated = localCards.map(c => {
            if (c.custom) return c;
            if ((c.schemaVersion ?? 1) >= 4 || totalUpgrades(c as any) > 0) return c;
            const t = allTemplates().find(x => x.name === c.name);
            if (!t) return c;
            return applyTemplateToCard(c, t);
          });
          set({ cards: migrated });
        }
        const s = get();
        // migrate persisted packs: fix goalkeeper pack position
        const fixedPacks = s.packConfigs.filter(p => !p.id.startsWith('futsal_')).map(p =>
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
        get().updateMissionProgress();
        if (supabase) {
          supabase.auth.getSession().then(async ({ data }: { data: any }) => {
            const uid = data.session?.user?.id;
            if (uid) await get().syncUserData(uid);
          });
        }
      },
      syncUserData: async (userId) => {
        // serializa: init(), SIGNED_IN e Match podem chamar ao mesmo tempo
        const prevSync = syncChain;
        let releaseSync!: () => void;
        syncChain = new Promise<void>(r => { releaseSync = r; });
        await prevSync;
        try {
        const remoteCards = await getCards(userId);
        const squads = await getSavedSquads(userId);
        const hasSaved = squads.length > 0;

        // null = falha ao ler do servidor: não mexe no inventário local
        if (remoteCards) {
          const local = get().cards;
          const localByUid = new Map(local.map(c => [c.uid, c]));
          const remoteUids = new Set(remoteCards.map(c => c.uid));
          // fonte da verdade = servidor (por uid, não por playerId: cópias iguais são cartas diferentes)
          const remoteMerged = remoteCards.map(r => mergeCardProgress(r, localByUid.get(r.uid)));
          // cartas locais que ainda não existem no servidor (uid temporário)
          const unsynced = local.filter(c => !UUID_RE.test(c.uid) && !remoteUids.has(c.uid));
          // cartas iniciais sorteadas localmente só viram da conta se ela ainda não tem nenhuma carta
          const toSave = unsynced.filter(c => !c.seed || remoteCards.length === 0);
          const saved = await Promise.all(toSave.map(c => addCard(userId, c)));
          const idMap = new Map<string, string>();
          const savedCards = toSave.map((c, i) => {
            const db = saved[i];
            if (db) { idMap.set(c.uid, db.uid); return { ...c, uid: db.uid, seed: undefined }; }
            return c; // não conseguiu salvar: mantém local para tentar de novo no próximo sync
          });
          set({ cards: [...remoteMerged, ...savedCards] });
          if (idMap.size > 0) {
            const remap = (u: string | null) => (u && idMap.has(u) ? idMap.get(u)! : u);
            set(st => ({ squads: { ...st.squads, futsal: { ...st.squads.futsal, starters: st.squads.futsal.starters.map(s => ({ ...s, uid: remap(s.uid) })), bench: st.squads.futsal.bench.map(remap) } } }));
          }
        }

        if (hasSaved) set({ savedSquads: squads });
        // load primary squad into active squad
        const primary = await getPrimarySquadService(userId);
        if (primary && !squadSavePending) {
          const positions = (FORMATIONS_FUTSAL as any)[primary.formation] || (FORMATIONS_FUTSAL as any)['1-2-1'];
          const starters = positions.map((pos: string, i: number) => ({ position: pos, uid: primary.starters[i] ?? null }));
          set(st => ({ squads: { ...st.squads, futsal: { sport: 'futsal', formation: primary.formation, starters, bench: primary.bench } } }));
        }
        const listings = await getListings();
            if (listings.length > 0) set({ listings: listings.map(l => ({ id: l.id, cardUid: l.cardUid, seller: l.sellerId ? 'user' : 'npc', sellerId: l.sellerId, sellerName: l.sellerName || (l.sellerId ? 'Usuário' : 'Mercado'), price: l.price, buyNow: l.buyNow, bids: [], createdAt: new Date(l.createdAt).getTime(), expiresAt: new Date(l.expiresAt).getTime(), status: l.status as any, cardName: l.cardName, cardOverall: l.cardOverall, cardPosition: l.cardPosition, cardRarity: l.cardRarity, cardImage: l.cardImage, cardAttributes: l.cardAttributes })) });
        const remoteMissions = await getMissions(userId);
        if (remoteMissions.length > 0) set({ missions: remoteMissions });
        else await upsertMissions(userId, get().missions);
        const remoteAchievements = await getAchievements(userId);
        if (remoteAchievements.length > 0) set({ achievements: remoteAchievements });
        const remoteSettings = await getSettings(userId);
        if (remoteSettings) set({ settings: remoteSettings });
        const { data: prof } = await supabase!.from('profiles').select('coins, preferences, xp, level, packs_opened, last_daily_claim, avatar_url, name').eq('id', userId).single();
        if (prof) {
          const prefs = prof.preferences || {};
          set(st => ({
            coins: prof.coins ?? st.coins,
            avatarUrl: prof.avatar_url ?? st.avatarUrl,
            xp: prof.xp ?? st.xp,
            level: prof.level ?? st.level,
            packsOpened: prof.packs_opened ?? st.packsOpened,
            lastDailyClaim: prof.last_daily_claim ? new Date(prof.last_daily_claim).getTime() : st.lastDailyClaim,
            favorites: prefs.favorites ?? st.favorites,
            newCardUids: prefs.newCardUids ?? st.newCardUids,
            compareHistory: prefs.compareHistory ?? st.compareHistory,
            eventHistory: prefs.eventHistory ?? st.eventHistory,
            events: prefs.events ?? st.events,
            packConfigs: prefs.unlockedPacks ? st.packConfigs.map(p => prefs.unlockedPacks.includes(p.id) ? { ...p, unlocked: true } : p) : st.packConfigs,
          }));
        }
        return remoteCards !== null;
        } finally { releaseSync(); }
      },
      claimDemoCoins: async () => {
        if (demoCoinClaimPending) return false;
        demoCoinClaimPending = true;
        try {
          if (!supabase) {
            set(st => ({
              coins: st.coins + 10000,
              transactions: [{ id: nanoid(8), type: 'earn' as const, amount: 10000, reason: 'Pacote de moedas (demo)', at: Date.now() }, ...st.transactions].slice(0, 50),
            }));
            return true;
          }

          const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
          if (sessionError) throw sessionError;
          if (!sessionData.session?.user?.id) throw new Error('Entre na sua conta para receber moedas de demonstração.');

          const { data: claimToken, error: beginError } = await supabase.rpc('begin_demo_coin_claim');
          if (beginError) throw beginError;
          if (typeof claimToken !== 'string') throw new Error('O servidor não reservou a compra de moedas.');

          await new Promise(resolve => setTimeout(resolve, 1800));
          const { data: result, error: finishError } = await supabase.rpc('finish_demo_coin_claim', {
            p_claim_token: claimToken,
          });
          if (finishError) throw finishError;
          const coins = Number(result?.coins);
          if (!Number.isInteger(coins)) throw new Error('O servidor retornou um saldo inválido.');
          set(st => ({
            coins,
            transactions: [{ id: nanoid(8), type: 'earn' as const, amount: 10000, reason: 'Pacote de moedas (demo)', at: Date.now() }, ...st.transactions].slice(0, 50),
          }));
          return true;
        } catch (error) {
          console.error('[demo-coins] claim failed:', error);
          toast.error(error instanceof Error ? error.message : 'Não foi possível concluir a compra de demonstração.');
          return false;
        } finally {
          demoCoinClaimPending = false;
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
          supabase.auth.getSession().then(async ({ data }: { data: any }) => {
            const uid = data.session?.user?.id;
            if (uid) {
              const { data: newCoins, error } = await supabase!.rpc('spend_coins', { p_amount: n, p_reason: reason });
              if (error) { toast.error('Saldo insuficiente.'); return; }
              if (newCoins !== null) set({ coins: newCoins });
            }
          });
        }
        return true;
      },
      addXp: (n) => {
        set(st => {
          const newXp = st.xp + n;
          return { xp: newXp, level: levelFromXp(newXp) };
        });
        if (supabase) {
          supabase.auth.getSession().then(async ({ data }: { data: any }) => {
            const uid = data.session?.user?.id;
            if (uid) {
              const { data: res } = await supabase!.rpc('add_xp', { p_amount: n });
              if (res) { set({ xp: res.xp, level: res.level }); }
            }
          });
        }
      },
      openPack: async (packId) => {
        const s = get();
        const pack = s.packConfigs.find(p => p.id === packId);
        if (!pack || !pack.unlocked) return null;
        if (s.coins < pack.price) {
          toast.alert('Saldo insuficiente.');
          return null;
        }
        if (!supabase) return null;
        let uid: string | undefined;
        try {
          const result = await supabase.auth.getSession();
          if (result.error) {
            toast.error('Erro ao validar sessão: ' + result.error.message);
            return null;
          }
          uid = result.data.session?.user.id;
        } catch (error) {
          toast.error('Erro ao validar sessão: ' + (error instanceof Error ? error.message : 'erro desconhecido'));
          return null;
        }
        if (!uid) return null;
        let newCards: OpenPackRow[] | null = null;
        let openError: string | null = null;
        try {
          const result = await supabase.rpc('open_pack', { p_pack_id: packId });
          if (result.error) openError = result.error.message;
          else newCards = result.data as OpenPackRow[] | null;
        } catch (error) {
          openError = error instanceof Error ? error.message : 'erro desconhecido';
        }
        if (openError || !newCards?.length) {
          toast.error('Erro ao abrir pacote: ' + (openError ?? 'nenhuma carta foi retornada'));
          return null;
        }
        const rows = newCards;
        const cards = rows.map(mapOpenPackCard);
        const remainingCoins = rows[0].remaining_coins;
        set(st => ({
          cards: [...cards, ...st.cards],
          coins: remainingCoins,
          transactions: [{ id: nanoid(8), type: 'spend' as const, amount: pack.price, reason: `Abertura ${pack.name}`, at: Date.now() }, ...st.transactions].slice(0, 50),
          packsOpened: st.packsOpened + 1,
          newCardUids: [...cards.map(c => c.uid), ...st.newCardUids].slice(0, 50),
        }));
        const allCards = get().cards;
        const squadOverall = Math.round(allCards.reduce((s, c) => s + c.overall, 0) / Math.max(1, allCards.length));
        const rareCount = allCards.filter(c => ['rare','epic','legendary','icon'].includes(c.rarity)).length;
        const { data: prof } = await supabase!.from('profiles').select('name').eq('id', uid).single();
        await updateCollectorRanking(uid, prof?.name || 'Jogador', allCards.length, squadOverall, rareCount);
        get().addXp(cards.length * 10);
        get().updateMissionProgress();
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
      claimDaily: async () => {
        if (dailyClaimPending) return { ok: false, amount: 0 };
        dailyClaimPending = true;
        try {
          let amount: number;
          if (supabase) {
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
            if (sessionError) throw sessionError;
            if (!sessionData.session?.user?.id) throw new Error('Entre na sua conta para resgatar a recompensa.');
            const { data, error } = await supabase.rpc('claim_daily');
            if (error) throw error;
            const reward = data as { amount: number; coins: number; xp: number; level: number };
            amount = reward.amount;
            set(st => ({
              coins: reward.coins,
              xp: reward.xp,
              level: reward.level,
              lastDailyClaim: Date.now(),
              transactions: [{ id: nanoid(8), type: 'earn' as const, amount, reason: 'Recompensa diária', at: Date.now() }, ...st.transactions].slice(0, 50),
              missions: st.missions.map(m => m.id === 'm9' ? { ...m, progress: 1, completed: true } : m),
            }));
          } else {
            const now = Date.now();
            const last = get().lastDailyClaim;
            const twentyHours = 1000 * 60 * 60 * 20;
            if (last && now - last < twentyHours) return { ok: false, amount: 0 };
            amount = 500 + Math.floor(Math.random() * 500);
            set(st => ({
              coins: st.coins + amount,
              xp: st.xp + 40,
              level: levelFromXp(st.xp + 40),
              lastDailyClaim: now,
              transactions: [{ id: nanoid(8), type: 'earn' as const, amount, reason: 'Recompensa diária', at: now }, ...st.transactions].slice(0, 50),
              missions: st.missions.map(m => m.id === 'm9' ? { ...m, progress: 1, completed: true } : m),
            }));
          }
          return { ok: true, amount };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'erro desconhecido';
          console.error('[daily] claim failed:', message);
          return { ok: false, amount: 0, error: message };
        } finally {
          dailyClaimPending = false;
        }
      },
      toggleFavorite: (uid) => {
        const card = get().cards.find(c => c.uid === uid);
        const newFav = !(card?.favorite);
        set(st => ({
          cards: st.cards.map(c => c.uid === uid ? { ...c, favorite: newFav } : c),
        }));
        if (supabase) {
          supabase.auth.getSession().then(async ({ data }: { data: any }) => {
            const u = data.session?.user?.id;
            if (u && UUID_RE.test(uid)) {
              await updateCard(uid, { favorite: newFav });
            }
          });
        }
      },
      markSeen: (uids) => {
        set(st => ({
          cards: st.cards.map(c => uids.includes(c.uid) ? { ...c, isNew: false } : c),
          newCardUids: st.newCardUids.filter(u => !uids.includes(u)),
        }));
        if (supabase) {
          supabase.auth.getSession().then(async ({ data }: { data: any }) => {
            const u = data.session?.user?.id;
            if (u) {
              const dbIds = uids.filter(x => UUID_RE.test(x));
              if (dbIds.length > 0) await supabase!.rpc('mark_cards_seen', { p_card_ids: dbIds });
              const { data: prof } = await supabase!.from('profiles').select('preferences').eq('id', u).single();
              const prefs = prof?.preferences || {};
              await supabase!.from('profiles').update({ preferences: { ...prefs, newCardUids: get().newCardUids } }).eq('id', u);
            }
          });
        }
      },
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
        // sync events, newCardUids, unlockedPacks to Supabase
        if (supabase) {
          supabase.auth.getSession().then(async ({ data }: { data: any }) => {
            const uid = data.session?.user?.id;
            if (uid) {
              const { data: prof } = await supabase!.from('profiles').select('preferences').eq('id', uid).single();
              const prefs = prof?.preferences || {};
              const unlockedPacks = get().packConfigs.filter(p => p.unlocked).map(p => p.id);
              await supabase!.from('profiles').update({ preferences: { ...prefs, events: get().events, eventHistory: get().eventHistory, newCardUids: get().newCardUids, unlockedPacks } }).eq('id', uid);
            }
          });
        }
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
          supabase.auth.getSession().then(async ({ data }: { data: any }) => {
            const uid = data.session?.user?.id;
            if (uid) await upsertAchievements(uid, get().achievements);
          });
        }
        // sync missions to Supabase
        if (supabase) {
          supabase.auth.getSession().then(async ({ data }: { data: any }) => {
            const uid = data.session?.user?.id;
            if (uid) await upsertMissions(uid, get().missions);
          });
        }
      },
      claimMission: async (id) => {
        const mission = get().missions.find(m => m.id === id);
        if (!mission || !mission.completed) return false;
        if (supabase) {
          try {
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
            if (sessionError) throw sessionError;
            if (!sessionData.session?.user?.id) throw new Error('Entre na sua conta para resgatar a missão.');
            const { data, error } = await supabase.rpc('claim_mission', { p_mission_id: id });
            if (error) throw error;
            const reward = data as { coins: number; xp: number; level: number };
            set(st => ({
              coins: reward.coins,
              xp: reward.xp,
              level: reward.level,
              missions: st.missions.map(m => m.id === id ? { ...m, claimed: true } : m),
              transactions: [{ id: nanoid(8), type: 'earn' as const, amount: mission.reward, reason: `Missão: ${mission.title}`, at: Date.now() }, ...st.transactions].slice(0, 50),
            }));
            return true;
          } catch (error) {
            console.error('[missions] claim failed:', error);
            toast.error(error instanceof Error ? error.message : 'Não foi possível resgatar a missão.');
            return false;
          }
        }
        if (mission.claimed) return false;
        set(st => ({
          coins: st.coins + mission.reward,
          xp: st.xp + mission.rewardXp,
          level: levelFromXp(st.xp + mission.rewardXp),
          missions: st.missions.map(m => m.id === id ? { ...m, claimed: true } : m),
          transactions: [{ id: nanoid(8), type: 'earn' as const, amount: mission.reward, reason: `Missão: ${mission.title}`, at: Date.now() }, ...st.transactions].slice(0, 50),
        }));
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
            squad.starters = [...squad.starters];
            squad.starters[index] = { ...squad.starters[index], uid: cardUid };
          }
          return { squads: { ...st.squads, [sport]: squad } };
        });
        scheduleSquadSave(() => get().squads[sport]);
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
            squad.starters = [...squad.starters];
            squad.starters[index] = { ...squad.starters[index], uid: null };
          }
          return { squads: { ...st.squads, [sport]: squad } };
        });
        scheduleSquadSave(() => get().squads[sport]);
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
        scheduleSquadSave(() => get().squads[sport]);
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
          supabase.auth.getSession().then(async ({ data }: { data: any }) => {
            const uid = data.session?.user?.id;
            if (uid) {
              const remote = await saveSquadService(uid, squad, name);
              if (remote) {
                set(st => ({ savedSquads: st.savedSquads.map(x => x.id === id ? { ...x, id: remote.id } : x) }));
              }
              await upsertPrimarySquad(uid, squad);
            }
          });
        }
        return id;
      },
      deleteSquad: (id) => {
        set(st => ({ savedSquads: st.savedSquads.filter(s => s.id !== id) }));
        if (supabase) {
          supabase.from('saved_squads').delete().eq('id', id).then(() => {});
        }
      },
      setPrimarySquad: (id) => {
        if (!get().savedSquads.some(s => s.id === id)) return;
        get().loadSquad(id);
        set(st => ({
          savedSquads: st.savedSquads.map(s => ({ ...s, isPrimary: s.id === id ? true : (s.sport === st.savedSquads.find(x=>x.id===id)?.sport ? false : s.isPrimary) }))
        }));
        if (supabase) {
          supabase.auth.getSession().then(async ({ data }: { data: any }) => {
            const uid = data.session?.user?.id;
            if (uid) {
              await supabase!.from('saved_squads').update({ is_primary: false }).eq('user_id', uid);
              await supabase!.from('saved_squads').update({ is_primary: true }).eq('id', id);
            }
          });
        }
      },
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
        scheduleSquadSave(() => get().squads[sport]);
      },
      addCompareHistory: (aUid, bUid) => {
        set(st => ({ compareHistory: [{ aUid, bUid, at: Date.now() }, ...st.compareHistory].slice(0, 20) }));
        if (supabase) {
          supabase.auth.getSession().then(async ({ data }: { data: any }) => {
            const uid = data.session?.user?.id;
            if (uid) {
              const { data: prof } = await supabase!.from('profiles').select('preferences').eq('id', uid).single();
              const prefs = prof?.preferences || {};
              await supabase!.from('profiles').update({ preferences: { ...prefs, compareHistory: get().compareHistory } }).eq('id', uid);
            }
          });
        }
      },
      addMatchHistory: (entry) => {
        if (entry.challengeId) {
          set(st => st.matchHistory.some(match => match.challengeId === entry.challengeId)
            ? st
            : { matchHistory: [entry, ...st.matchHistory].slice(0, 50) });
          return;
        }
        set(st => ({ matchHistory: [entry, ...st.matchHistory].slice(0, 50) }));
        if (supabase) {
          supabase.auth.getSession().then(async ({ data }: { data: any }) => {
            const uid = data.session?.user?.id;
            if (uid) await addMatch(uid, { sport: entry.sport, homeScore: entry.homeScore, awayScore: entry.awayScore, opponent: entry.opponent, matchType: 'friendly', status: 'completed' });
          });
        }
      },
      addLocalMatchHistory: (entry) => {
        set(st => {
          if (entry.challengeId && st.matchHistory.some(match => match.challengeId === entry.challengeId)) return st;
          return { matchHistory: [entry, ...st.matchHistory].slice(0, 50) };
        });
      },
      updateSettings: (s) => {
        const previousSettings = get().settings;
        set(st => ({ settings: { ...st.settings, ...s } }));
        if (supabase) {
          supabase.auth.getSession().then(async ({ data }: { data: any }) => {
            const uid = data.session?.user?.id;
            if (!uid) throw new Error('Sessão inválida para atualizar preferências.');
            await updateSettingsService(uid, s);
          }).catch(error => {
            console.error('[settings] update failed:', error);
            set({ settings: previousSettings });
            toast.error(error instanceof Error ? error.message : 'Não foi possível salvar as preferências.');
          });
        }
      },
      setPendingFriends: (n) => set({ pendingFriends: n }),
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
        const isGK = c.position === 'GK';
        const gkAttrs: UpgradeAttr[] = ['reflexes', 'positioning', 'handling'];
        if (gkAttrs.includes(attr) && !isGK) return false;
        if (isGK && (attr === 'shooting' || attr === 'dribbling')) return false;
        if ((c.evoPoints ?? 0) <= 0) return false;
        const upgrades = { ...(c.upgrades ?? {}) } as Record<string, number>;
        if (totalUpgrades(c as any) >= 15) return false; // limite total
        if ((upgrades[attr] ?? 0) >= 10) return false; // limite por atributo
        const current = (c as any)[attr] ?? 0;
        if (current >= 99) return false;
        upgrades[attr] = (upgrades[attr] ?? 0) + 1;
        const before = { pace: c.pace, shooting: c.shooting, passing: c.passing, dribbling: c.dribbling, defending: c.defending, physical: c.physical };
        const gkBefore = isGK ? { reflexes: c.reflexes ?? 50, positioning: c.positioning ?? 50, handling: c.handling ?? 50 } : undefined;
        const after: any = { ...before, ...(gkBefore ?? {}), [attr]: current + 1 };
        const gkAfter = isGK ? { reflexes: after.reflexes, positioning: after.positioning, handling: after.handling } : undefined;
        // overall sobe pelo ganho real do atributo (ponderado pela posição), preservando
        // o bônus de raridade/edição, 
        const delta = overallFromAttributes(c.position, after, gkAfter) - overallFromAttributes(c.position, before, gkBefore);
        const newOverall = Math.min(99, c.overall + delta);
        set(st => ({
          cards: st.cards.map(x => x.uid === uid ? {
            ...x,
            [attr]: current + 1,
            upgrades: upgrades as any,
            evoPoints: (x.evoPoints ?? 0) - 1,
            overall: newOverall,
            evolutionLog: [...(x.evolutionLog ?? []), { attr, at: Date.now() }],
          } : x),
        }));
        return true;
      },
      convertDuplicates: async () => {
        if (duplicateConversionPending) return 0;
        duplicateConversionPending = true;
        try {
          if (supabase) {
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
            if (sessionError) throw sessionError;
            const uid = sessionData.session?.user?.id;
            if (!uid) throw new Error('Entre na sua conta para converter duplicatas.');
            const { data: count, error } = await supabase.rpc('convert_duplicates');
            if (error) throw error;
            const converted = Number(count) || 0;
            if (converted > 0) {
              const [remoteCards, profileResult] = await Promise.all([
                getCards(uid),
                supabase.from('profiles').select('coins, name').eq('id', uid).single(),
              ]);
              if (remoteCards) set({ cards: remoteCards });
              if (profileResult.error) console.error('[duplicates] could not refresh profile:', profileResult.error);
              else if (profileResult.data) set({ coins: profileResult.data.coins });
              const allCards = remoteCards ?? get().cards;
              const squadOverall = Math.round(allCards.reduce((sum, card) => sum + card.overall, 0) / Math.max(1, allCards.length));
              const rareCount = allCards.filter(card => ['rare', 'epic', 'legendary', 'icon'].includes(card.rarity)).length;
              if (profileResult.data) {
                await updateCollectorRanking(uid, profileResult.data.name || 'Jogador', allCards.length, squadOverall, rareCount);
              }
            }
            return converted;
          }

          const rarityRank: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, icon: 5 };
          const st0 = get();
          const cards = st0.cards;
          const locked = new Set<string>();
          const addSquad = (starters: { uid: string | null }[], bench: (string | null)[]) => {
            starters.forEach(slot => slot.uid && locked.add(slot.uid));
            bench.forEach(uid => uid && locked.add(uid));
          };
          Object.values(st0.squads).forEach((squad: any) => squad && addSquad(squad.starters ?? [], squad.bench ?? []));
          (st0.savedSquads as any[]).forEach(squad => addSquad(squad.starters?.map?.((uid: any) => (typeof uid === 'string' ? { uid } : uid)) ?? [], squad.bench ?? []));
          st0.listings.filter(listing => listing.status === 'active').forEach(listing => locked.add(listing.cardUid));

          const byName: Record<string, typeof cards> = {};
          cards.forEach(card => { (byName[card.name] = byName[card.name] || []).push(card); });
          const toRemove: string[] = [];
          Object.values(byName).forEach(group => {
            const nonIcon = group.filter(card => card.rarity !== 'icon');
            if (nonIcon.length <= 1) return;
            const score = (card: typeof cards[number]) => [rarityRank[card.rarity] ?? 0, card.overall, totalUpgrades(card as any) + (card.xp ?? 0) / 1000];
            const sorted = [...nonIcon].sort((a, b) => {
              const sa = score(a), sb = score(b);
              for (let i = 0; i < sa.length; i++) if (sb[i] !== sa[i]) return sb[i] - sa[i];
              return 0;
            });
            sorted.slice(1).forEach(card => { if (!card.favorite && !locked.has(card.uid)) toRemove.push(card.uid); });
          });
          if (toRemove.length === 0) return 0;
          set(st => ({
            cards: st.cards.filter(card => !toRemove.includes(card.uid)),
            coins: st.coins + toRemove.length * 200,
            transactions: [{ id: nanoid(8), type: 'earn' as const, amount: toRemove.length * 200, reason: `Conversão de ${toRemove.length} duplicatas`, at: Date.now() }, ...st.transactions].slice(0, 50),
          }));
          return toRemove.length;
        } catch (error) {
          console.error('[duplicates] conversion failed:', error);
          toast.error(error instanceof Error ? error.message : 'Não foi possível converter as duplicatas.');
          return 0;
        } finally {
          duplicateConversionPending = false;
        }
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
      listCard: async (cardUid, price, buyNow, hours) => {
        if (listingsPending.has(cardUid)) return null;
        const c = get().cards.find(x => x.uid === cardUid);
        if (!c) return null;
        listingsPending.add(cardUid);
        try {
          if (supabase) {
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
            if (sessionError) throw sessionError;
            const sellerId = sessionData.session?.user?.id;
            if (!sellerId) throw new Error('Entre na sua conta para anunciar uma carta.');
            const remote = await createListing({
              sellerId,
              cardUid,
              cardName: c.name,
              cardOverall: c.overall,
              cardPosition: c.position,
              cardRarity: c.rarity,
              cardImage: c.image,
              cardAttributes: { pace: c.pace, shooting: c.shooting, passing: c.passing, dribbling: c.dribbling, defending: c.defending, physical: c.physical, reflexes: c.reflexes, positioning: c.positioning, handling: c.handling },
              price,
              buyNow,
              expiresAt: new Date(Date.now() + hours * 3600000).toISOString(),
              status: 'active',
            });
            if (!remote) throw new Error('O servidor não confirmou a criação do anúncio.');
            const listing: Listing = {
              id: remote.id,
              cardUid: remote.cardUid,
              seller: 'user',
              sellerId,
              sellerName: 'Você',
              price: remote.price,
              buyNow: remote.buyNow,
              bids: [],
              createdAt: new Date(remote.createdAt).getTime(),
              expiresAt: new Date(remote.expiresAt).getTime(),
              status: 'active',
              cardName: remote.cardName,
              cardOverall: remote.cardOverall,
              cardPosition: remote.cardPosition,
              cardRarity: remote.cardRarity,
              cardImage: remote.cardImage,
              cardAttributes: remote.cardAttributes,
            };
            set(st => ({
              listings: [listing, ...st.listings.filter(item => item.cardUid !== cardUid || item.status !== 'active')],
              cards: st.cards.map(card => card.uid === cardUid ? { ...card, isNew: false } : card),
            }));
            return listing.id;
          }

          if (get().listings.some(item => item.status === 'active' && item.cardUid === cardUid)) return null;
          const current = get();
          const inSquad = Object.values(current.squads).some((squad: any) => squad && ([...(squad.starters ?? []).map((slot: any) => slot.uid), ...(squad.bench ?? [])]).includes(cardUid));
          if (inSquad) return null;
          const id = nanoid(8);
          const listing: Listing = {
            id, cardUid, seller: 'user', sellerName: 'Você',
            price, buyNow, bids: [], createdAt: Date.now(),
            expiresAt: Date.now() + hours * 3600000, status: 'active',
          };
          set(st => ({
            listings: [listing, ...st.listings],
            cards: st.cards.map(card => card.uid === cardUid ? { ...card, isNew: false } : card),
          }));
          return id;
        } catch (error) {
          console.error('[marketplace] listing creation failed:', error);
          toast.error(error instanceof Error ? error.message : 'Não foi possível anunciar a carta.');
          return null;
        } finally {
          listingsPending.delete(cardUid);
        }
      },
      cancelListing: async (id) => {
        const listing = get().listings.find(item => item.id === id);
        if (!listing || listing.status !== 'active') return false;
        if (supabase && listing.sellerId) {
          try {
            const cancelled = await cancelListingService(id);
            if (!cancelled) return false;
          } catch (error) {
            console.error('[marketplace] listing cancellation failed:', error);
            return false;
          }
        }
        set(st => ({ listings: st.listings.map(l => l.id === id && l.status === 'active' ? { ...l, status: 'cancelled' } : l) }));
        return true;
      },
      buyListing: async (id) => {
        const listing = get().listings.find(l => l.id === id);
        if (!listing || listing.status !== 'active') return false;
        const cost = listing.buyNow > 0 ? listing.buyNow : listing.price;
        if (get().coins < cost) return false;
        if (supabase) {
          const { data, error } = await supabase.functions.invoke('buy-listing', { body: { listingId: id } });
          if (error || !data?.ok) return false;
          // refresh cards and coins from Supabase
          const uid = (await supabase.auth.getSession()).data.session?.user?.id;
          if (uid) {
            const remoteCards = await getCards(uid);
            if (remoteCards) set({ cards: remoteCards });
            const { data: prof } = await supabase.from('profiles').select('coins').eq('id', uid).single();
            if (prof) set({ coins: prof.coins });
          }
          set(st => ({ listings: st.listings.map(l => l.id === id ? { ...l, status: 'sold' } : l) }));
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
      previewPack: async (packId) => {
        const s = get();
        const pack = s.packConfigs.find(p => p.id === packId);
        if (!pack || !pack.unlocked || !pack.choice) return null;
        if (s.coins < pack.price) {
          toast.alert('Saldo insuficiente.');
          return null;
        }
        if (!supabase) return null;
        let data: OpenPackRow[] | null = null;
        let openError: string | null = null;
        try {
          const result = await supabase.rpc('open_pack', { p_pack_id: packId });
          if (result.error) openError = result.error.message;
          else data = result.data as OpenPackRow[] | null;
        } catch (error) {
          openError = error instanceof Error ? error.message : 'erro desconhecido';
        }
        if (openError || !data?.length) {
          toast.error('Erro ao gerar escolha: ' + (openError ?? 'nenhuma carta foi retornada'));
          return null;
        }
        const rows = data;
        const choiceId = rows[0].choice_id;
        if (!choiceId) {
          toast.error('O servidor não retornou um identificador para a escolha.');
          return null;
        }
        const cards = rows.map(mapOpenPackCard);
        set(st => ({
          coins: rows[0].remaining_coins,
          transactions: [{ id: nanoid(8), type: 'spend' as const, amount: pack.price, reason: `Abertura ${pack.name}`, at: Date.now() }, ...st.transactions].slice(0, 50),
          packsOpened: st.packsOpened + 1,
        }));
        get().updateMissionProgress();
        return { cards, choiceId };
      },
      claimPreviewedCard: async (card, choiceId) => {
        if (!supabase) return null;
        let data: OpenPackRow[] | null = null;
        let claimError: string | null = null;
        try {
          const result = await supabase.rpc('claim_pack_choice', {
            p_choice_id: choiceId,
            p_card_id: card.uid,
          });
          if (result.error) claimError = result.error.message;
          else data = result.data as OpenPackRow[] | null;
        } catch (error) {
          claimError = error instanceof Error ? error.message : 'erro desconhecido';
        }
        if (claimError || !data?.length) {
          toast.error('Erro ao resgatar carta: ' + (claimError ?? 'a escolha expirou ou já foi usada'));
          return null;
        }
        const claimedCard = mapOpenPackCard(data[0]);
        set(st => ({
          cards: [claimedCard, ...st.cards],
          newCardUids: [claimedCard.uid, ...st.newCardUids].slice(0, 50),
        }));
        get().addXp(10);
        get().updateMissionProgress();
        return claimedCard;
      },
      addLocalCard: (card) => {
        set(st => ({
          cards: [{ ...card, custom: true }, ...st.cards.filter(c => c.uid !== card.uid)],
          newCardUids: [card.uid, ...st.newCardUids].slice(0, 50),
        }));
        get().addXp(10);
        get().updateMissionProgress();
      },
      completeSBC: async (sbcId, cardUids) => {
        if (sbcCompletionsPending.has(sbcId)) return false;
        const sbc = get().sbcs.find(s => s.id === sbcId);
        if (!sbc || new Set(cardUids).size !== cardUids.length) return false;
        const cards = get().cards.filter(c => cardUids.includes(c.uid));
        if (cards.length !== cardUids.length) return false;
        const stSbc = get();
        if (cardUids.some(u => stSbc.listings.some(l => l.status === 'active' && l.cardUid === u))) return false;
        if (Object.values(stSbc.squads).some((sq: any) => sq && ([...(sq.starters ?? []).map((s: any) => s.uid), ...(sq.bench ?? [])]).some((u: string | null) => u && cardUids.includes(u)))) return false;
        if (cards.length < sbc.requirements.count) return false;
        if (sbc.requirements.minOverall && cards.some(c => c.overall < sbc.requirements.minOverall!)) return false;
        if (sbc.requirements.sameClub && new Set(cards.map(c => c.club)).size !== 1) return false;

        sbcCompletionsPending.add(sbcId);
        try {
          if (supabase) {
            if (!cardUids.every(uid => UUID_RE.test(uid))) {
              toast.error('Todas as cartas do SBC precisam estar sincronizadas com sua conta.');
              return false;
            }
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
            if (sessionError) throw sessionError;
            if (!sessionData.session?.user?.id) throw new Error('Entre na sua conta para concluir o SBC.');
            const { data, error } = await supabase.rpc('complete_sbc', {
              p_sbc_id: sbcId,
              p_card_ids: cardUids,
            });
            if (error) throw error;
            const reward = data as { coins: number; xp: number; level: number; reward_coins: number };
            const now = Date.now();
            set(st => ({
              cards: st.cards.filter(card => !cardUids.includes(card.uid)),
              coins: reward.coins,
              xp: reward.xp,
              level: reward.level,
              transactions: reward.reward_coins > 0
                ? [{ id: nanoid(8), type: 'earn' as const, amount: reward.reward_coins, reason: `SBC: ${sbc.title}`, at: now }, ...st.transactions].slice(0, 50)
                : st.transactions,
            }));
            return true;
          }

          set(st => ({
            cards: st.cards.filter(card => !cardUids.includes(card.uid)),
            coins: st.coins + (sbc.reward.type === 'coins' ? Number(sbc.reward.value) : 1000),
            xp: st.xp + 100,
            level: levelFromXp(st.xp + 100),
            transactions: [{ id: nanoid(8), type: 'earn' as const, amount: sbc.reward.type === 'coins' ? Number(sbc.reward.value) : 1000, reason: `SBC: ${sbc.title}`, at: Date.now() }, ...st.transactions].slice(0, 50),
          }));
          return true;
        } catch (error) {
          console.error('[sbc] completion failed:', error);
          toast.error(error instanceof Error ? error.message : 'Não foi possível concluir o SBC.');
          return false;
        } finally {
          sbcCompletionsPending.delete(sbcId);
        }
      },
      seedMarket: () => {},
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