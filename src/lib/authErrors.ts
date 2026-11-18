const AUTH_ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  email_not_confirmed: 'Confirme seu e-mail antes de entrar.',
  user_already_exists: 'Já existe uma conta cadastrada com este e-mail.',
  email_exists: 'Já existe uma conta cadastrada com este e-mail.',
  weak_password: 'A senha não atende aos requisitos mínimos de segurança.',
  over_email_send_rate_limit: 'Muitas solicitações. Aguarde um pouco e tente novamente.',
  over_request_rate_limit: 'Muitas tentativas. Aguarde um pouco e tente novamente.',
  email_address_invalid: 'Informe um endereço de e-mail válido.',
  user_not_found: 'Não encontramos uma conta com este e-mail.',
  otp_expired: 'O link de recuperação expirou. Solicite um novo.',
  same_password: 'A nova senha deve ser diferente da senha atual.',
  session_not_found: 'Sua sessão expirou. Entre novamente.',
  session_expired: 'Sua sessão expirou. Entre novamente.',
  signup_disabled: 'O cadastro está temporariamente indisponível.',
  email_provider_disabled: 'O cadastro por e-mail está temporariamente indisponível.',
};

function getErrorDetails(error: unknown): { code: string; message: string } {
  if (typeof error === 'string') return { code: '', message: error };
  if (error instanceof Error) return { code: '', message: error.message };
  if (!error || typeof error !== 'object') return { code: '', message: '' };

  const details = error as { code?: unknown; message?: unknown };
  return {
    code: typeof details.code === 'string' ? details.code.toLowerCase() : '',
    message: typeof details.message === 'string' ? details.message : '',
  };
}

export function toFriendlyAuthError(error: unknown): string {
  const { code, message } = getErrorDetails(error);
  if (AUTH_ERROR_MESSAGES[code]) return AUTH_ERROR_MESSAGES[code];

  const normalizedMessage = message.toLowerCase();
  if (normalizedMessage.includes('supabase não configurado') || normalizedMessage.includes('supabase is not configured')) {
    return 'O serviço de autenticação está indisponível no momento.';
  }
  if (normalizedMessage.includes('invalid login credentials') || normalizedMessage.includes('invalid credentials')) {
    return AUTH_ERROR_MESSAGES.invalid_credentials;
  }
  if (normalizedMessage.includes('email not confirmed') || normalizedMessage.includes('email_not_confirmed')) {
    return AUTH_ERROR_MESSAGES.email_not_confirmed;
  }
  if (normalizedMessage.includes('already registered') || normalizedMessage.includes('user already exists')) {
    return AUTH_ERROR_MESSAGES.user_already_exists;
  }
  if (normalizedMessage.includes('weak password') || normalizedMessage.includes('password should be at least')) {
    return AUTH_ERROR_MESSAGES.weak_password;
  }
  if (
    normalizedMessage.includes('rate limit')
    || normalizedMessage.includes('too many requests')
    || normalizedMessage.includes('for security purposes')
  ) {
    return AUTH_ERROR_MESSAGES.over_request_rate_limit;
  }
  if (
    normalizedMessage.includes('invalid email')
    || normalizedMessage.includes('email address is invalid')
    || (normalizedMessage.includes('email') && normalizedMessage.includes('invalid'))
  ) {
    return AUTH_ERROR_MESSAGES.email_address_invalid;
  }
  if (normalizedMessage.includes('user not found')) return AUTH_ERROR_MESSAGES.user_not_found;
  if (normalizedMessage.includes('different from the old password')) return AUTH_ERROR_MESSAGES.same_password;
  if (normalizedMessage.includes('expired') || normalizedMessage.includes('otp')) {
    return AUTH_ERROR_MESSAGES.otp_expired;
  }
  if (normalizedMessage.includes('failed to fetch') || normalizedMessage.includes('network')) {
    return 'Sem conexão com o serviço de autenticação. Verifique sua internet e tente novamente.';
  }
  return 'Não foi possível concluir a autenticação. Tente novamente em instantes.';
}
