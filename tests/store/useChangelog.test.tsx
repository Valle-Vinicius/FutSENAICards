import { act, renderHook, waitFor } from '@testing-library/react';
import {
  listChangelog,
  subscribeChangelog,
  type ChangelogEntry,
} from '../../src/lib/services/changelog';
import { hasUnseenChangelog, useChangelog, useChangelogStore } from '../../src/store/useChangelog';

jest.mock('../../src/lib/services/changelog', () => ({
  listChangelog: jest.fn(),
  subscribeChangelog: jest.fn(() => jest.fn()),
}));

const ENTRY: ChangelogEntry = {
  id: 'entry-1',
  version: '1.4.0',
  title: 'Atualização de teste',
  body: 'Conteúdo.',
  category: 'novo',
  published_at: '2026-11-17T12:00:00.000Z',
};

describe('useChangelog', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    useChangelogStore.setState({
      entries: [],
      loading: true,
      loadingMore: false,
      error: null,
      hasMore: false,
      lastSeenVersion: null,
      hasNew: false,
    });
    jest.mocked(listChangelog).mockResolvedValue([ENTRY]);
    jest.mocked(subscribeChangelog).mockReturnValue(jest.fn());
  });

  it('marks a newer version as new and persists it as seen when acknowledged', async () => {
    const { result } = renderHook(() => useChangelog());

    await waitFor(() => expect(result.current.entries).toHaveLength(1));
    expect(result.current.hasNew).toBe(true);

    act(() => result.current.markSeen(ENTRY.version));

    expect(result.current.hasNew).toBe(false);
    expect(localStorage.getItem('futsenai_changelog_seen')).toBe(ENTRY.version);
  });

  it('compares versions numerically rather than lexicographically', () => {
    expect(hasUnseenChangelog([ENTRY], '1.3.9')).toBe(true);
    expect(hasUnseenChangelog([ENTRY], '1.4.0')).toBe(false);
    expect(hasUnseenChangelog([ENTRY], '1.10.0')).toBe(false);
  });
});
