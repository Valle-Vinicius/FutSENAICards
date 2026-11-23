import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeftRight, Award, Star, Zap } from 'lucide-react';
import { useGame } from '../store/useGame';
import { toast } from '../store/toast';
import Card from '../components/Card';
import { RARITY_META } from '../types';
import type { UpgradeAttr } from '../types';
import assuncaoPhoto from '../imagens/fotosdetalhedascarta/assuncao.png';
import eduardoPhoto from '../imagens/fotosdetalhedascarta/eduardo.png';
import enzoAntonioPhoto from '../imagens/fotosdetalhedascarta/enzoantonio.png';
import enzoThomasPhoto from '../imagens/fotosdetalhedascarta/enzothomas.png';
import gabrielPhoto from '../imagens/fotosdetalhedascarta/gabriel.png';
import muzyPhoto from '../imagens/fotosdetalhedascarta/gustavomuzy.png';
import heitorPhoto from '../imagens/fotosdetalhedascarta/heitor.png';
import joaoMarcosPhoto from '../imagens/fotosdetalhedascarta/joaomarcos.png';
import jonasPhoto from '../imagens/fotosdetalhedascarta/jonas.png';
import matheusLopesPhoto from '../imagens/fotosdetalhedascarta/matheuslopes.png';
import monteiroPhoto from '../imagens/fotosdetalhedascarta/monteiro.png';
import pietroPhoto from '../imagens/fotosdetalhedascarta/pietro.png';
import rafaelDutraPhoto from '../imagens/fotosdetalhedascarta/rafaeldutra.png';
import rafinhaPhoto from '../imagens/fotosdetalhedascarta/rafaelteixeira.png';
import ricardoPhoto from '../imagens/fotosdetalhedascarta/ricardo.png';
import thiagoPhoto from '../imagens/fotosdetalhedascarta/thiago.png';

const DETAIL_PHOTOS: Record<string, string> = {
  'Pietro Guedes': pietroPhoto,
  Muzy: muzyPhoto,
  'Matheus Lopes': matheusLopesPhoto,
  'Thiago Tavares': thiagoPhoto,
  'João Marcos': joaoMarcosPhoto,
  'Rafael Dutra': rafaelDutraPhoto,
  'Vinícius Assunção': assuncaoPhoto,
  'Enzo Thomas': enzoThomasPhoto,
  'Heitor Barbosa': heitorPhoto,
  'Gabriel Ortelan': gabrielPhoto,
  'Jonas Daniel': jonasPhoto,
  Rafinha: rafinhaPhoto,
  Monteiro: monteiroPhoto,
  Eduardo: eduardoPhoto,
  'Enzo Antonio': enzoAntonioPhoto,
  Ricardo: ricardoPhoto,
};

function positionName(position: string) {
  if (position === 'Pivo') return 'Pivô';
  if (position === 'GK') return 'Goleiro';
  return position;
}

export default function CardDetail() {
  const { uid } = useParams();
  const navigate = useNavigate();
  const cards = useGame(s => s.cards);
  const markSeen = useGame(s => s.markSeen);
  const toggleFav = useGame(s => s.toggleFavorite);
  const upgradePlayer = useGame(s => s.upgradePlayer);
  const card = cards.find(c => c.uid === uid);

  useEffect(() => {
    document.title = `${card?.name ?? 'Carta'} | FutSENAI Cards`;
  }, [card?.name]);
  useEffect(() => {
    if (card?.isNew) markSeen([card.uid]);
  }, [card?.uid, card?.isNew, markSeen]);

  if (!card) {
    return (
      <div className="card-detail-missing">
        <p>Carta não encontrada.</p>
        <button type="button" onClick={() => navigate('/collection')}>Voltar à coleção</button>
      </div>
    );
  }

  const isGK = card.position === 'GK';
  const attrs: { label: string; value: number }[] = isGK
    ? [
        { label: 'Reflexos', value: card.reflexes ?? 0 },
        { label: 'Posicionamento', value: card.positioning ?? 0 },
        { label: 'Manuseio', value: card.handling ?? 0 },
        { label: 'Velocidade', value: card.pace },
        { label: 'Defesa', value: card.defending },
        { label: 'Físico', value: card.physical },
      ]
    : [
        { label: 'Velocidade', value: card.pace },
        { label: 'Chute', value: card.shooting },
        { label: 'Passe', value: card.passing },
        { label: 'Drible', value: card.dribbling },
        { label: 'Defesa', value: card.defending },
        { label: 'Físico', value: card.physical },
      ];
  attrs.push(...(card.extraStats ?? []));

  const upgradable: { key: UpgradeAttr; label: string; value: number }[] = isGK
    ? [
        { key: 'reflexes', label: 'Reflexos', value: card.reflexes ?? 0 },
        { key: 'positioning', label: 'Posicionamento', value: card.positioning ?? 0 },
        { key: 'handling', label: 'Manuseio', value: card.handling ?? 0 },
        { key: 'pace', label: 'Velocidade', value: card.pace },
        { key: 'defending', label: 'Defesa', value: card.defending },
        { key: 'physical', label: 'Físico', value: card.physical },
      ]
    : [
        { key: 'pace', label: 'Velocidade', value: card.pace },
        { key: 'shooting', label: 'Chute', value: card.shooting },
        { key: 'passing', label: 'Passe', value: card.passing },
        { key: 'dribbling', label: 'Drible', value: card.dribbling },
        { key: 'defending', label: 'Defesa', value: card.defending },
        { key: 'physical', label: 'Físico', value: card.physical },
      ];
  const [firstName, ...nameRemainder] = card.name.trim().split(/\s+/);
  const lastName = nameRemainder.join(' ') || firstName;
  const upgradesUsed = Object.values(card.upgrades ?? {}).reduce((total, count) => total + (count ?? 0), 0);
  const xpProgress = (card.xp ?? 0) % 100;
  const rarity = RARITY_META[card.rarity] ?? RARITY_META.common;
  const portrait = DETAIL_PHOTOS[card.name] || card.photo || card.image;

  return (
    <div className="card-detail-page">
      <div className="home-container">
        <section className={`card-detail-hero${card.rarity === 'icon' ? ' card-detail-hero--icon' : ''}`} aria-labelledby="card-detail-name">
          <div className="card-detail-hero__copy">
            <div className="card-detail-hero__eyebrow"><span /> PERFIL DO ATLETA</div>
            <h1 className="card-detail-hero__name" id="card-detail-name">
              <span>{firstName}</span>
              <strong>{lastName}</strong>
            </h1>
            <p className="card-detail-hero__summary">
              {positionName(card.position)} <i>·</i> {card.nationality} <i>·</i> {card.club}
            </p>
            <div className="card-detail-hero__actions">
              <button
                type="button"
                onClick={() => navigate(`/compare?a=${encodeURIComponent(card.uid)}`)}
                className="card-detail-compare"
              >
                <ArrowLeftRight aria-hidden="true" /> Comparar
              </button>
              <button
                type="button"
                onClick={() => toggleFav(card.uid)}
                className={`card-detail-favorite${card.favorite ? ' is-favorite' : ''}`}
                aria-label={card.favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                aria-pressed={card.favorite}
              >
                <Star aria-hidden="true" fill={card.favorite ? 'currentColor' : 'none'} />
              </button>
              <button type="button" onClick={() => navigate('/collection')} className="card-detail-back">
                Voltar à coleção
              </button>
            </div>
            <dl className="card-detail-facts">
              <Fact label="Posição" value={positionName(card.position)} />
              <Fact label="Clube" value={card.club} />
              <Fact label="Idade" value={String(card.age)} />
              <Fact label="Nacionalidade" value={card.nationality} />
              <div className="card-detail-fact card-detail-fact--rarity">
                <dt>Raridade</dt>
                <dd style={{ color: rarity.color }}>
                  {card.rarity === 'icon' && <Award aria-hidden="true" />}
                  {rarity.label}
                </dd>
              </div>
              <Fact label="Edição" value={card.edition} />
            </dl>
          </div>

          <div className="card-detail-hero__visual" aria-label={`Overall ${card.overall}`}>
            <div className="card-detail-hero__number" aria-hidden="true">FUT<br />SENAI</div>
            <div className="card-detail-hero__portrait-backdrop" />
            {portrait && <img className="card-detail-hero__portrait" src={portrait} alt={card.name} />}
            <div className={`card-detail-overall${card.rarity === 'icon' ? ' card-detail-overall--icon' : ''}`}>
              <span>OVERALL</span>
              <strong>{card.overall}</strong>
              {card.rarity === 'icon' && <small><Award aria-hidden="true" /> ÍCONE</small>}
            </div>
            <span className="card-detail-hero__edition">{card.edition}</span>
          </div>
        </section>

        <section className="card-detail-attributes" aria-labelledby="card-detail-attributes-title">
          <div className="card-detail-section-heading">
            <div>
              <span className="card-detail-kicker">DESEMPENHO</span>
              <h2 id="card-detail-attributes-title">Atributos</h2>
            </div>
            <span className="card-detail-section-index">01 / CAMPO</span>
          </div>
          <div className="card-detail-attribute-grid">
            {attrs.map(({ label, value }) => (
              <div className="card-detail-attribute" key={label}>
                <div className="card-detail-attribute__top">
                  <span>{label}</span>
                  <strong className={value >= 100 ? 'rgb-text' : ''}>{value}</strong>
                </div>
                <div className="card-detail-attribute__track">
                  <div
                    className={`card-detail-attribute__fill${value >= 100 || card.rarity === 'icon' ? ' is-icon rgb-stat' : ''}${card.rarity === 'secret' ? ' is-secret' : ''}`}
                    style={{ width: `${Math.min(100, value)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="card-detail-lower-grid">
          <section className="card-detail-panel card-detail-evolution" aria-labelledby="card-detail-evolution-title">
            <SectionHeading kicker="PROGRESSO" title="Evolução" id="card-detail-evolution-title" />
            <div className="card-detail-evolution__stats">
              <Metric label="XP" value={String(card.xp ?? 0)} />
              <Metric label="Pontos de evolução" value={String(card.evoPoints ?? 0)} />
              <Metric label="Overall atual" value={String(card.overall)} />
              <Metric label="Overall máximo" value="99" />
              <Metric label="Melhorias usadas" value={`${upgradesUsed} / 15`} />
              <Metric label="Melhorias disponíveis" value={String(Math.max(0, 15 - upgradesUsed))} />
            </div>
            <div className="card-detail-xp">
              <div className="card-detail-xp__label"><span>PROGRESSO DE XP</span><strong>{xpProgress}%</strong></div>
              <div className="card-detail-xp__track"><span style={{ width: `${xpProgress}%` }} /></div>
            </div>
            <div className="card-detail-upgrades">
              {upgradable.map(attribute => (
                <button
                  type="button"
                  key={attribute.key}
                  disabled={(card.evoPoints ?? 0) <= 0 || attribute.value >= 99}
                  onClick={() => {
                    const ok = upgradePlayer(card.uid, attribute.key);
                    if (!ok) toast.error('Sem pontos ou limite atingido.');
                  }}
                  aria-label={`Evoluir ${attribute.label}, valor atual ${attribute.value}`}
                >
                  <span>{attribute.label}</span>
                  <strong>{attribute.value}<b>+</b></strong>
                </button>
              ))}
            </div>
            <p className="card-detail-note">Limite total de 15 melhorias por carta e +10 por atributo. Overall máximo 99.</p>
          </section>

          <section className="card-detail-panel card-detail-season" aria-labelledby="card-detail-season-title">
            <SectionHeading kicker="NÚMEROS EM QUADRA" title="Estatísticas da temporada" id="card-detail-season-title" />
            {card.seasonStats ? (
              <div className="card-detail-season__stats">
                <Metric label="Partidas" value={String(card.seasonStats.matches)} />
                <Metric label="Gols" value={String(card.seasonStats.goals)} />
                <Metric label="Assistências" value={String(card.seasonStats.assists)} />
              </div>
            ) : (
              <p className="card-detail-empty">Sem estatísticas registradas.</p>
            )}
          </section>

          <section className="card-detail-panel card-detail-history" aria-labelledby="card-detail-history-title">
            <SectionHeading kicker="TRAJETÓRIA" title="Histórico de evolução" id="card-detail-history-title" />
            {(card.evolutionLog ?? []).length === 0 ? (
              <p className="card-detail-empty">Nenhuma evolução realizada.</p>
            ) : (
              <ol className="card-detail-history__list">
                {[...(card.evolutionLog ?? [])].reverse().map((entry, index) => (
                  <li key={`${entry.at}-${index}`}>
                    <span><Zap aria-hidden="true" /> +1 {entry.attr}</span>
                    <time dateTime={new Date(entry.at).toISOString()}>{new Date(entry.at).toLocaleString('pt-BR')}</time>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="card-detail-panel card-detail-collection" aria-labelledby="card-detail-collection-title">
            <SectionHeading kicker="COLEÇÃO" title="Carta do atleta" id="card-detail-collection-title" />
            <div className="card-detail-collection__card">
              <Card card={card} size="sm" animateHover={false} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-detail-fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function SectionHeading({ kicker, title, id }: { kicker: string; title: string; id: string }) {
  return (
    <div className="card-detail-section-heading card-detail-section-heading--compact">
      <div>
        <span className="card-detail-kicker">{kicker}</span>
        <h2 id={id}>{title}</h2>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-detail-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
