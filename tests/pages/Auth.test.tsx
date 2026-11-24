import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Auth from '../../src/pages/Auth';

jest.mock('../../src/data/poses', () => ({ POSES: ['/pose1.png', '/pose2.png'] }));
jest.mock('../../src/lib/supabase', () => ({
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
    const { container } = render(<MemoryRouter><Auth /></MemoryRouter>);
    expect(container.querySelector('.auth-screen')).toBeInTheDocument();
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
      const { supabase } = require('../../src/lib/supabase');
      expect(supabase.auth.signInWithPassword).toHaveBeenCalled();
    });
  });

  it('shows forgot password button in login mode', () => {
    render(<MemoryRouter><Auth /></MemoryRouter>);
    expect(screen.getByText('Esqueci minha senha')).toBeInTheDocument();
  });

  it('toggles password visibility and sets login autocomplete attributes', () => {
    render(<MemoryRouter><Auth /></MemoryRouter>);
    const password = screen.getByPlaceholderText('Senha');
    const email = screen.getByPlaceholderText('Email');

    expect(password).toHaveAttribute('type', 'password');
    expect(password).toHaveAttribute('autocomplete', 'current-password');
    expect(email).toHaveAttribute('autocomplete', 'username');

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Ocultar senha' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('uses name and new-password autocomplete during registration', () => {
    render(<MemoryRouter><Auth /></MemoryRouter>);
    fireEvent.click(screen.getByText('Não tem conta? Cadastre-se'));

    expect(screen.getByPlaceholderText('Nome')).toHaveAttribute('autocomplete', 'name');
    expect(screen.getByPlaceholderText('Email')).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByPlaceholderText('Senha')).toHaveAttribute('autocomplete', 'new-password');
  });

  it('can mute and unmute the lazy-loaded background music', async () => {
    const audio = {
      loop: false,
      volume: 1,
      muted: false,
      play: jest.fn().mockResolvedValue(undefined),
      pause: jest.fn(),
      removeAttribute: jest.fn(),
      load: jest.fn(),
    } as unknown as HTMLAudioElement;
    const originalAudio = window.Audio;
    window.Audio = jest.fn(() => audio) as unknown as typeof Audio;

    const { unmount } = render(<MemoryRouter><Auth /></MemoryRouter>);
    try {
      fireEvent.click(screen.getByText('Clique para entrar'));

      await waitFor(() => expect(window.Audio).toHaveBeenCalled());
      const muteButton = await screen.findByRole('button', { name: 'Mutar música de fundo' });
      fireEvent.click(muteButton);

      expect(audio.muted).toBe(true);
      expect(screen.getByRole('button', { name: 'Ativar música de fundo' })).toHaveAttribute('aria-pressed', 'true');
    } finally {
      unmount();
      window.Audio = originalAudio;
    }
  });

  it('pauses particle animation while the browser tab is hidden', () => {
    const previousHidden = Object.getOwnPropertyDescriptor(document, 'hidden');
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    const context = {
      clearRect: jest.fn(),
      beginPath: jest.fn(),
      arc: jest.fn(),
      fill: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      stroke: jest.fn(),
    } as unknown as CanvasRenderingContext2D;
    const getContext = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
    const requestFrame = jest.spyOn(window, 'requestAnimationFrame').mockReturnValue(42);
    const cancelFrame = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    const { unmount } = render(<MemoryRouter><Auth /></MemoryRouter>);

    try {
      expect(requestFrame).toHaveBeenCalledTimes(1);
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      fireEvent(document, new Event('visibilitychange'));
      expect(cancelFrame).toHaveBeenCalledWith(42);

      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      fireEvent(document, new Event('visibilitychange'));
      expect(requestFrame).toHaveBeenCalledTimes(2);
    } finally {
      unmount();
      getContext.mockRestore();
      requestFrame.mockRestore();
      cancelFrame.mockRestore();
      if (previousHidden) Object.defineProperty(document, 'hidden', previousHidden);
      else Reflect.deleteProperty(document, 'hidden');
    }
  });
});
