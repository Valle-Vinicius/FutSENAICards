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
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-[#E9EAF0]">
        <table className="min-w-[1050px] w-full border-collapse text-left text-xs">
          <caption className="sr-only">Chance e custo estimado para obter uma carta secreta</caption>
          <thead className="bg-[#F7F7F9] text-[#424858]">
            <tr>
              <th className="px-3 py-2 font-semibold">Pacote</th>
              <th className="px-3 py-2 font-semibold">Cartas</th>
              <th className="px-3 py-2 font-semibold">Preço</th>
              <th className="px-3 py-2 font-semibold">Chance por pacote</th>
              <th className="px-3 py-2 font-semibold">1 em X pacotes</th>
              <th className="px-3 py-2 font-semibold">Gasto médio</th>
              <th className="px-3 py-2 font-semibold">Gasto para 50%</th>
              <th className="px-3 py-2 font-semibold">90%</th>
              <th className="px-3 py-2 font-semibold">99%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E9EAF0] text-[#424858]">
            {rows.map(row => (
              <tr key={row.pack.id}>
                <th scope="row" className="whitespace-nowrap px-3 py-2 font-medium text-[#252733]">{row.pack.name.replace(/^PACOTE /, '')}</th>
                <td className="px-3 py-2 tabular-nums">{row.pack.cards}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{row.pack.price.toLocaleString('pt-BR')} moedas</td>
                {!row.eligible ? (
                  <td colSpan={6} className="px-3 py-2 text-[#858A98]">Não elegível</td>
                ) : row.chancePerPack === null ? (
                  <td colSpan={6} className="px-3 py-2 text-[#B42318]">Informe uma chance entre 0,0001% e 5%</td>
                ) : (
                  <>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatSecretPercent(row.chancePerPack)}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">1 em {Math.round(row.oneIn!).toLocaleString('pt-BR')}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">~{formatSecretCoins(row.averageCost!)}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">~{formatSecretCoins(row.costFor50!)}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">~{formatSecretCoins(row.costFor90!)}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">~{formatSecretCoins(row.costFor99!)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[#626879]">Os valores assumem que ainda há cópias disponíveis.</p>
      <p className="rounded-lg bg-[#F7F7F9] px-3 py-2 text-xs font-medium text-[#252733]">
        {cheapest
          ? `Pacote mais barato para chegar a 99%: ${cheapest.pack.name.replace(/^PACOTE /, '')} (~${formatSecretCoins(cheapest.costFor99!)})`
          : 'Nenhum pacote elegível para esta posição.'}
      </p>
    </div>
  );
}
