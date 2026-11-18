import type { Position } from '../types';
import {
  calculateSecretPackOdds,
  cheapestSecretPackFor99,
  formatSecretCoins,
  formatSecretPercent,
} from '../lib/secretCardOdds';

export default function SecretCardOddsTable({ chancePercent, position }: { chancePercent: number; position: Position }) {
  const rows = calculateSecretPackOdds(chancePercent, position);
  const cheapest = cheapestSecretPackFor99(rows);

  return (
    <div className="space-y-3 text-white">
      <ul className="space-y-2" aria-label="Chance e custo estimado por pacote">
        {rows.map(row => (
          <li key={row.pack.id} className="rounded-lg border border-white/20 bg-[#1B1E25] p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h4 className="text-sm font-bold text-white">{row.pack.name.replace(/^PACOTE /, '')}</h4>
              <p className="text-xs text-white/80">
                {row.pack.cards} cartas <span aria-hidden="true">·</span> {row.pack.price.toLocaleString('pt-BR')} moedas
              </p>
            </div>
            {!row.eligible ? (
              <p className="mt-2 text-xs font-medium text-white/75">Não elegível para cartas secretas</p>
            ) : row.chancePerPack === null ? (
              <p className="mt-2 text-xs font-medium text-amber-200">Informe uma chance entre 0,0001% e 5%</p>
            ) : (
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
                <div>
                  <dt className="text-xs leading-4 text-white/70">Chance por pacote</dt>
                  <dd className="mt-0.5 text-xs font-semibold tabular-nums text-white">{formatSecretPercent(row.chancePerPack)}</dd>
                </div>
                <div>
                  <dt className="text-xs leading-4 text-white/70">1 em X pacotes</dt>
                  <dd className="mt-0.5 text-xs font-semibold tabular-nums text-white">1 em {Math.round(row.oneIn!).toLocaleString('pt-BR')}</dd>
                </div>
                <div>
                  <dt className="text-xs leading-4 text-white/70">Gasto médio</dt>
                  <dd className="mt-0.5 text-xs font-semibold tabular-nums text-white">~{formatSecretCoins(row.averageCost!)}</dd>
                </div>
                <div>
                  <dt className="text-xs leading-4 text-white/70">Gasto para 50%</dt>
                  <dd className="mt-0.5 text-xs font-semibold tabular-nums text-white">~{formatSecretCoins(row.costFor50!)}</dd>
                </div>
                <div>
                  <dt className="text-xs leading-4 text-white/70">Gasto para 90%</dt>
                  <dd className="mt-0.5 text-xs font-semibold tabular-nums text-white">~{formatSecretCoins(row.costFor90!)}</dd>
                </div>
                <div>
                  <dt className="text-xs leading-4 text-white/70">Gasto para 99%</dt>
                  <dd className="mt-0.5 text-xs font-semibold tabular-nums text-white">~{formatSecretCoins(row.costFor99!)}</dd>
                </div>
              </dl>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-white/75">Os valores assumem que ainda há cópias disponíveis.</p>
      <p className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-[var(--text)]">
        {cheapest
          ? `Pacote mais barato para chegar a 99%: ${cheapest.pack.name.replace(/^PACOTE /, '')} (~${formatSecretCoins(cheapest.costFor99!)})`
          : 'Nenhum pacote elegível para esta posição.'}
      </p>
    </div>
  );
}
