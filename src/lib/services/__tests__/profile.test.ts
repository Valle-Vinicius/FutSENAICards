jest.mock('../../supabase', () => ({ supabase: null, hasSupabase: false }));

import { getProfile, updateProfile } from '../../profile';

describe('profile service (no supabase)', () => {
  it('getProfile returns null', async () => {
    expect(await getProfile('123')).toBeNull();
  });
  it('updateProfile returns null', async () => {
    expect(await updateProfile('123', { name: 'X' })).toBeNull();
  });
});
