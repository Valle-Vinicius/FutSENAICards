import type { Tactic } from '../engine/match';

export type TacticPreviewCopy = {
  title: string;
  description: string;
  melhora: [string, string];
  piora: [string, string];
  ariaLabel: string;
};

export const tacticPreviews: Record<Tactic, TacticPreviewCopy> = {
  balanced: {
    title: 'Ritmo equilibrado',
    description: 'Mantém as frequências-base de tentativas de passe e chute.',
    melhora: ['Não força uma ação específica.', 'Serve como referência sem ajustes extremos.'],
    piora: ['Não prioriza uma jogada.', 'Pressão e linha defensiva não mudam no motor atual.'],
    ariaLabel: 'Prévia equilibrada: o motor mantém as frequências-base de passe e chute.',
  },
  possession: {
    title: 'Condução e paciência',
    description: 'No motor atual, reduz tentativas de passe e a frequência de chute.',
    melhora: ['Abre mais ocasiões para conduzir em vez de passar.', 'Adia tentativas de chute.'],
    piora: ['Não aumenta o controle da posse.', 'Pressão e linha defensiva não mudam no motor atual.'],
    ariaLabel: 'Prévia de posse: há menos tentativas de passe e de chute no motor atual.',
  },
  highpress: {
    title: 'Mais tentativas de passe',
    description: 'Aumenta tentativas de passe, mas não aplica pressão defensiva.',
    melhora: ['Mais tentativas de passe que a configuração-base.', 'Mantém a frequência-base de chute.'],
    piora: ['Não pressiona a saída adversária.', 'Não adianta a linha defensiva.'],
    ariaLabel: 'Prévia de pressão alta: aumenta tentativas de passe, sem mudar pressão ou linha defensiva.',
  },
  counter: {
    title: 'Passe e chute mais frequentes',
    description: 'Aumenta tentativas de passe e a frequência de chute.',
    melhora: ['Mais tentativas de passe.', 'Tenta o chute com mais frequência.'],
    piora: ['Não cria uma transição automática.', 'Não posiciona jogadores atrás da defesa.'],
    ariaLabel: 'Prévia de contra-ataque: o motor aumenta tentativas de passe e de chute.',
  },
  compact: {
    title: 'Ações mais contidas',
    description: 'Reduz tentativas de passe e a frequência de chute.',
    melhora: ['Menos decisões de passe.', 'Reduz a frequência de tentativas de chute.'],
    piora: ['Não fecha espaços defensivos.', 'Não altera a linha defensiva.'],
    ariaLabel: 'Prévia compacta: há menos tentativas de passe e de chute, sem ajuste defensivo.',
  },
};
