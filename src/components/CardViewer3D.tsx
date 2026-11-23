import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { Award, RotateCcw, RotateCw, X } from 'lucide-react';
import Card from './Card';
import { RARITY_META, type PlayerCard } from '../types';
import type { ExtraStat } from '../types';
import { getCardAttributes } from '../lib/cardAttributes';
import cardBackCommon from '../imagens/cartas/comum.png';
import cardBackUncommon from '../imagens/cartas/incomum.png';
import cardBackRare from '../imagens/cartas/raro.png';
import cardBackEpic from '../imagens/cartas/epico.png';
import cardBackLegendary from '../imagens/cartas/lendario.png';
import cardBackIcon from '../imagens/cartas/icone.png';

const CARD_BACKS: Record<PlayerCard['rarity'], string> = {
  common: cardBackCommon,
  uncommon: cardBackUncommon,
  rare: cardBackRare,
  epic: cardBackEpic,
  legendary: cardBackLegendary,
  icon: cardBackIcon,
  secret: cardBackIcon,
};

interface CardViewer3DProps {
  card: PlayerCard;
  attributes?: ExtraStat[];
  onClose: () => void;
}

export default function CardViewer3D({ card, attributes = getCardAttributes(card), onClose }: CardViewer3DProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0, lightX: 50, lightY: 40 });
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const rarity = RARITY_META[card.rarity] ?? RARITY_META.common;
  const visibleAttributes = attributes.slice(0, 6);

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [role="button"][tabindex="0"]',
      ));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    closeButtonRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [onClose]);

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    setTilt({
      x: (0.5 - y) * 10,
      y: (x - 0.5) * 12,
      lightX: x * 100,
      lightY: y * 100,
    });
  };

  const resetTilt = () => setTilt({ x: 0, y: 0, lightX: 50, lightY: 40 });
  const flip = () => setIsFlipped(value => !value);
  const handleCardKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      flip();
    }
  };
  const cardStyle = {
    '--tilt-x': `${tilt.x}deg`,
    '--tilt-y': `${tilt.y}deg`,
    '--flip-angle': isFlipped ? '180deg' : '0deg',
    '--light-x': `${tilt.lightX}%`,
    '--light-y': `${tilt.lightY}%`,
  } as CSSProperties;

  return createPortal(
    <div
      className="card-viewer-overlay"
      onClick={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="card-viewer-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-viewer-title"
      >
        <header className="card-viewer-dialog__header">
          <div>
            <span>FUTSENAI · COLEÇÃO</span>
            <h2 id="card-viewer-title">Visualizador 3D</h2>
          </div>
          <button ref={closeButtonRef} type="button" className="card-viewer-close" onClick={onClose} aria-label="Fechar visualização">
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="card-viewer-dialog__content">
          <div className="card-viewer-stage">
            <div className="card-viewer-perspective">
              <div
                className="card-viewer-flipper"
                data-flipped={isFlipped}
                data-rarity={card.rarity}
                style={cardStyle}
                role="button"
                tabIndex={0}
                aria-label={isFlipped ? 'Carta virada; clique para ver a frente' : 'Clique para virar e ver o verso'}
                onClick={flip}
                onKeyDown={handleCardKeyDown}
                onPointerMove={handlePointerMove}
                onPointerLeave={resetTilt}
              >
                <div className="card-viewer-face card-viewer-face--front" aria-hidden={isFlipped}>
                  <Card card={card} size="lg" animateHover={false} />
                </div>
                <div className="card-viewer-face card-viewer-face--back" aria-hidden={!isFlipped}>
                  <img src={CARD_BACKS[card.rarity]} alt={`Verso da carta ${rarity.label}`} draggable={false} />
                  <span>{rarity.label}</span>
                </div>
                <div className="card-viewer-hologram" aria-hidden="true" />
                <div className="card-viewer-light" aria-hidden="true" />
              </div>
            </div>
            <p className="card-viewer-hint">
              {isFlipped ? 'Clique para voltar à frente' : 'Clique na carta para ver o verso'}
            </p>
            <div className="card-viewer-controls">
              <button type="button" onClick={() => setIsFlipped(true)} disabled={isFlipped}>
                <RotateCw aria-hidden="true" /> Virar carta
              </button>
              <button type="button" onClick={() => setIsFlipped(false)} disabled={!isFlipped}>
                <RotateCcw aria-hidden="true" /> Voltar para frente
              </button>
              <button type="button" className="card-viewer-controls__close" onClick={onClose}>
                Fechar
              </button>
            </div>
          </div>

          <aside className="card-viewer-info">
            <span className="card-viewer-info__kicker">FICHA DO ATLETA</span>
            <h3>{card.name}</h3>
            <div className={`card-viewer-overall${card.rarity === 'icon' ? ' card-viewer-overall--icon' : ''}`}>
              <span>OVERALL</span>
              <strong>{card.overall}</strong>
            </div>
            <dl className="card-viewer-facts">
              <ViewerFact label="Posição" value={displayPosition(card.position)} />
              <ViewerFact label="Raridade" value={rarity.label} icon={card.rarity === 'icon'} />
              <ViewerFact label="Clube" value={card.club} />
              <ViewerFact label="Nacionalidade" value={card.nationality} />
            </dl>
            <div className="card-viewer-attributes">
              <span className="card-viewer-info__kicker">ATRIBUTOS</span>
              <div>
                {visibleAttributes.map(attribute => (
                  <div key={attribute.label}>
                    <span>{attribute.label}</span>
                    <strong>{attribute.value}</strong>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function ViewerFact({ label, value, icon = false }: { label: string; value: string; icon?: boolean }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{icon && <Award aria-hidden="true" />}{value}</dd>
    </div>
  );
}

function displayPosition(position: string) {
  if (position === 'Pivo') return 'Pivô';
  if (position === 'GK') return 'Goleiro';
  return position;
}
