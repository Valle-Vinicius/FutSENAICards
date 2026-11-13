import type { ExtraStat } from '../types';

export function validateExtraStats(stats: ExtraStat[]): string | null {
  if (stats.length > 10) return 'É permitido cadastrar até 10 estatísticas extras.';
  if (stats.some(stat =>
    !stat.label.trim()
    || stat.label.trim().length > 30
    || !Number.isInteger(stat.value)
    || stat.value < 0
    || stat.value > 999
  )) {
    return 'Cada estatística extra precisa de um nome (até 30 caracteres) e um valor inteiro entre 0 e 999.';
  }
  const labels = stats.map(stat => stat.label.trim().toLowerCase());
  if (new Set(labels).size !== labels.length) return 'Os nomes das estatísticas extras não podem se repetir.';
  return null;
}
