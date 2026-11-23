import { useCallback, useEffect, useState } from 'react';
import { nanoid } from 'nanoid';
import { ChevronDown, History, Megaphone, Trash2, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { toast } from '../store/toast';
import Card from '../components/Card';
import type { ExtraStat, PlayerCard, Position, Rarity } from '../types';
import { RARITY_MODIFIER, RARITY_OVR_BONUS, SPECIAL_OVR_BONUS, calculateOverall, isAutoCalculatedTemplate, allTemplates, loadDbTemplates } from '../data/players';
import { validateRarityOverall } from '../lib/game';
import { validateExtraStats } from '../lib/extraStats';
import SecretCardOddsTable from '../components/SecretCardOddsTable';
import { useGame } from '../store/useGame';
import AdminUsersPanel from '../components/AdminUsersPanel';
import AdminChangelogPanel from '../components/AdminChangelogPanel';
import AdminBroadcastPanel from '../components/AdminBroadcastPanel';

const ADMIN_USER_ID = '35a8dc5f-c5db-4b33-9380-a32739ff6c10';
const DEFAULT_EDITION = '2025/26';
const DEFAULT_NATIONALITY = 'Brasil';

const POSITIONS = ['GK', 'Fixo', 'Ala', 'Pivo'] as const;
const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'icon'] as const;
const randomTeam = (teams: string[]) => teams[Math.floor(Math.random() * teams.length)] ?? '';
const RARITY_LABELS: Record<string, string> = {
  common: 'Comum',
  uncommon: 'Incomum',
  rare: 'Rara',
  epic: 'Épica',
  legendary: 'Lendária',
  icon: 'Ícone',
  secret: 'Secreta',
};

type SecretCardSupply = {
  dropChance: number;
  maxSupply: number;
  minted: number;
};

function calcOverallLocal(
  attrs: { pace: number; shooting: number; passing: number; dribbling: number; defending: number; physical: number; reflexes?: number | null; positioning?: number | null; handling?: number | null },
  position: string,
  rarity: string,
  special: string
): number {
  const t = {
    attributes: { pace: attrs.pace, shooting: attrs.shooting, passing: attrs.passing, dribbling: attrs.dribbling, defending: attrs.defending, physical: attrs.physical },
    gkAttributes: attrs.reflexes !== undefined && attrs.reflexes !== null ? { reflexes: attrs.reflexes, positioning: attrs.positioning ?? 50, handling: attrs.handling ?? 50 } : undefined,
    position: position as Position,
    baseOverall: undefined as number | undefined,
  };
  const base = calculateOverall(t as any);
  return Math.min(99, base + (RARITY_OVR_BONUS[rarity as Rarity] ?? 0) + (SPECIAL_OVR_BONUS[special] ?? 0));
}

function calcBaseOverallLocal(
  attrs: { pace: number; shooting: number; passing: number; dribbling: number; defending: number; physical: number; reflexes?: number | null; positioning?: number | null; handling?: number | null },
  position: string
): number {
  const t = {
    attributes: { pace: attrs.pace, shooting: attrs.shooting, passing: attrs.passing, dribbling: attrs.dribbling, defending: attrs.defending, physical: attrs.physical },
    gkAttributes: attrs.reflexes !== undefined && attrs.reflexes !== null ? { reflexes: attrs.reflexes, positioning: attrs.positioning ?? 50, handling: attrs.handling ?? 50 } : undefined,
    position: position as Position,
    baseOverall: undefined as number | undefined,
  };
  return calculateOverall(t as any);
}

function applyMod(value: number, mod: number): number {
  return Math.max(0, Math.min(99, Math.round(value * mod)));
}

async function saveTemplateDetailPhoto(name: string, detailPhotoUrl: string) {
  if (!supabase) throw new Error('Supabase não está configurado.');
  const { error } = await supabase.rpc('admin_save_template_detail_image', {
    p_name: name,
    p_detail_image: detailPhotoUrl || null,
  });
  if (error) throw error;
}

export default function Admin() {
  const navigate = useNavigate();
  const syncUserData = useGame(s => s.syncUserData);
  const [userId, setUserId] = useState<string | null>(null);
  const [adminTab, setAdminTab] = useState<'cards' | 'users' | 'changelog' | 'broadcast'>('cards');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [templates, setTemplates] = useState(() => allTemplates());
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [secretSupply, setSecretSupply] = useState<Record<string, SecretCardSupply>>({});
  const [secretSupplyLoaded, setSecretSupplyLoaded] = useState(false);
  const [secretChancePercent, setSecretChancePercent] = useState(0.001);
  const [secretMaxSupply, setSecretMaxSupply] = useState(10);
  const [extraStats, setExtraStats] = useState<ExtraStat[]>([]);
  const [form, setForm] = useState(() => {
    const initialTeams = [...new Set(allTemplates().map(template => template.club).filter(Boolean))];
    return {
      name: '',
      age: 20,
      club: randomTeam(initialTeams),
      nationality: DEFAULT_NATIONALITY,
      position: 'Ala',
      rarity: 'uncommon',
      overall: 80,
      baseOverall: 80,
      baseRarity: 'uncommon',
      pace: 70,
      shooting: 70,
      passing: 70,
      dribbling: 70,
      defending: 70,
      physical: 70,
      reflexes: 0,
      positioning: 0,
      handling: 0,
      imageUrl: '',
      detailPhotoUrl: '',
      calcOverall: false,
      allowOverallOverride: false,
      destination: 'inventory' as 'inventory' | 'packs' | 'off_sale' | 'secret',
    };
  });

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id ?? null);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    let active = true;
    loadDbTemplates().then(() => {
      if (active) {
        const loadedTemplates = allTemplates();
        const loadedTeams = [...new Set(loadedTemplates.map(template => template.club).filter(Boolean))];
        setTemplates(loadedTemplates);
        setForm(prev => ({ ...prev, club: loadedTeams.includes(prev.club) ? prev.club : randomTeam(loadedTeams) }));
        setTemplatesLoaded(true);
      }
    });
    return () => { active = false; };
  }, []);

  const refreshSecretSupply = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('secret_card_supply')
      .select('template_id, drop_chance, max_supply, minted');
    if (error) throw error;
    setSecretSupply(Object.fromEntries((data ?? []).map(row => [row.template_id, {
      dropChance: Number(row.drop_chance),
      maxSupply: row.max_supply,
      minted: row.minted,
    }])));
    setSecretSupplyLoaded(true);
  }, []);

  useEffect(() => {
    if (userId !== ADMIN_USER_ID || !templatesLoaded) return;
    let active = true;
    void (async () => {
      try {
        await loadDbTemplates();
        if (!active) return;
        setTemplates(allTemplates(true));
        await refreshSecretSupply();
      } catch (error) {
        if (active) toast.error('Erro ao carregar dados das cartas secretas: ' + (error instanceof Error ? error.message : 'desconhecido'));
      }
    })();
    return () => { active = false; };
  }, [userId, templatesLoaded, refreshSecretSupply]);

  const isGK = form.position === 'GK';
  const calcMode = form.calcOverall;
  const isInventory = !editingTemplate && form.destination === 'inventory';
  const isTemplate = !!editingTemplate || form.destination !== 'inventory';
  const isOffSale = form.destination === 'off_sale';
  const isSecret = form.destination === 'secret';
  const teams = [...new Set(templates.map(template => template.club).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  const rarityToUse = isSecret ? 'secret' : calcMode ? 'uncommon' : isInventory ? form.rarity : form.baseRarity;
  const mod = RARITY_MODIFIER[rarityToUse as Rarity] ?? 1.0;

  const attrsMod = {
    pace: applyMod(form.pace, mod),
    shooting: applyMod(form.shooting, mod),
    passing: applyMod(form.passing, mod),
    dribbling: applyMod(form.dribbling, mod),
    defending: applyMod(form.defending, mod),
    physical: applyMod(form.physical, mod),
    reflexes: isGK ? applyMod(form.reflexes, mod) : undefined,
    positioning: isGK ? applyMod(form.positioning, mod) : undefined,
    handling: isGK ? applyMod(form.handling, mod) : undefined,
  };

  const attrsRaw = {
    pace: form.pace, shooting: form.shooting, passing: form.passing,
    dribbling: form.dribbling, defending: form.defending, physical: form.physical,
    reflexes: isGK ? form.reflexes : undefined,
    positioning: isGK ? form.positioning : undefined,
    handling: isGK ? form.handling : undefined,
  };

  const calculatedOverall = isInventory
    ? calcOverallLocal(attrsMod, form.position, rarityToUse, 'none')
    : calcBaseOverallLocal(attrsRaw, form.position);

  const makePreviewCard = (rarity: string): PlayerCard => {
    const rMod = RARITY_MODIFIER[rarity as Rarity] ?? 1.0;
    const previewAttrs = {
      pace: applyMod(form.pace, rMod),
      shooting: applyMod(form.shooting, rMod),
      passing: applyMod(form.passing, rMod),
      dribbling: applyMod(form.dribbling, rMod),
      defending: applyMod(form.defending, rMod),
      physical: applyMod(form.physical, rMod),
      reflexes: isGK ? applyMod(form.reflexes, rMod) : undefined,
      positioning: isGK ? applyMod(form.positioning, rMod) : undefined,
      handling: isGK ? applyMod(form.handling, rMod) : undefined,
    };
    const ovr = isInventory && !calcMode && rarity === form.rarity
      ? form.overall
      : isInventory
        ? calcOverallLocal(previewAttrs, form.position, rarity, 'none')
        : Math.min(99, (calcMode ? calculatedOverall : form.baseOverall) + (RARITY_OVR_BONUS[rarity as Rarity] ?? 0));
    return {
      uid: 'preview-' + rarity,
      playerId: form.name.toLowerCase().replace(/\s+/g, '-') + '-' + rarity,
      name: form.name || 'Nome do Jogador',
      position: form.position as any,
      sport: 'futsal',
      nationality: DEFAULT_NATIONALITY,
      age: Number(form.age) || 20,
      club: form.club || 'Clube',
      rarity: rarity as any,
      edition: DEFAULT_EDITION,
      special: 'none',
      overall: ovr,
      pace: applyMod(form.pace, rMod),
      shooting: applyMod(form.shooting, rMod),
      passing: applyMod(form.passing, rMod),
      dribbling: applyMod(form.dribbling, rMod),
      defending: applyMod(form.defending, rMod),
      physical: applyMod(form.physical, rMod),
      reflexes: isGK ? applyMod(form.reflexes, rMod) : undefined,
      positioning: isGK ? applyMod(form.positioning, rMod) : undefined,
      handling: isGK ? applyMod(form.handling, rMod) : undefined,
      image: form.imageUrl.trim(),
      favorite: false,
      isNew: true,
      obtainedAt: Date.now(),
      xp: 0,
      evoPoints: 0,
      upgrades: { pace: 0, shooting: 0, passing: 0, dribbling: 0, defending: 0, physical: 0 },
      evolutionLog: [],
      seasonStats: { matches: 0, goals: 0, assists: 0 },
    };
  };

  const startEditingTemplate = (template: ReturnType<typeof allTemplates>[number]) => {
    const supply = template.packGroup === 'secret' ? secretSupply[template.dbId ?? ''] : undefined;
    if (template.packGroup === 'secret' && !secretSupplyLoaded) {
      toast.error('Aguarde o carregamento da configuração secreta.');
      return;
    }
    if (template.packGroup === 'secret' && !supply) {
      toast.error('Não foi possível carregar o estoque desta carta secreta.');
      return;
    }
    const autoCalculateOverall = isAutoCalculatedTemplate(template);
    const calculatedBaseOverall = calcBaseOverallLocal({
      ...template.attributes,
      reflexes: template.gkAttributes?.reflexes,
      positioning: template.gkAttributes?.positioning,
      handling: template.gkAttributes?.handling,
    }, template.position);
    setEditingTemplate(template.name);
    setExtraStats(template.extraStats?.map(stat => ({ ...stat })) ?? []);
    setForm({
      name: template.name,
      age: template.age,
      club: template.club,
      nationality: template.nationality,
      position: template.position,
      rarity: template.packGroup === 'secret' ? 'secret' : autoCalculateOverall ? 'uncommon' : template.baseRarity,
      overall: autoCalculateOverall ? calculatedBaseOverall : template.baseOverall ?? calculateOverall(template),
      baseOverall: autoCalculateOverall ? calculatedBaseOverall : template.baseOverall ?? calculateOverall(template),
      baseRarity: template.packGroup === 'secret' ? 'secret' : autoCalculateOverall ? 'uncommon' : template.baseRarity,
      pace: template.attributes.pace,
      shooting: template.attributes.shooting,
      passing: template.attributes.passing,
      dribbling: template.attributes.dribbling,
      defending: template.attributes.defending,
      physical: template.attributes.physical,
      reflexes: template.gkAttributes?.reflexes ?? 0,
      positioning: template.gkAttributes?.positioning ?? 0,
      handling: template.gkAttributes?.handling ?? 0,
      imageUrl: template.image || '',
      detailPhotoUrl: template.detailPhoto || '',
      calcOverall: autoCalculateOverall,
      allowOverallOverride: false,
      destination: template.packGroup === 'secret' ? 'secret' : template.packGroup === 'off_sale' ? 'off_sale' : 'packs',
    });
    if (supply) {
      setSecretChancePercent(supply.dropChance * 100);
      setSecretMaxSupply(supply.maxSupply);
    }
    document.getElementById('card-template-form')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  const cancelTemplateEdit = () => {
    setEditingTemplate(null);
    setExtraStats([]);
    setForm(prev => ({
      ...prev,
      name: '',
      nationality: DEFAULT_NATIONALITY,
      imageUrl: '',
      detailPhotoUrl: '',
      club: randomTeam(teams),
      rarity: prev.rarity === 'secret' ? 'uncommon' : prev.rarity,
      baseRarity: prev.baseRarity === 'secret' ? 'uncommon' : prev.baseRarity,
      destination: 'inventory',
      calcOverall: false,
      allowOverallOverride: false,
    }));
  };

  const handleCreate = async () => {
    if (!supabase || !form.name.trim()) { toast.error('Nome obrigatório.'); return; }
    if (!form.club.trim() || (!editingTemplate && (teams.length === 0 || !teams.includes(form.club)))) {
      toast.error(editingTemplate ? 'Clube obrigatório.' : 'Não há times cadastrados para realizar o sorteio.');
      return;
    }
    if (editingTemplate && !form.nationality.trim()) { toast.error('Nacionalidade obrigatória.'); return; }
    const fields = [
      ['Velocidade', form.pace],
      ['Chute', form.shooting],
      ['Passe', form.passing],
      ['Drible', form.dribbling],
      ['Defesa', form.defending],
      ['Físico', form.physical],
      ...(isGK ? [['Reflexos', form.reflexes], ['Posicionamento', form.positioning], ['Defesa de Bola', form.handling]] : []),
    ] as [string, number][];
    if (form.name.trim().length > 80) { toast.error('O nome deve ter no máximo 80 caracteres.'); return; }
    if (!Number.isInteger(form.age) || form.age < 14 || form.age > 60) { toast.error('A idade deve ser um número inteiro entre 14 e 60.'); return; }
    if (!fields.every(([, value]) => Number.isInteger(value) && value >= 0 && value <= 99)) {
      toast.error('Todos os atributos devem ser números inteiros entre 0 e 99.');
      return;
    }
    const imageUrl = form.imageUrl.trim();
    if (imageUrl && !(/^https?:\/\//i.test(imageUrl) || (imageUrl.startsWith('/') && !imageUrl.startsWith('//')))) {
      toast.error('A imagem deve usar uma URL HTTP(S) ou um caminho local iniciado por /.');
      return;
    }
    const detailPhotoUrl = form.detailPhotoUrl.trim();
    if (isTemplate && detailPhotoUrl && !(/^https?:\/\//i.test(detailPhotoUrl) || (detailPhotoUrl.startsWith('/') && !detailPhotoUrl.startsWith('//')))) {
      toast.error('A foto de detalhe deve usar uma URL HTTP(S) ou um caminho local iniciado por /.');
      return;
    }
    const normalizedExtraStats = extraStats.map(stat => ({ label: stat.label.trim(), value: stat.value }));
    if (isOffSale) {
      const extraStatsError = validateExtraStats(normalizedExtraStats);
      if (extraStatsError) {
        toast.error(extraStatsError);
        return;
      }
    }
    if (isSecret && (
      !Number.isFinite(secretChancePercent)
      || secretChancePercent < 0.0001
      || secretChancePercent > 5
      || Number(secretChancePercent.toFixed(4)) !== secretChancePercent
    )) {
      toast.error('A chance deve estar entre 0,0001% e 5%, com até 4 casas decimais.');
      return;
    }
    if (isSecret && (!Number.isInteger(secretMaxSupply) || secretMaxSupply < 1)) {
      toast.error('O estoque máximo deve ser um número inteiro de pelo menos 1.');
      return;
    }
    setCreating(true);
    try {
      const rarityForVal = isInventory ? rarityToUse : form.baseRarity;
      const ovrForVal = calcMode ? calculatedOverall : (isInventory ? form.overall : form.baseOverall);
      const allowOverallOverride = isInventory && form.allowOverallOverride && !calcMode;
      const maxOverall = allowOverallOverride ? 999 : 99;
      if (!Number.isInteger(ovrForVal) || ovrForVal < 0 || ovrForVal > maxOverall) {
        toast.error(`O OVR deve ser um número inteiro entre 0 e ${maxOverall}.`);
        return;
      }
      if (!validateRarityOverall(rarityForVal as Rarity, ovrForVal)) {
        toast.warning(`Atenção: OVR ${ovrForVal} fora da banda típica para ${RARITY_LABELS[rarityForVal]}.`);
      }

      if (isSecret) {
        const templateId = editingTemplate
          ? templates.find(template => template.name === editingTemplate)?.dbId
          : null;
        if (editingTemplate && !templateId) {
          toast.error('Não foi possível identificar o template secreto que será editado.');
          return;
        }
        const { error } = await supabase.rpc('admin_upsert_secret_card', {
          p_template_id: templateId,
          p_name: form.name.trim(),
          p_position: form.position,
          p_nationality: form.nationality.trim(),
          p_age: Number(form.age),
          p_club: form.club.trim(),
          p_pace: form.pace,
          p_shooting: form.shooting,
          p_passing: form.passing,
          p_dribbling: form.dribbling,
          p_defending: form.defending,
          p_physical: form.physical,
          p_reflexes: isGK ? form.reflexes : null,
          p_positioning: isGK ? form.positioning : null,
          p_handling: isGK ? form.handling : null,
          p_image: imageUrl || null,
          p_base_overall: ovrForVal,
          p_auto_calculate_overall: calcMode,
          p_drop_chance: secretChancePercent / 100,
          p_max_supply: secretMaxSupply,
        });
        if (error) { toast.error('Erro ao salvar carta secreta: ' + error.message); return; }
        await saveTemplateDetailPhoto(form.name.trim(), detailPhotoUrl);
        await loadDbTemplates();
        setTemplates(allTemplates(true));
        await refreshSecretSupply();
        toast.success(editingTemplate ? 'Carta secreta atualizada!' : 'Carta secreta adicionada!');
        if (editingTemplate) cancelTemplateEdit();
        else setForm(prev => ({ ...prev, name: '', imageUrl: '', detailPhotoUrl: '', club: randomTeam(teams) }));
        return;
      }

      if (editingTemplate) {
        const { error } = await supabase.rpc('admin_save_template', {
          p_name: editingTemplate,
          p_position: form.position,
          p_nationality: form.nationality.trim(),
          p_age: Number(form.age),
          p_club: form.club.trim(),
          p_pace: form.pace,
          p_shooting: form.shooting,
          p_passing: form.passing,
          p_dribbling: form.dribbling,
          p_defending: form.defending,
          p_physical: form.physical,
          p_reflexes: isGK ? form.reflexes : null,
          p_positioning: isGK ? form.positioning : null,
          p_handling: isGK ? form.handling : null,
          p_image: imageUrl || null,
          p_base_rarity: form.baseRarity,
          p_base_overall: ovrForVal,
          p_pack_group: isOffSale ? 'off_sale' : 'standard',
          p_extra_stats: isOffSale ? normalizedExtraStats : [],
          p_auto_calculate_overall: calcMode,
        });
        if (error) { toast.error('Erro: ' + error.message); return; }
        await saveTemplateDetailPhoto(editingTemplate, detailPhotoUrl);
        await loadDbTemplates();
        setTemplates(allTemplates(true));
        toast.success('Template atualizado com sucesso!');
        cancelTemplateEdit();
        return;
      }

      if (isInventory) {
        const ovr = calcMode ? calculatedOverall : form.overall;
        const club = form.club;
        const { data: createdCardId, error } = await supabase.rpc('create_card', {
          p_name: form.name.trim(),
          p_position: form.position,
          p_rarity: rarityToUse,
          p_overall: ovr,
          p_pace: attrsMod.pace,
          p_shooting: attrsMod.shooting,
          p_passing: attrsMod.passing,
          p_dribbling: attrsMod.dribbling,
          p_defending: attrsMod.defending,
          p_physical: attrsMod.physical,
          p_reflexes: isGK ? attrsMod.reflexes : null,
          p_positioning: isGK ? attrsMod.positioning : null,
          p_handling: isGK ? attrsMod.handling : null,
          p_special: 'none',
          p_image: imageUrl || null,
          p_nationality: form.nationality.trim(),
          p_age: Number(form.age),
          p_club: club,
          p_allow_overall_over_99: allowOverallOverride,
        });
        if (error) { toast.error('Erro: ' + error.message); return; }
        toast.success('Carta criada no inventário!');
        const novaCarta: PlayerCard = {
          uid: createdCardId || nanoid(10),
          playerId: form.name.trim().toLowerCase().replace(/\s+/g, '-') + '-' + rarityToUse,
          name: form.name.trim(),
          position: form.position as Position,
          sport: 'futsal',
          nationality: DEFAULT_NATIONALITY,
          age: Number(form.age),
          club,
          rarity: rarityToUse as any,
          edition: DEFAULT_EDITION,
          special: 'none',
          overall: ovr,
          image: imageUrl || undefined,
          pace: attrsMod.pace,
          shooting: attrsMod.shooting,
          passing: attrsMod.passing,
          dribbling: attrsMod.dribbling,
          defending: attrsMod.defending,
          physical: attrsMod.physical,
          reflexes: isGK ? attrsMod.reflexes : undefined,
          positioning: isGK ? attrsMod.positioning : undefined,
          handling: isGK ? attrsMod.handling : undefined,
          favorite: false,
          isNew: true,
          obtainedAt: Date.now(),
          xp: 0,
          evoPoints: 0,
          upgrades: { pace: 0, shooting: 0, passing: 0, dribbling: 0, defending: 0, physical: 0 },
          evolutionLog: [],
          seasonStats: { matches: 0, goals: 0, assists: 0 },
          custom: true,
        };
        useGame.getState().addLocalCard(novaCarta);
        if (userId) await syncUserData(userId);
      } else {
        const ovr = calcMode ? calculatedOverall : form.baseOverall;
        const club = form.club;
        const templateParams = {
          p_name: form.name.trim(),
          p_position: form.position,
          p_nationality: form.nationality.trim(),
          p_age: Number(form.age) || 20,
          p_club: club,
          p_pace: form.pace,
          p_shooting: form.shooting,
          p_passing: form.passing,
          p_dribbling: form.dribbling,
          p_defending: form.defending,
          p_physical: form.physical,
          p_reflexes: isGK ? form.reflexes : null,
          p_positioning: isGK ? form.positioning : null,
          p_handling: isGK ? form.handling : null,
          p_image: imageUrl || null,
          p_base_rarity: form.baseRarity,
          p_base_overall: ovr,
        };
        const { error } = await supabase.rpc('admin_save_template', {
          ...templateParams,
          p_pack_group: isOffSale ? 'off_sale' : 'standard',
          p_extra_stats: isOffSale ? normalizedExtraStats : [],
          p_auto_calculate_overall: calcMode,
        });
        if (error) { toast.error('Erro: ' + error.message); return; }
        await saveTemplateDetailPhoto(form.name.trim(), detailPhotoUrl);
        await loadDbTemplates();
        setTemplates(allTemplates(true));
        toast.success(isOffSale ? 'Carta adicionada ao Pacote Off-Sale!' : 'Carta adicionada aos pacotes!');
      }
      if (isOffSale) setExtraStats([]);
      setForm(prev => ({ ...prev, name: '', imageUrl: '', detailPhotoUrl: '', club: randomTeam(teams), allowOverallOverride: false }));
    } catch (e: any) {
      toast.error('Erro: ' + (e?.message || 'desconhecido'));
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <div className="p-8 text-[var(--muted)]">Carregando...</div>;

  if (userId !== ADMIN_USER_ID) {
    return (
      <div className="p-8 text-center text-[var(--muted)]">
        <div className="text-lg font-bold text-[var(--text)] mb-2">Acesso restrito</div>
        <div className="text-sm">Esta página é exclusiva para administradores.</div>
        <button onClick={() => navigate('/')} className="mt-4 px-4 py-2 rounded-xl bg-[var(--red)] text-white text-sm">Voltar</button>
      </div>
    );
  }

  const inputCls = "w-full h-11 bg-white border border-[#E2E4EA] rounded-xl px-3 text-sm text-[var(--text)] placeholder:text-[#B7BAC4] transition focus:border-[var(--red)] focus:outline-none focus:ring-4 focus:ring-[var(--red)]/10 disabled:bg-[var(--bg)] disabled:text-[var(--muted)]";
  const labelCls = "text-xs font-semibold text-[#555B68] mb-1.5 block";

  return (
    <>
      <div className={`mx-auto w-full ${adminTab === 'users' ? 'max-w-none' : 'max-w-5xl'} p-4 md:p-8 space-y-6`}>
        <h1 className="text-2xl font-bold text-[var(--text)]">Painel Administrador</h1>

        <div role="tablist" aria-label="Seções do painel administrador" className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-3">
          <button
            type="button"
            role="tab"
            aria-selected={adminTab === 'cards'}
            onClick={() => setAdminTab('cards')}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${adminTab === 'cards' ? 'bg-[var(--red)] text-white' : 'bg-white text-[#555B68] hover:bg-[var(--bg)]'}`}
          >
            Cartas e templates
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={adminTab === 'users'}
            onClick={() => setAdminTab('users')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${adminTab === 'users' ? 'bg-[var(--red)] text-white' : 'bg-white text-[#555B68] hover:bg-[var(--bg)]'}`}
          >
            <Users className="size-4" /> Usuários
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={adminTab === 'changelog'}
            onClick={() => setAdminTab('changelog')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${adminTab === 'changelog' ? 'bg-[var(--red)] text-white' : 'bg-white text-[#555B68] hover:bg-[var(--bg)]'}`}
          >
            <History className="size-4" /> Changelog
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={adminTab === 'broadcast'}
            onClick={() => setAdminTab('broadcast')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${adminTab === 'broadcast' ? 'bg-[var(--red)] text-white' : 'bg-white text-[#555B68] hover:bg-[var(--bg)]'}`}
          >
            <Megaphone className="size-4" /> Mensagem global
          </button>
        </div>

        {adminTab === 'users' ? <AdminUsersPanel /> : adminTab === 'changelog' ? <AdminChangelogPanel /> : adminTab === 'broadcast' ? <AdminBroadcastPanel /> : (
          <>
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
          <div id="card-template-form" className="min-w-0 card-surface p-4 md:p-5 space-y-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-[var(--text)]">
                {editingTemplate ? `Editar template: ${editingTemplate}` : 'Criar Carta'}
              </h2>
              {editingTemplate && (
                <button
                  type="button"
                  onClick={cancelTemplateEdit}
                  className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-xs font-semibold text-[#555B68]"
                >
                  Cancelar edição
                </button>
              )}
            </div>

            <section className="rounded-2xl border border-[var(--border)] p-4 md:p-5 space-y-4">
              <div className="flex items-center gap-2 text-sm font-bold text-[var(--text)]">
                <span className="grid size-6 place-items-center rounded-lg bg-[#FFF0F1] text-xs text-[var(--red)]">1</span>
                Informações básicas
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Nome do Jogador</label>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="Ex: João Marcos" readOnly={!!editingTemplate} />
                </div>
                <div>
                  <label className={labelCls}>URL da arte da carta</label>
                  <input value={form.imageUrl} onChange={e => setForm({ ...form, imageUrl: e.target.value })} className={inputCls} placeholder="https://... ou /assets/imagem.jpg" />
                </div>
                {isTemplate && (
                  <div>
                    <label className={labelCls}>URL da foto de detalhe do atleta</label>
                    <input
                      value={form.detailPhotoUrl}
                      onChange={e => setForm(prev => ({ ...prev, detailPhotoUrl: e.target.value }))}
                      className={inputCls}
                      placeholder="https://... ou /assets/foto-detalhe.png"
                      aria-describedby="detail-photo-help"
                    />
                    <p id="detail-photo-help" className="mt-1 text-[10px] leading-relaxed text-[var(--muted)]">
                      Usada no hero da página do atleta; não altera a arte da carta. Deixe vazia para usar a imagem padrão.
                    </p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Nacionalidade</label>
                {editingTemplate
                  ? <input value={form.nationality} onChange={e => setForm({ ...form, nationality: e.target.value })} className={inputCls} maxLength={50} />
                  : <div className={`${inputCls} flex items-center bg-[var(--bg)]`}>{DEFAULT_NATIONALITY}</div>}
              </div>
              <div>
                <label className={labelCls}>Idade</label>
                <input type="number" value={form.age} onChange={e => setForm({ ...form, age: Number(e.target.value) })} className={inputCls} min={14} max={60} />
              </div>
              <div>
                <label className={labelCls}>{editingTemplate ? 'Clube' : 'Time (sorteado)'}</label>
                {editingTemplate
                  ? <input value={form.club} onChange={e => setForm({ ...form, club: e.target.value })} className={inputCls} maxLength={80} />
                  : <div className={`${inputCls} flex items-center bg-[var(--bg)]`}>{form.club || 'Aguardando sorteio...'}</div>}
              </div>
            </div>
            </section>

            <section className="rounded-2xl border border-[var(--border)] p-4 md:p-5 space-y-4">
              <div className="flex items-center gap-2 text-sm font-bold text-[var(--text)]">
                <span className="grid size-6 place-items-center rounded-lg bg-[#FFF0F1] text-xs text-[var(--red)]">2</span>
                Características
              </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Posição</label>
                <div className="relative">
                  <select value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} className={`${inputCls} appearance-none pr-10`}>
                    {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" />
                </div>
              </div>
              <div>
                <label className={labelCls}>Raridade</label>
                {isSecret ? (
                  <div className={`${inputCls} flex items-center gap-2 bg-[#111318] font-semibold text-white`}>
                    <span className="size-3 rounded-full border border-white/60 bg-black" />
                    Secreta
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <select value={calcMode ? 'uncommon' : isInventory ? form.rarity : form.baseRarity} onChange={e => {
                        const val = e.target.value as typeof form.rarity;
                        if (isInventory) setForm({ ...form, rarity: val });
                        else setForm({ ...form, baseRarity: val });
                      }} className={`${inputCls} appearance-none pr-10`} disabled={calcMode}>
                        {RARITIES.map(r => <option key={r} value={r}>{RARITY_LABELS[r]}</option>)}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" />
                    </div>
                    {calcMode && <div className="text-[10px] text-[var(--muted)] mt-1">Cálculo automático fixa a raridade em Incomum.</div>}
                  </>
                )}
              </div>
            </div>

            </section>

            <section className="rounded-2xl border border-[var(--border)] p-4 md:p-5 space-y-4">
              <div className="flex items-center gap-2 text-sm font-bold text-[var(--text)]">
                <span className="grid size-6 place-items-center rounded-lg bg-[#FFF0F1] text-xs text-[var(--red)]">3</span>
                Atributos
              </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className={labelCls}>Velocidade</label>
                <input type="number" value={form.pace} onChange={e => setForm({ ...form, pace: Number(e.target.value) })} className={`${inputCls} h-14 bg-[#FAFAFB] text-center text-lg font-bold tabular-nums`} min={0} max={99} />
              </div>
              <div>
                <label className={labelCls}>Chute</label>
                <input type="number" value={form.shooting} onChange={e => setForm({ ...form, shooting: Number(e.target.value) })} className={`${inputCls} h-14 bg-[#FAFAFB] text-center text-lg font-bold tabular-nums`} min={0} max={99} />
              </div>
              <div>
                <label className={labelCls}>Passe</label>
                <input type="number" value={form.passing} onChange={e => setForm({ ...form, passing: Number(e.target.value) })} className={`${inputCls} h-14 bg-[#FAFAFB] text-center text-lg font-bold tabular-nums`} min={0} max={99} />
              </div>
              <div>
                <label className={labelCls}>Drible</label>
                <input type="number" value={form.dribbling} onChange={e => setForm({ ...form, dribbling: Number(e.target.value) })} className={`${inputCls} h-14 bg-[#FAFAFB] text-center text-lg font-bold tabular-nums`} min={0} max={99} />
              </div>
              <div>
                <label className={labelCls}>Defesa</label>
                <input type="number" value={form.defending} onChange={e => setForm({ ...form, defending: Number(e.target.value) })} className={`${inputCls} h-14 bg-[#FAFAFB] text-center text-lg font-bold tabular-nums`} min={0} max={99} />
              </div>
              <div>
                <label className={labelCls}>Físico</label>
                <input type="number" value={form.physical} onChange={e => setForm({ ...form, physical: Number(e.target.value) })} className={`${inputCls} h-14 bg-[#FAFAFB] text-center text-lg font-bold tabular-nums`} min={0} max={99} />
              </div>
            </div>

            {isGK && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className={labelCls}>Reflexos</label>
                  <input type="number" value={form.reflexes} onChange={e => setForm({ ...form, reflexes: Number(e.target.value) })} className={`${inputCls} h-14 bg-[#FAFAFB] text-center text-lg font-bold tabular-nums`} min={0} max={99} />
                </div>
                <div>
                  <label className={labelCls}>Posicionamento</label>
                  <input type="number" value={form.positioning} onChange={e => setForm({ ...form, positioning: Number(e.target.value) })} className={`${inputCls} h-14 bg-[#FAFAFB] text-center text-lg font-bold tabular-nums`} min={0} max={99} />
                </div>
                <div>
                  <label className={labelCls}>Defesa de Bola</label>
                  <input type="number" value={form.handling} onChange={e => setForm({ ...form, handling: Number(e.target.value) })} className={`${inputCls} h-14 bg-[#FAFAFB] text-center text-lg font-bold tabular-nums`} min={0} max={99} />
                </div>
              </div>
            )}
            </section>

            <section className="rounded-2xl border border-[var(--border)] p-4 md:p-5 space-y-4">
              <div className="flex items-center gap-2 text-sm font-bold text-[var(--text)]">
                <span className="grid size-6 place-items-center rounded-lg bg-[#FFF0F1] text-xs text-[var(--red)]">4</span>
                Configurações
              </div>
              <p className="text-xs text-[var(--muted)]">O título especial das cartas dos pacotes é definido por sorteio ao abrir o pacote.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Destino da carta</label>
                  <div className="relative">
                    <select value={form.destination} onChange={e => {
                      const destination = e.target.value as typeof form.destination;
                      setForm({
                        ...form,
                        destination,
                        allowOverallOverride: false,
                        rarity: destination === 'secret' ? 'secret' : form.rarity === 'secret' ? 'uncommon' : form.rarity,
                        baseRarity: destination === 'secret' ? 'secret' : form.baseRarity === 'secret' ? 'uncommon' : form.baseRarity,
                      });
                      if (destination !== 'off_sale') setExtraStats([]);
                    }} className={`${inputCls} appearance-none pr-10`} disabled={!!editingTemplate && isSecret}>
                      {!editingTemplate && <option value="inventory">Inventário (admin)</option>}
                      <option value="packs">Pacotes (disponível para todos)</option>
                      <option value="off_sale">Somente Pacote Off-Sale (zoeira)</option>
                      {(!editingTemplate || isSecret) && <option value="secret">Secreta (chance e estoque globais)</option>}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Overall {isInventory ? '' : '(base)'} {calcMode && <span className="text-[var(--red)]">(calculado: {calculatedOverall})</span>}</label>
                  <input type="number" value={calcMode ? calculatedOverall : (isInventory ? form.overall : form.baseOverall)} onChange={e => {
                    const val = Number(e.target.value);
                    if (!isInventory) setForm({ ...form, baseOverall: val });
                    else setForm({ ...form, overall: val });
                  }} className={`${inputCls} text-center text-lg font-bold tabular-nums`} min={0} max={isInventory && form.allowOverallOverride ? 999 : 99} disabled={calcMode} />
                  {isInventory && !calcMode && <div className="mt-1 text-[10px] text-[var(--muted)]">O OVR digitado será salvo como informado; confira a faixa típica da raridade.</div>}
                </div>
              </div>
              {isInventory && (
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--border)] bg-[#FAFAFB] p-3.5">
                  <input
                    type="checkbox"
                    checked={form.allowOverallOverride}
                    disabled={calcMode}
                    onChange={event => setForm(prev => ({ ...prev, allowOverallOverride: event.target.checked }))}
                    className="size-4 accent-[var(--red)]"
                  />
                  <span>
                    <span className="block text-sm font-medium text-[var(--text)]">Permitir OVR acima de 99</span>
                    <span className="block text-xs text-[var(--muted)]">Na carta criada diretamente no inventário, permite OVR manual de até 999. Os atributos continuam limitados a 99.</span>
                  </span>
                </label>
              )}
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--border)] bg-[#FAFAFB] p-3.5">
                <input
                  type="checkbox"
                  checked={form.calcOverall}
                  onChange={e => {
                    const calcOverall = e.target.checked;
                    setForm(prev => ({
                      ...prev,
                      calcOverall,
                      ...(calcOverall ? { allowOverallOverride: false } : {}),
                      ...(calcOverall && !isSecret ? { rarity: 'uncommon', baseRarity: 'uncommon' } : {}),
                    }));
                  }}
                  className="size-4 accent-[var(--red)]"
                />
                <span>
                  <span className="block text-sm font-medium text-[var(--text)]">Calcular OVR automaticamente</span>
                  <span className="block text-xs text-[var(--muted)]">{isSecret ? 'A carta secreta usa multiplicador de atributos 1× e não recebe bônus de raridade.' : isInventory ? 'O overall será calculado a partir dos atributos × raridade.' : 'O overall base será usado direto nos pacotes.'}</span>
                </span>
              </label>
              {isSecret && (
                <div className="space-y-4 rounded-xl border border-[#343943] bg-[#101217] p-4 text-white">
                  <div>
                    <div className="text-sm font-bold">Chance global e estoque máximo</div>
                    <p className="mt-1 text-xs text-white/70">A chance é aplicada por carta aberta. O servidor controla a emissão e não ultrapassa o estoque total.</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-white/80">Chance por carta (%)</label>
                      <input
                        type="number"
                        min="0.0001"
                        max="5"
                        step="0.0001"
                        value={secretChancePercent}
                        onChange={e => setSecretChancePercent(Number(e.target.value))}
                        className={`${inputCls} border-[#4B515D]`}
                        style={{ backgroundColor: '#1B1E25', borderColor: '#4B515D', color: 'var(--white)', colorScheme: 'dark' }}
                        aria-describedby="secret-chance-help"
                      />
                      <div id="secret-chance-help" className="mt-1 text-xs text-white/60">Entre 0,0001% e 5%, até 4 casas decimais.</div>
                      {secretChancePercent > 0.01 && <div className="mt-1 text-xs font-medium text-amber-300">Chance alta: revise o impacto no estoque antes de salvar.</div>}
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-white/80">Estoque máximo global</label>
                      <input
                        type="number"
                        min={secretSupply[templates.find(template => template.name === editingTemplate)?.dbId ?? '']?.minted ?? 1}
                        step="1"
                        value={secretMaxSupply}
                        onChange={e => setSecretMaxSupply(Number(e.target.value))}
                        className={`${inputCls} border-[#4B515D]`}
                        style={{ backgroundColor: '#1B1E25', borderColor: '#4B515D', color: 'var(--white)', colorScheme: 'dark' }}
                        aria-describedby="secret-supply-help"
                      />
                      <div id="secret-supply-help" className="mt-1 text-xs text-white/60">
                        {editingTemplate
                          ? `Já emitidas: ${secretSupply[templates.find(template => template.name === editingTemplate)?.dbId ?? '']?.minted ?? '—'}. O limite não pode ser reduzido abaixo desse total.`
                          : 'Quantidade total que poderá ser emitida para todos os jogadores.'}
                      </div>
                    </div>
                  </div>
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Chance e custo estimado por pacote</h3>
                    <SecretCardOddsTable chancePercent={secretChancePercent} position={form.position as Position} />
                  </div>
                </div>
              )}
              {isOffSale && (
                <div className="rounded-xl border border-[var(--border)] bg-[#FAFAFB] p-3.5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium text-[var(--text)]">Estatísticas extras</div>
                      <div className="text-xs text-[var(--muted)]">Aparecem nos atributos da carta, mas não alteram OVR nem evolução.</div>
                    </div>
                    <button
                      type="button"
                      disabled={extraStats.length >= 10}
                      onClick={() => setExtraStats(stats => [...stats, { label: '', value: 50 }])}
                      className="px-3 py-2 rounded-lg bg-white border border-[var(--border)] text-xs font-semibold text-[var(--text)] disabled:opacity-50"
                    >
                      Adicionar estatística
                    </button>
                  </div>
                  {extraStats.map((stat, index) => (
                    <div key={index} className="grid grid-cols-[minmax(0,1fr)_88px_40px] gap-2">
                      <input
                        value={stat.label}
                        maxLength={30}
                        aria-label={`Nome da estatística extra ${index + 1}`}
                        onChange={e => setExtraStats(stats => stats.map((item, i) => i === index ? { ...item, label: e.target.value } : item))}
                        className={`${inputCls} h-10`}
                        placeholder="Ex: Sorte"
                      />
                      <input
                        type="number"
                        value={stat.value}
                        min={0}
                        max={999}
                        aria-label={`Valor da estatística extra ${index + 1}`}
                        onChange={e => setExtraStats(stats => stats.map((item, i) => i === index ? { ...item, value: Number(e.target.value) } : item))}
                        className={`${inputCls} h-10 text-center`}
                      />
                      <button
                        type="button"
                        aria-label={`Remover estatística extra ${index + 1}`}
                        onClick={() => setExtraStats(stats => stats.filter((_, i) => i !== index))}
                        className="grid place-items-center rounded-lg border border-[var(--border)] bg-white text-[var(--muted)] hover:text-[var(--red)]"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="text-[10px] text-[var(--muted)]">Todas as cartas são da temporada {DEFAULT_EDITION}.</div>
            </section>

            <button
              onClick={handleCreate}
              disabled={creating || !form.name.trim() || !form.club.trim() || (!editingTemplate && teams.length === 0)}
              className="w-full py-3 rounded-xl bg-[var(--red)] text-white font-bold disabled:opacity-60"
            >
              {creating ? 'Salvando...' : editingTemplate ? 'Salvar alterações' : isSecret ? 'Adicionar Carta Secreta' : isInventory ? 'Criar no Inventário' : isOffSale ? 'Adicionar somente ao Pacote Off-Sale' : 'Adicionar aos Pacotes'}
            </button>
          </div>

          <div className="flex flex-col items-center justify-start gap-4 rounded-2xl border border-[var(--border)] bg-white p-4 md:p-5 xl:sticky xl:top-6">
            <h2 className="text-lg font-semibold text-[var(--text)]">Prévia</h2>
            <div className="w-full max-w-[15rem]">
              <Card card={makePreviewCard(rarityToUse)} size="fluid" />
            </div>
            <div className="text-xs text-[var(--muted)] text-center">
              {RARITY_LABELS[rarityToUse]} · OVR {makePreviewCard(rarityToUse).overall}
            </div>
          </div>
        </div>

        <div className="card-surface p-4 space-y-4">
          <h2 className="text-lg font-semibold text-[var(--text)]">Editar templates das cartas</h2>
          <div className="text-xs text-[var(--muted)]">Os atributos e o overall base dos templates são sincronizados no banco e refletidos nos pacotes.</div>
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {templates.map(t => {
              const supply = t.dbId ? secretSupply[t.dbId] : undefined;
              return (
              <div key={t.name} className="p-3 bg-[var(--bg)] rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-[var(--text)]">{t.name}</div>
                    <div className="text-xs text-[var(--muted)]">
                      {t.position} · {t.club} · OVR {t.baseOverall ?? calculateOverall(t)}
                      {t.packGroup === 'off_sale' && <span className="ml-2 font-semibold text-[var(--red)]">Off-Sale</span>}
                      {t.packGroup === 'secret' && <span className="ml-2 rounded-full bg-[#111318] px-2 py-0.5 font-semibold text-white">Secreta</span>}
                      {t.packGroup === 'secret' && supply && <span className="ml-2">Emitidas {supply.minted}/{supply.maxSupply}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => editingTemplate === t.name ? cancelTemplateEdit() : startEditingTemplate(t)}
                    disabled={t.packGroup === 'secret' && !secretSupplyLoaded}
                    className="px-3 py-1.5 rounded-xl bg-[var(--border)] text-[var(--text)] text-xs font-bold hover:bg-[var(--red)] hover:text-white transition disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {editingTemplate === t.name ? 'Cancelar' : 'Editar'}
                  </button>
                </div>
                {t.packGroup === 'secret' && (
                  <details className="rounded-lg border border-[#E2E4EA] bg-white p-3">
                    <summary className="cursor-pointer text-xs font-semibold text-[var(--text)]">
                      {supply
                        ? `Chance ${(supply.dropChance * 100).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}% por carta · ver odds por pacote`
                        : 'Configuração de chance e estoque não carregada'}
                    </summary>
                    {supply && <div className="mt-3"><SecretCardOddsTable chancePercent={supply.dropChance * 100} position={t.position} /></div>}
                  </details>
                )}
              </div>
              );
            })}
          </div>
        </div>
          </>
        )}
      </div>
    </>
  );
}