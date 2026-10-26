import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Auth from '../Auth';

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: jest.fn().mockResolvedValue({ error: null }),
      signUp: jest.fn().mockResolvedValue({ error: null }),
      resetPasswordForEmail: jest.fn().mockResolvedValue({ error: null }),
      signInWithOAuth: jest.fn().mockResolvedValue({ error: null }),
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    },
  },
  hasSupabase: true,
}));

describe('Auth page', () => {
  it('renders login form by default', () => {
    render(<MemoryRouter><Auth /></MemoryRouter>);
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Senha')).toBeInTheDocument();
  });

  it('toggles to register and shows name field', () => {
    render(<MemoryRouter><Auth /></MemoryRouter>);
    fireEvent.click(screen.getByText('Não tem conta? Cadastre-se'));
    expect(screen.getByPlaceholderText('Nome')).toBeInTheDocument();
  });

  it('calls signInWithPassword on submit', async () => {
    render(<MemoryRouter><Auth /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'test@test.com' } });
    fireEvent.change(screen.getByPlaceholderText('Senha'), { target: { value: '123456' } });
    fireEvent.click(screen.getByText('ENTRAR'));
    await waitFor(() => {
      const { supabase } = require('../../lib/supabase');
      expect(supabase.auth.signInWithPassword).toHaveBeenCalled();
    });
  });

  it('shows forgot password button in login mode', () => {
    render(<MemoryRouter><Auth /></MemoryRouter>);
    expect(screen.getByText('Esqueci minha senha')).toBeInTheDocument();
  });
});
