import { useEffect, useId, useState } from 'react';
import { Info } from 'lucide-react';
import { basePositions, type Tactic } from '../engine/match';
import { tacticPreviews } from '../data/tacticPreviews';

type Point = { x: number; y: number };
type PreviewPlayer = Point & {
  baseX: number;
  baseY: number;
  isGoalkeeper: boolean;
  number: number;
};

const CYCLE_DURATION_MS = 6000;
const PHASE_DURATION_MS = CYCLE_DURATION_MS / 3;
const PHASE_LABELS = ['Saída de bola', 'Progressão', 'Finalização / recomposição'] as const;
const BALL_ROUTES: Record<Tactic, readonly [Point, Point, Point]> = {
  balanced: [{ x: 38, y: 25 }, { x: 55, y: 17 }, { x: 72, y: 26 }],
  possession: [{ x: 36, y: 25 }, { x: 45, y: 31 }, { x: 53, y: 24 }],
  highpress: [{ x: 39, y: 25 }, { x: 54, y: 16 }, { x: 69, y: 23 }],
  counter: [{ x: 34, y: 25 }, { x: 67, y: 22 }, { x: 82, y: 18 }],
  compact: [{ x: 35, y: 25 }, { x: 41, y: 29 }, { x: 47, y: 25 }],
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function interpolatePoint(from: Point, to: Point, progress: number): Point {
  const eased = progress * progress * (3 - 2 * progress);
  return {
    x: from.x + (to.x - from.x) * eased,
    y: from.y + (to.y - from.y) * eased,
  };
}

function toCourtPoint(point: Point): Point {
  return { x: point.y, y: 100 - point.x };
}

function getPreviewPlayers(formation: string, side: 'home' | 'away', ball: Point): PreviewPlayer[] {
  const positions = basePositions(formation, side);
  const engineBallY = ball.y * 2;
  const attackDirection = side === 'home' ? 1 : -1;
  const attacking = side === 'home';
  const attackProgress = clamp((ball.x - 50) * attackDirection, -40, 40);
  const forwardShift = attackProgress * (attacking ? 0.24 : 0.1);
  const teamShift = clamp((ball.x - 50) * 0.12, -6, 6);

  return positions.map((position, index) => {
    if (index === 0) {
      return {
        x: position.x,
        y: clamp(50 + (engineBallY - 50) * 0.35, 42, 58) / 2,
        baseX: position.x,
        baseY: position.y / 2,
        isGoalkeeper: true,
        number: index + 1,
      };
    }

    const laneShift = (engineBallY - position.y) * (attacking ? 0.12 : 0.2);
    return {
      x: clamp(position.x + attackDirection * forwardShift + teamShift, 5, 95),
      y: clamp(position.y + laneShift, 5, 95) / 2,
      baseX: position.x,
      baseY: position.y / 2,
      isGoalkeeper: false,
      number: index + 1,
    };
  });
}

export type TacticPreviewProps = {
  tactic: Tactic;
  formation: string;
  reduceMotion?: boolean;
};

export default function TacticPreview({ tactic, formation, reduceMotion = false }: TacticPreviewProps) {
  const [elapsed, setElapsed] = useState(0);
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const copy = tacticPreviews[tactic];

  useEffect(() => {
    if (reduceMotion) return;

    const startedAt = performance.now();
    let frameId = 0;
    const animate = (now: number) => {
      const timeSinceStart = now - startedAt;
      if (Number.isFinite(timeSinceStart)) {
        setElapsed(Math.max(0, timeSinceStart) % CYCLE_DURATION_MS);
      }
      frameId = window.requestAnimationFrame(animate);
    };
    frameId = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frameId);
  }, [reduceMotion, tactic]);

  const phase = reduceMotion ? 2 : Math.floor(elapsed / PHASE_DURATION_MS) % 3;
  const phaseProgress = reduceMotion
    ? 1
    : (elapsed % PHASE_DURATION_MS) / PHASE_DURATION_MS;
  const route = BALL_ROUTES[tactic];
  const horizontalBall = reduceMotion
    ? route[2]
    : interpolatePoint(route[phase], route[(phase + 1) % route.length], phaseProgress);
  const horizontalPassTarget = reduceMotion ? { x: 98, y: 25 } : route[(phase + 1) % route.length];
  const ball = toCourtPoint(horizontalBall);
  const passTarget = toCourtPoint(horizontalPassTarget);
  const homePlayers = getPreviewPlayers(formation, 'home', horizontalBall);
  const awayPlayers = getPreviewPlayers('1-2-1', 'away', horizontalBall);
  const teams = [
    { side: 'away' as const, players: awayPlayers, color: '#173B6B' },
    { side: 'home' as const, players: homePlayers, color: '#E30613' },
  ];

  return (
    <section
      key={tactic}
      className={`match-tactic-preview card-surface mx-auto grid min-h-0 w-full grid-cols-1 items-center content-center gap-4 p-4 md:grid-cols-[minmax(0,2fr)_minmax(0,0.8fr)] md:grid-rows-[minmax(0,1fr)] md:items-stretch md:content-stretch md:gap-8 md:p-6 ${reduceMotion ? '' : 'tactic-preview-fade'}`}
      aria-label={`Prévia da tática ${copy.title}`}
    >
      <div className="match-tactic-court flex h-[min(80dvh,800px)] min-h-0 flex-col items-center justify-center md:h-full">
        <span className="mb-2 shrink-0 rounded-full bg-[#FFF0F2] px-3 py-1 text-[11px] font-medium text-[#E30613]">
          {PHASE_LABELS[phase]}
        </span>
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <svg
            viewBox="0 0 50 100"
            className="mx-auto block h-full w-auto max-h-[800px] max-w-full"
            role="img"
            aria-label={copy.ariaLabel}
          >
          <defs>
            <clipPath id={`${id}-clip`}>
              <rect x="1" y="1" width="48" height="98" rx="1.5" />
            </clipPath>
            <marker id={`${id}-arrow`} markerWidth="3" markerHeight="3" refX="2.5" refY="1.5" orient="auto">
              <path d="M 0 0 L 3 1.5 L 0 3 z" fill="#fff" />
            </marker>
          </defs>
          <rect width="50" height="100" rx="2" fill="#9A6845" />
          <g clipPath={`url(#${id}-clip)`}>
            {Array.from({ length: 20 }, (_, index) => (
              <rect
                key={index}
                x="0"
                y={index * 5}
                width="50"
                height="5"
                fill={index % 2 === 0 ? '#B9845B' : '#A8734F'}
                opacity="0.75"
              />
            ))}
          </g>
          <rect x="1.5" y="1.5" width="47" height="97" rx="1.5" fill="none" stroke="#fff" strokeWidth="0.45" />
          <line x1="1.5" y1="50" x2="48.5" y2="50" stroke="#fff" strokeWidth="0.4" />
          <circle cx="25" cy="50" r="7.5" fill="none" stroke="#fff" strokeWidth="0.4" />
          <circle cx="25" cy="50" r="0.6" fill="#fff" />
          <path d="M 10 1.5 A 15 15 0 0 1 25 16.5 A 15 15 0 0 1 40 1.5" fill="none" stroke="#fff" strokeWidth="0.4" />
          <path d="M 10 98.5 A 15 15 0 0 0 25 83.5 A 15 15 0 0 0 40 98.5" fill="none" stroke="#fff" strokeWidth="0.4" />
          <rect x="21.25" y="0.5" width="7.5" height="1.7" fill="none" stroke="#fff" strokeWidth="0.4" />
          <rect x="21.25" y="97.8" width="7.5" height="1.7" fill="none" stroke="#fff" strokeWidth="0.4" />

          <g aria-hidden="true">
            {teams.flatMap(({ side, players, color }) => players.map((player, index) => {
              const distance = Math.hypot(player.x - player.baseX, player.y - player.baseY);
              if (distance < 0.15) return null;
              const start = toCourtPoint({ x: player.baseX, y: player.baseY });
              const end = toCourtPoint(player);
              return (
                <line
                  key={`${side}-move-${index}`}
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                  stroke={color}
                  strokeWidth="0.4"
                  strokeDasharray="1 1"
                  opacity="0.8"
                  markerEnd={`url(#${id}-arrow)`}
                />
              );
            }))}
            <path
              d={`M ${ball.x} ${ball.y} L ${passTarget.x} ${passTarget.y}`}
              fill="none"
              stroke="#fff"
              strokeWidth="0.55"
              strokeDasharray="1.5 1"
              markerEnd={`url(#${id}-arrow)`}
            />
          </g>

          {teams.flatMap(({ side, players, color }) => players.map(player => {
            const position = toCourtPoint(player);
            return (
              <g key={`${side}-${player.number}`} data-team={side} aria-hidden="true">
                <circle
                  cx={position.x}
                  cy={position.y}
                  r="2.45"
                  fill={player.isGoalkeeper ? '#FDE047' : color}
                  stroke={player.isGoalkeeper ? '#252733' : '#fff'}
                  strokeWidth="0.45"
                />
                <text
                  x={position.x}
                  y={position.y + 0.65}
                  textAnchor="middle"
                  fontSize="1.55"
                  fontWeight="900"
                  fill={player.isGoalkeeper ? '#252733' : '#fff'}
                >
                  {player.number}
                </text>
              </g>
            );
          }))}
          <circle cx={ball.x} cy={ball.y} r="1.55" fill="#fff" stroke="#252733" strokeWidth="0.4" />
          </svg>
        </div>
        <div className="mt-2 flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-[#858A98]" aria-hidden="true">
          <span><span className="text-[#E30613]">●</span> Seu time</span>
          <span><span className="text-[#173B6B]">●</span> Adversário</span>
          <span><span className="text-[#252733]">○</span> Bola</span>
        </div>
      </div>

      <div className="min-w-0 md:self-center" aria-live="polite" aria-atomic="true">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-[#252733]">{copy.title}</h2>
          <p className="tactic-preview-description mt-1 text-sm leading-relaxed text-[#858A98]">{copy.description}</p>
        </header>
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-emerald-700">Melhora</h3>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-[13px] leading-relaxed text-emerald-700">
            {copy.melhora.map(item => <li key={item}>{item}</li>)}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-orange-700">Piora</h3>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-[13px] leading-relaxed text-orange-700">
            {copy.piora.map(item => <li key={item}>{item}</li>)}
            </ul>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            aria-label="Sobre esta prévia"
            title="Prévia ilustrativa: o motor considera tentativas de passe e frequência de chute. Pressão e linha defensiva ainda não alteram a simulação."
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#858A98] hover:bg-[#F0F1F4] focus-visible:outline-2 focus-visible:outline-[#E30613]"
          >
            <Info size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}
