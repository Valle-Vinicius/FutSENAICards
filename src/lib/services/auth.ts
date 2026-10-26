import { supabase } from '../supabase';

export async function getSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function signIn(email: string, password: string) {
  if (!supabase) return { error: 'Supabase não configurado.' };
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error: error?.message ?? null };
}

export async function signUp(name: string, email: string, password: string) {
  if (!supabase) return { error: 'Supabase não configurado.' };
  const { error } = await supabase.auth.signUp({ email, password, options: { data: { name } } });
  return { error: error?.message ?? null };
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function resetPassword(email: string) {
  if (!supabase) return { error: 'Supabase não configurado.' };
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/' });
  return { error: error?.message ?? null };
}

export async function updatePassword(password: string) {
  if (!supabase) return { error: 'Supabase não configurado.' };
  const { error } = await supabase.auth.updateUser({ password });
  return { error: error?.message ?? null };
}

export async function updateEmail(email: string) {
  if (!supabase) return { error: 'Supabase não configurado.' };
  const { error } = await supabase.auth.updateUser({ email });
  return { error: error?.message ?? null };
}

export async function updateMetadata(name: string) {
  if (!supabase) return { error: 'Supabase não configurado.' };
  const { error } = await supabase.auth.updateUser({ data: { name } });
  return { error: error?.message ?? null };
}
export async function signInWithGoogle() {
  if (!supabase) return { error: 'Supabase não configurado.' };
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + '/' } });
  return { error: error?.message ?? null };
}
