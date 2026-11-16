const mockOn = jest.fn();
const mockSubscribe = jest.fn();
const mockPresenceState = jest.fn();
const mockTrack = jest.fn();
const mockUntrack = jest.fn();
const mockChannelFactory = jest.fn();
const mockRemoveChannel = jest.fn();
const mockChannel = {
  on: mockOn,
  subscribe: mockSubscribe,
  presenceState: mockPresenceState,
  track: mockTrack,
  untrack: mockUntrack,
};
const mockClient = {
  channel: mockChannelFactory,
  removeChannel: mockRemoveChannel,
};

jest.mock('../../../src/lib/supabase', () => ({
  get supabase() {
    return mockClient;
  },
}));

import {
  subscribeFriendPresence,
  subscribeUserPresence,
} from '../../../src/lib/services/friends';

describe('friend realtime presence', () => {
  let onSync: (() => void) | undefined;
  let onSubscribe: ((status: string, error?: unknown) => void) | undefined;
  let previousVisibilityState: DocumentVisibilityState;

  beforeEach(() => {
    onSync = undefined;
    onSubscribe = undefined;
    previousVisibilityState = document.visibilityState;
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });

    mockOn.mockReset().mockImplementation((_type, filter, callback) => {
      if (filter.event === 'sync') onSync = callback;
      return mockChannel;
    });
    mockSubscribe.mockReset().mockImplementation(callback => {
      onSubscribe = callback;
      return mockChannel;
    });
    mockPresenceState.mockReset().mockReturnValue({});
    mockTrack.mockReset().mockResolvedValue('ok');
    mockUntrack.mockReset().mockResolvedValue('ok');
    mockChannelFactory.mockReset().mockReturnValue(mockChannel);
    mockRemoveChannel.mockReset().mockResolvedValue('ok');
  });

  afterEach(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: previousVisibilityState,
    });
  });

  it('updates friend status from presence sync events and removes the channel on cleanup', () => {
    const onChange = jest.fn();
    const unsubscribe = subscribeFriendPresence(['friend-1', 'friend-1'], onChange);

    expect(mockChannelFactory).toHaveBeenCalledTimes(1);
    expect(mockChannelFactory).toHaveBeenCalledWith('friends-presence:friend-1', {
      config: { private: true, presence: { key: 'friend-1', enabled: true } },
    });
    onSubscribe?.('SUBSCRIBED');
    expect(onChange).toHaveBeenLastCalledWith('friend-1', false);

    mockPresenceState.mockReturnValue({ 'friend-1': [{ user_id: 'friend-1' }] });
    onSync?.();
    expect(onChange).toHaveBeenLastCalledWith('friend-1', true);

    unsubscribe();
    expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannel);
  });

  it('tracks the current user as present while the app is visible', () => {
    const unsubscribe = subscribeUserPresence('user-1');

    expect(mockChannelFactory).toHaveBeenCalledWith('friends-presence:user-1', {
      config: { private: true, presence: { key: 'user-1' } },
    });
    onSubscribe?.('SUBSCRIBED');
    expect(mockTrack).toHaveBeenCalledWith({ user_id: 'user-1' });

    unsubscribe();
    expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannel);
  });
});
