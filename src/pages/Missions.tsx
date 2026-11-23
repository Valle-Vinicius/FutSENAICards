import { useEffect, useId, useMemo, useState, type CSSProperties } from 'react';
import {
  Award,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Coins,
  CreditCard,
  Crown,
  Flame,
  LockKeyhole,
  Medal,
  Package,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Trophy,
  Users,
  X,
  Zap,
} from 'lucide-react';
import type { Achievement, Mission, Transaction } from '../types';
import { XP_PER_LEVEL } from '../lib/game';
import { useGame } from '../store/useGame';
import { toast } from '../store/toast';
import './Missions.css';

type MissionCategoryKey = 'all' | 'collection' | 'packs' | 'squad' | 'special';

const CATEGORY_LABELS: Record<Exclude<MissionCategoryKey, 'all'>, string> = {
  collection: 'Coleção',
  packs: 'Pacotes',
  squad: 'Elenco',
  special: 'Especiais',
};

function getMissionCategory(mission: Mission): Exclude<MissionCategoryKey, 'all'> {
  if (mission.special || mission.type === 'daily_login') return 'special';
  if (mission.type === 'collect' || mission.type === 'rarity') return 'collection';
  if (mission.type === 'open_packs') return 'packs';
  return 'squad';
}

function getCategoryIcon(category: MissionCategoryKey) {
  switch (category) {
    case 'collection': return <CreditCard aria-hidden="true" />;
    case 'packs': return <Package aria-hidden="true" />;
    case 'squad': return <Users aria-hidden="true" />;
    case 'special': return <Flame aria-hidden="true" />;
    default: return <Target aria-hidden="true" />;
  }
}

function getAchievementIcon(id: string) {
  switch (id) {
    case 'a1': return <CreditCard aria-hidden="true" />;
    case 'a2': return <Award aria-hidden="true" />;
    case 'a3': return <Coins aria-hidden="true" />;
    case 'a4': return <ShieldCheck aria-hidden="true" />;
    case 'a5': return <Star aria-hidden="true" />;
    case 'a6': return <Crown aria-hidden="true" />;
    default: return <Medal aria-hidden="true" />;
  }
}

function getMissionProgress(mission: Mission) {
  const target = Math.max(0, mission.target);
  const progress = Math.min(target, Math.max(0, mission.progress));
  const percentage = target === 0 ? (mission.completed ? 100 : 0) : (progress / target) * 100;
  return { target, progress, percentage };
}

function formatUnlockDate(unlockedAt?: number) {
  if (unlockedAt === undefined || !Number.isFinite(unlockedAt) || unlockedAt <= 0) return null;
  return new Date(unlockedAt).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatRewardDate(at: number) {
  if (!Number.isFinite(at) || at <= 0) return null;
  return new Date(at).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  });
}

function MissionProgressBar({ percentage, claimed = false }: { percentage: number; claimed?: boolean }) {
  return (
    <div
      className={`mission-progress-track ${claimed ? 'is-claimed' : ''}`}
      role="progressbar"
      aria-valuenow={Math.round(percentage)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${percentage}%` }} />
    </div>
  );
}

function AchievementEmblem({
  achievement,
  small = false,
}: {
  achievement: Achievement;
  small?: boolean;
}) {
  return (
    <span
      className={`achievement-emblem ${achievement.unlocked ? 'is-unlocked' : 'is-locked'} ${small ? 'is-small' : ''}`}
      data-emblem={achievement.id}
      aria-hidden="true"
    >
      <span className="achievement-emblem__outer">
        <span className="achievement-emblem__inner">{getAchievementIcon(achievement.id)}</span>
      </span>
      {achievement.unlocked && <Check className="achievement-emblem__check" aria-hidden="true" />}
      {!achievement.unlocked && <LockKeyhole className="achievement-emblem__lock" aria-hidden="true" />}
    </span>
  );
}

export default function Missions() {
  const missions = useGame(state => state.missions);
  const achievements = useGame(state => state.achievements);
  const level = useGame(state => state.level);
  const xp = useGame(state => state.xp);
  const coins = useGame(state => state.coins);
  const transactions = useGame(state => state.transactions);
  const claim = useGame(state => state.claimMission);
  const update = useGame(state => state.updateMissionProgress);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<MissionCategoryKey>('all');
  const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null);
  const [recentlyClaimedId, setRecentlyClaimedId] = useState<string | null>(null);
  const dialogTitleId = useId();

  useEffect(() => {
    update();
  }, [update]);

  useEffect(() => {
    if (!selectedAchievement) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedAchievement(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedAchievement]);

  useEffect(() => {
    if (!recentlyClaimedId) return;
    const timer = window.setTimeout(() => setRecentlyClaimedId(null), 900);
    return () => window.clearTimeout(timer);
  }, [recentlyClaimedId]);

  const categories = useMemo(() => {
    const counts = new Map<Exclude<MissionCategoryKey, 'all'>, number>();
    for (const mission of missions) {
      const category = getMissionCategory(mission);
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    return (Object.keys(CATEGORY_LABELS) as Exclude<MissionCategoryKey, 'all'>[])
      .filter(category => counts.has(category))
      .map(category => ({ key: category, label: CATEGORY_LABELS[category], count: counts.get(category) ?? 0 }));
  }, [missions]);

  const filteredMissions = useMemo(
    () => missions.filter(mission => activeCategory === 'all' || getMissionCategory(mission) === activeCategory),
    [missions, activeCategory],
  );
  const completedMissions = missions.filter(mission => mission.completed).length;
  const unlockedAchievements = achievements.filter(achievement => achievement.unlocked).length;
  const claimableMissions = missions.filter(mission => mission.completed && !mission.claimed);
  const featuredMission = claimableMissions[0];
  const recentAchievement = achievements
    .filter(achievement => achievement.unlocked)
    .sort((a, b) => (b.unlockedAt ?? 0) - (a.unlockedAt ?? 0))[0];
  const recentMissionRewards = transactions
    .filter(transaction => transaction.type === 'earn' && transaction.reason.startsWith('Missão:'))
    .slice(0, 3);

  const levelStartXp = Math.max(0, (level - 1) * XP_PER_LEVEL);
  const nextLevelXp = level * XP_PER_LEVEL;
  const levelProgressXp = Math.min(XP_PER_LEVEL, Math.max(0, xp - levelStartXp));
  const xpNeeded = Math.max(0, nextLevelXp - xp);
  const levelProgress = Math.min(100, (levelProgressXp / XP_PER_LEVEL) * 100);

  const handleClaim = async (mission: Mission) => {
    if (claimingId) return;
    setClaimingId(mission.id);
    try {
      if (await claim(mission.id)) {
        setRecentlyClaimedId(mission.id);
        toast.success('Recompensa da missão resgatada.');
      }
    } catch (error) {
      console.error('[missions] claim request failed:', error);
      toast.error(error instanceof Error ? error.message : 'Não foi possível resgatar a missão.');
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <div className="missions-page">
      <header className="missions-page__header">
        <div>
          <span>FUTSENAI · PROGRESSÃO DO CLUBE</span>
          <h1>MISSÕES <i>&</i> CONQUISTAS</h1>
          <p>Construa sua trajetória, complete objetivos e registre suas conquistas.</p>
        </div>
        <div className="missions-page__header-mark" aria-hidden="true">
          <Trophy />
          <span>FUT</span>
        </div>
      </header>

      <section className="journey-panel" aria-labelledby="journey-title">
        <div className="journey-panel__topline">
          <div className="journey-panel__eyebrow"><span /> PROGRESSÃO DO JOGADOR</div>
          <span className="journey-panel__season">SUA JORNADA</span>
        </div>

        <div className="journey-panel__main">
          <div className="journey-level">
            <div className="journey-level__seal" aria-hidden="true">
              <span>NÍVEL</span>
              <strong>{level}</strong>
            </div>
            <div className="journey-level__copy">
              <span>SEU NÍVEL ATUAL</span>
              <h2 id="journey-title">SUA JORNADA</h2>
              <p>{xp.toLocaleString('pt-BR')} XP acumulados</p>
            </div>
          </div>

          <div className="journey-xp">
            <div className="journey-xp__labels">
              <span>PROGRESSO PARA O NÍVEL {level + 1}</span>
              <strong>{levelProgressXp.toLocaleString('pt-BR')} <small>/ {XP_PER_LEVEL.toLocaleString('pt-BR')} XP</small></strong>
            </div>
            <div
              className="journey-xp__track"
              role="progressbar"
              aria-label={`Progresso para o nível ${level + 1}`}
              aria-valuenow={Math.round(levelProgress)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style={{ width: `${levelProgress}%` }} />
            </div>
            <div className="journey-xp__foot">
              <span>NÍVEL {level}</span>
              <span>{xpNeeded.toLocaleString('pt-BR')} XP para subir</span>
              <span>NÍVEL {level + 1}</span>
            </div>
          </div>
        </div>

        <div className="journey-stats" aria-label="Resumo da progressão">
          <div className="journey-stat journey-stat--coins">
            <span className="journey-stat__icon"><Coins aria-hidden="true" /></span>
            <span><small>SALDO ATUAL</small><strong>{coins.toLocaleString('pt-BR')}</strong><em>moedas</em></span>
          </div>
          <div className="journey-stat">
            <span className="journey-stat__icon"><Target aria-hidden="true" /></span>
            <span><small>OBJETIVOS CONCLUÍDOS</small><strong>{completedMissions}<em> / {missions.length}</em></strong></span>
          </div>
          <div className="journey-stat">
            <span className="journey-stat__icon"><Medal aria-hidden="true" /></span>
            <span><small>CONQUISTAS</small><strong>{unlockedAchievements}<em> / {achievements.length}</em></strong></span>
          </div>
        </div>
      </section>

      <section className="journey-highlights" aria-label="Destaques da sua jornada">
        {featuredMission ? (
          <article className="journey-highlight journey-highlight--claim">
            <div className="journey-highlight__icon"><Coins aria-hidden="true" /></div>
            <div className="journey-highlight__copy">
              <span>RECOMPENSA PRONTA PARA RESGATE</span>
              <strong>{featuredMission.title}</strong>
              <small>+{featuredMission.reward.toLocaleString('pt-BR')} moedas · +{featuredMission.rewardXp.toLocaleString('pt-BR')} XP</small>
            </div>
            <button
              type="button"
              onClick={() => void handleClaim(featuredMission)}
              disabled={claimingId !== null}
              aria-label={`Resgatar recompensa de ${featuredMission.title}`}
            >
              {claimingId === featuredMission.id ? 'RESGATANDO...' : 'RESGATAR'}
              <ChevronRight aria-hidden="true" />
            </button>
          </article>
        ) : (
          <article className="journey-highlight journey-highlight--quiet">
            <div className="journey-highlight__icon"><Target aria-hidden="true" /></div>
            <div className="journey-highlight__copy">
              <span>OBJETIVOS</span>
              <strong>Nenhuma recompensa pendente</strong>
              <small>Continue sua jornada para desbloquear novos resgates.</small>
            </div>
          </article>
        )}

        {recentAchievement ? (
          <button
            type="button"
            className="journey-highlight journey-highlight--achievement"
            onClick={() => setSelectedAchievement(recentAchievement)}
            aria-label={`Ver conquista recente: ${recentAchievement.title}`}
          >
            <AchievementEmblem achievement={recentAchievement} small />
            <span className="journey-highlight__copy">
              <span>CONQUISTA DESBLOQUEADA</span>
              <strong>{recentAchievement.title}</strong>
              <small>{formatUnlockDate(recentAchievement.unlockedAt) ?? 'Conquista registrada'}</small>
            </span>
            <ChevronRight aria-hidden="true" />
          </button>
        ) : (
          <article className="journey-highlight journey-highlight--quiet journey-highlight--locked">
            <div className="journey-highlight__icon"><LockKeyhole aria-hidden="true" /></div>
            <div className="journey-highlight__copy">
              <span>PRÓXIMO DESTAQUE</span>
              <strong>Suas conquistas começam aqui</strong>
              <small>Complete objetivos para desbloquear distintivos.</small>
            </div>
          </article>
        )}
      </section>

      <section className="objectives-section" aria-labelledby="objectives-title">
        <div className="missions-section-heading">
          <div>
            <div className="missions-section-kicker"><span>01</span> OBJETIVOS DO CLUBE</div>
            <h2 id="objectives-title">OBJETIVOS</h2>
            <p>Missões ativas, progresso real e recompensas para resgatar.</p>
          </div>
          <span className="missions-section-heading__count">{missions.length} MISSÕES</span>
        </div>

        <div className="mission-category-tabs" role="tablist" aria-label="Filtrar missões por categoria">
          <button
            type="button"
            role="tab"
            id="mission-tab-all"
            aria-controls="mission-panel"
            aria-selected={activeCategory === 'all'}
            onClick={() => setActiveCategory('all')}
          >
            <Target aria-hidden="true" />Todas<span>{missions.length}</span>
          </button>
          {categories.map(category => {
            const categoryMissions = missions.filter(mission => getMissionCategory(mission) === category.key);
            const completeCount = categoryMissions.filter(mission => mission.completed).length;
            return (
              <button
                key={category.key}
                type="button"
                role="tab"
                id={`mission-tab-${category.key}`}
                aria-controls="mission-panel"
                aria-selected={activeCategory === category.key}
                onClick={() => setActiveCategory(category.key)}
              >
                {getCategoryIcon(category.key)}{category.label}
                <span>{completeCount}/{category.count}</span>
              </button>
            );
          })}
        </div>

        <div
          id="mission-panel"
          role="tabpanel"
          aria-labelledby={`mission-tab-${activeCategory}`}
        >
          {filteredMissions.length > 0 ? (
            <div className="mission-grid">
              {filteredMissions.map((mission, index) => {
                const { progress, target, percentage } = getMissionProgress(mission);
                const category = getMissionCategory(mission);
                const isClaimable = mission.completed && !mission.claimed;
                const justClaimed = recentlyClaimedId === mission.id && mission.claimed;
                const missionStatus = mission.claimed ? 'RESGATADA' : isClaimable ? 'RECOMPENSA DISPONÍVEL' : mission.completed ? 'CONCLUÍDA' : 'EM ANDAMENTO';
                return (
                  <article
                    key={mission.id}
                    id={`mission-${mission.id}`}
                    className={`mission-card ${isClaimable ? 'is-claimable' : ''} ${mission.claimed ? 'is-claimed' : ''} ${mission.special ? 'is-special' : ''} ${justClaimed ? 'just-claimed' : ''}`}
                    style={{ '--mission-index': index } as CSSProperties}
                  >
                    <div className="mission-card__rail">
                      <span className="mission-card__index">{String(index + 1).padStart(2, '0')}</span>
                      <span className={`mission-card__type mission-card__type--${category}`}>{getCategoryIcon(category)}</span>
                    </div>
                    <div className="mission-card__body">
                      <div className="mission-card__topline">
                        <span>{CATEGORY_LABELS[category].toUpperCase()}</span>
                        {mission.special && <span className="mission-card__special"><Sparkles aria-hidden="true" /> ESPECIAL</span>}
                      </div>
                      <h3>{mission.title}</h3>
                      <p>{mission.description}</p>
                      <div className="mission-card__progress-copy">
                        <span>{mission.completed ? 'OBJETIVO CONCLUÍDO' : 'PROGRESSO DO OBJETIVO'}</span>
                        <strong>{progress}<small> / {target}</small></strong>
                      </div>
                      <MissionProgressBar percentage={percentage} claimed={mission.claimed} />
                      <div className="mission-card__footer">
                        <div className="mission-reward">
                          <span className="mission-reward__coin"><Coins aria-hidden="true" /></span>
                          <span><strong>+{mission.reward.toLocaleString('pt-BR')}</strong><small>MOEDAS</small></span>
                          <i />
                          <span className="mission-reward__xp"><Zap aria-hidden="true" /></span>
                          <span><strong>+{mission.rewardXp.toLocaleString('pt-BR')}</strong><small>XP</small></span>
                        </div>
                        {isClaimable ? (
                          <button
                            type="button"
                            className="mission-claim-button"
                            onClick={() => void handleClaim(mission)}
                            disabled={claimingId !== null}
                            aria-label={`Resgatar recompensa de ${mission.title}`}
                          >
                            {claimingId === mission.id ? 'RESGATANDO...' : 'RESGATAR'}
                            <ChevronRight aria-hidden="true" />
                          </button>
                        ) : (
                          <span className={`mission-card__status ${mission.claimed ? 'is-claimed' : mission.completed ? 'is-completed' : ''}`}>
                            {mission.claimed ? <CheckCircle2 aria-hidden="true" /> : mission.completed ? <Check aria-hidden="true" /> : <span className="mission-card__status-dot" />}
                            {missionStatus}
                          </span>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="missions-empty-state">Nenhuma missão nesta categoria no momento.</div>
          )}
        </div>
      </section>

      <section className="rewards-recap" aria-labelledby="rewards-title">
        <div className="missions-section-heading missions-section-heading--compact">
          <div>
            <div className="missions-section-kicker"><span>02</span> HISTÓRICO DE RECOMPENSAS</div>
            <h2 id="rewards-title">RECOMPENSAS RECEBIDAS</h2>
          </div>
          <Coins aria-hidden="true" />
        </div>
        {recentMissionRewards.length > 0 ? (
          <div className="rewards-recap__list">
            {recentMissionRewards.map((transaction: Transaction) => (
              <div key={transaction.id} className="reward-recap-item">
                <span className="reward-recap-item__check"><Check aria-hidden="true" /></span>
                <span className="reward-recap-item__copy">
                  <strong>{transaction.reason.replace(/^Missão:\s*/, '')}</strong>
                  <small>{formatRewardDate(transaction.at) ?? 'Resgate registrado'}</small>
                </span>
                <span className="reward-recap-item__amount">+{transaction.amount.toLocaleString('pt-BR')} <small>MOEDAS</small></span>
              </div>
            ))}
          </div>
        ) : (
          <p className="rewards-recap__empty">As recompensas de missões resgatadas aparecerão aqui.</p>
        )}
      </section>

      <section className="achievements-section" aria-labelledby="achievements-title">
        <div className="achievements-section__header">
          <div>
            <div className="missions-section-kicker"><span>03</span> DISTINTIVOS DA TRAJETÓRIA</div>
            <h2 id="achievements-title">CONQUISTAS</h2>
            <p>Marcos especiais da sua história no FUTSENAI.</p>
          </div>
          <div className="achievements-section__count">
            <span>{String(unlockedAchievements).padStart(2, '0')}</span>
            <small>DE {String(achievements.length).padStart(2, '0')} DESBLOQUEADAS</small>
          </div>
        </div>

        {achievements.length > 0 ? (
          <div className="achievement-gallery">
            {achievements.map(achievement => {
              const unlockedDate = formatUnlockDate(achievement.unlockedAt);
              return (
                <button
                  key={achievement.id}
                  type="button"
                  className={`achievement-card ${achievement.unlocked ? 'is-unlocked' : 'is-locked'}`}
                  onClick={() => setSelectedAchievement(achievement)}
                  aria-label={`${achievement.title}, ${achievement.unlocked ? 'desbloqueada' : 'bloqueada'}. Ver detalhes.`}
                >
                  <span className="achievement-card__plate">
                    <AchievementEmblem achievement={achievement} />
                    <span className="achievement-card__state">
                      {achievement.unlocked ? <CheckCircle2 aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />}
                      {achievement.unlocked ? 'DESBLOQUEADA' : 'BLOQUEADA'}
                    </span>
                  </span>
                  <span className="achievement-card__copy">
                    <strong>{achievement.title}</strong>
                    <small>{achievement.description}</small>
                  </span>
                  <span className="achievement-card__footer">
                    {unlockedDate
                      ? <><CalendarDays aria-hidden="true" /> {unlockedDate}</>
                      : achievement.unlocked
                        ? <><Check aria-hidden="true" /> CONQUISTA REGISTRADA</>
                        : <><LockKeyhole aria-hidden="true" /> CONTINUE SUA JORNADA</>}
                    <ChevronRight aria-hidden="true" />
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="missions-empty-state">Nenhuma conquista disponível no momento.</div>
        )}
      </section>

      {selectedAchievement && (
        <div
          className="achievement-dialog-backdrop"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setSelectedAchievement(null);
          }}
        >
          <section
            className="achievement-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
          >
            <button
              type="button"
              className="achievement-dialog__close"
              onClick={() => setSelectedAchievement(null)}
              aria-label="Fechar detalhes da conquista"
            >
              <X aria-hidden="true" />
            </button>
            <div className="achievement-dialog__art">
              <AchievementEmblem achievement={selectedAchievement} />
            </div>
            <div className="missions-section-kicker">
              <span>FUT</span> {selectedAchievement.unlocked ? 'MARCO DESBLOQUEADO' : 'MARCO A CONQUISTAR'}
            </div>
            <h2 id={dialogTitleId}>{selectedAchievement.title}</h2>
            <p>{selectedAchievement.description}</p>
            <div className={`achievement-dialog__status ${selectedAchievement.unlocked ? 'is-unlocked' : ''}`}>
              {selectedAchievement.unlocked ? <CheckCircle2 aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />}
              {selectedAchievement.unlocked ? 'Conquista desbloqueada' : 'Conquista bloqueada'}
            </div>
            {selectedAchievement.unlocked && formatUnlockDate(selectedAchievement.unlockedAt) && (
              <div className="achievement-dialog__date">
                <CalendarDays aria-hidden="true" />
                Desbloqueada em {formatUnlockDate(selectedAchievement.unlockedAt)}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
