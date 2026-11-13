const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock('../../../src/lib/supabase', () => ({
  get supabase() {
    return { from: mockFrom, rpc: mockRpc };
  },
}));

import { getSavedSquads, saveSquad, upsertPrimarySquad } from '../../../src/lib/services/squads';

describe('squad service', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockRpc.mockReset();
  });

  it('stores starter card IDs rather than position objects', async () => {
    const savedRow = {
      id: 'saved-1',
      name: 'Meu time',
      formation: '1-2-1',
      starters: ['card-1', null, 'card-3', null, null],
      bench: [],
      created_at: '2026-11-13T10:00:00Z',
      is_primary: false,
    };
    const single = jest.fn().mockResolvedValue({ data: savedRow, error: null });
    const select = jest.fn(() => ({ single }));
    const insert = jest.fn(() => ({ select }));
    mockFrom.mockReturnValue({ insert });

    await expect(saveSquad('user-1', {
      sport: 'futsal',
      formation: '1-2-1',
      starters: [
        { position: 'GK', uid: 'card-1' },
        { position: 'Fixo', uid: null },
        { position: 'Ala', uid: 'card-3' },
        { position: 'Ala', uid: null },
        { position: 'Pivo', uid: null },
      ],
      bench: [],
    }, 'Meu time')).resolves.toEqual(expect.objectContaining({
      starters: ['card-1', null, 'card-3', null, null],
      isPrimary: false,
    }));

    expect(mockFrom).toHaveBeenCalledWith('saved_squads');
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      starters: ['card-1', null, 'card-3', null, null],
      is_primary: false,
    }));
  });

  it('normalizes old saved starter objects back to card IDs', async () => {
    const query: any = {
      select: jest.fn(() => query),
      eq: jest.fn(() => query),
      order: jest.fn().mockResolvedValue({
        data: [{
          id: 'saved-1',
          name: 'Meu time',
          formation: '1-2-1',
          starters: [{ position: 'GK', uid: 'card-1' }, 'card-2', null],
          bench: null,
          created_at: '2026-11-13T10:00:00Z',
          is_primary: true,
        }],
        error: null,
      }),
    };
    mockFrom.mockReturnValue(query);

    await expect(getSavedSquads('user-1')).resolves.toEqual([
      expect.objectContaining({
        starters: ['card-1', 'card-2', null],
        bench: [],
        isPrimary: true,
      }),
    ]);
  });

  it('uses the authenticated primary-squad RPC and preserves bench slots', async () => {
    mockRpc.mockResolvedValue({ error: null });

    await expect(upsertPrimarySquad('user-1', {
      sport: 'futsal',
      formation: '1-2-1',
      starters: [
        { position: 'GK', uid: 'card-1' },
        { position: 'Fixo', uid: null },
        { position: 'Ala', uid: null },
        { position: 'Ala', uid: null },
        { position: 'Pivo', uid: null },
      ],
      bench: ['card-2', null],
    })).resolves.toBe(true);

    expect(mockRpc).toHaveBeenCalledWith('set_primary_squad', {
      p_formation: '1-2-1',
      p_starters: ['card-1', null, null, null, null],
      p_bench: ['card-2', null],
    });
  });
});
