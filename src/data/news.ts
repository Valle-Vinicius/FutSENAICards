export interface NewsItem {
  id: string;
  title: string;
  category: 'BOMBA' | 'CHORO';
  turma: string;
  date: string;
  summary: string;
  image?: string;
  url: string;
}

const JOURNAL_URL = 'https://pietro-guedes.github.io/FutSenai-Jornal/';

export const NEWS: NewsItem[] = [
  {
    id: '326737d8-b782-4cb4-b65e-b9629d88a7cb',
    title: '🚨 ESCÂNDALO NO SENAI: ALUNOS SÃO APONTADOS POR COLEGAS, DENÚNCIAS SEM PROVAS GERAM POLÊMICA E PUNIÇÕES AMEAÇA',
    category: 'CHORO',
    turma: '3°A',
    date: '23/10/2026',
    summary: 'Denúncias entre estudantes geram controvérsia após a proibição de um esporte durante o intervalo. A polêmica envolve rivalidades, possíveis punições e questionamentos sobre a justiça das medidas.',
    image: 'https://pietro-guedes.github.io/FutSenai-Jornal/images/news/1946939450a8f1560e4ab7bd958cc146eff21055245d8cbf8d60ae48eb819d53.jpg',
    url: JOURNAL_URL,
  },
  {
    id: '6fa799ea-db80-4c4d-9161-0816d84e4c83',
    title: 'FIM DO TABU E POLÍCIA NA QUADRA! 3º Ano vence por 3x2 em jogo Clandestino!',
    category: 'BOMBA',
    turma: '3°A e 2°',
    date: '21/10/2026',
    summary: 'O 3º ano vence o 2º por 3 a 2, com destaque para Dutra, Muzy e Lopes. Porém, a partida termina cercada de polêmica após uma interrupção por supostas irregularidades.',
    image: 'https://pietro-guedes.github.io/FutSenai-Jornal/images/news/bac5a9991f3ec702403db2096657d94ca22a5970879760157d9ee2ed2e90f445.jpg',
    url: JOURNAL_URL,
  },
  {
    id: '8730b37b-a3fc-4ed0-9fb8-b81866b905fb',
    title: 'Evento semanal CANCELADO',
    category: 'BOMBA',
    turma: 'Todas',
    date: '21/10/2026',
    summary: 'Uma discussão durante uma partida entre o 3ºB e o 2º ano teria provocado a intervenção de autoridades. A matéria relata o cancelamento do futebol durante o intervalo por tempo indeterminado.',
    image: '',
    url: JOURNAL_URL,
  },
];
