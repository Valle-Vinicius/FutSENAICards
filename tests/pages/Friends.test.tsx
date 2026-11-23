import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useGame } from '../../src/store/useGame';
import * as friendsService from '../../src/lib/services/friends';
import Friends from '../../src/pages/Friends';

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: { session: { user: { id: 'viewer' } } },
        error: null,
      }),
    },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        limit: jest.fn().mockResolvedValue({ error: null }),
      })),
    })),
  },
}));
jest.mock('../../src/store/useGame', () => ({ useGame: jest.fn() }));
jest.mock('../../src/lib/services/friends', () => ({
  getFriends: jest.fn(),
  getPendingReceived: jest.fn(),
  getPendingSent: jest.fn(),
  subscribeFriends: jest.fn(() => () => {}),
  subscribeFriendPresence: jest.fn(() => () => {}),
  searchUsers: jest.fn(),
  getAddableUsers: jest.fn(),
  sendRequest: jest.fn(),
  acceptRequest: jest.fn(),
  rejectRequest: jest.fn(),
  cancelRequest: jest.fn(),
}));

const mockedUseGame = jest.mocked(useGame);
const setPendingFriends = jest.fn();
const friendship = {
  id: 'request-1',
  requester_id: 'player-1',
  addressee_id: 'viewer',
  status: 'pending' as const,
  created_at: '2026-01-01T00:00:00.000Z',
};

function renderFriends() {
  return render(
    <MemoryRouter initialEntries={['/friends']}>
      <Routes>
        <Route path="/friends" element={<Friends />} />
        <Route path="/profile/:userId" element={<div>Perfil aberto</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Friends page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseGame.mockImplementation(selector => selector({ setPendingFriends } as never));
    jest.mocked(friendsService.getFriends).mockResolvedValue([
      { id: 'player-1', name: 'Ana Alves', avatar_url: 'https://example.test/ana.png', online: true },
    ]);
    jest.mocked(friendsService.getPendingReceived).mockResolvedValue([]);
    jest.mocked(friendsService.getPendingSent).mockResolvedValue([]);
    jest.mocked(friendsService.acceptRequest).mockResolvedValue(true);
    jest.mocked(friendsService.rejectRequest).mockResolvedValue(true);
  });

  it('shows the real friend profile and falls back to initials if the avatar cannot load', async () => {
    renderFriends();

    const friendCard = await screen.findByRole('button', { name: 'Perfil de Ana Alves, online' });
    const avatar = within(friendCard).getByAltText('');
    expect(avatar).toHaveAttribute('src', 'https://example.test/ana.png');
    expect(within(friendCard).getByText('Online')).toBeInTheDocument();

    fireEvent.error(avatar);
    await waitFor(() => expect(within(friendCard).getByText('A')).toBeInTheDocument());

    fireEvent.click(friendCard);
    expect(screen.getByText('Perfil aberto')).toBeInTheDocument();
  });

  it('shows the received-request count and preserves the accept action', async () => {
    jest.mocked(friendsService.getPendingReceived).mockResolvedValue([
      { friendship, user: { id: 'player-1', name: 'Ana Alves', online: false } },
    ]);
    renderFriends();

    const requestsTab = await screen.findByRole('button', { name: 'Solicitações recebidas (1)' });
    fireEvent.click(requestsTab);
    fireEvent.click(await screen.findByRole('button', { name: /Aceitar/ }));

    await waitFor(() => expect(friendsService.acceptRequest).toHaveBeenCalledWith('request-1'));
  });
});
