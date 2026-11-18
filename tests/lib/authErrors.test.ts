import { toFriendlyAuthError } from '../../src/lib/authErrors';

describe('toFriendlyAuthError', () => {
  it('translates common Supabase authentication errors', () => {
    expect(toFriendlyAuthError({ code: 'invalid_credentials', message: 'Invalid login credentials' }))
      .toBe('E-mail ou senha incorretos.');
    expect(toFriendlyAuthError({ code: 'email_not_confirmed', message: 'Email not confirmed' }))
      .toBe('Confirme seu e-mail antes de entrar.');
    expect(toFriendlyAuthError({ code: 'over_email_send_rate_limit', message: 'Too many requests' }))
      .toBe('Muitas solicitações. Aguarde um pouco e tente novamente.');
  });

  it('does not expose unknown provider errors verbatim', () => {
    expect(toFriendlyAuthError(new Error('Internal database hostname and query details')))
      .toBe('Não foi possível concluir a autenticação. Tente novamente em instantes.');
  });

  it('translates network failures', () => {
    expect(toFriendlyAuthError(new Error('Failed to fetch')))
      .toBe('Sem conexão com o serviço de autenticação. Verifique sua internet e tente novamente.');
  });
});
