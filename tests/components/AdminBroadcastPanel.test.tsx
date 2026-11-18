import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockRpc = jest.fn();
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();

jest.mock('../../src/lib/supabase', () => ({
  get supabase() {
    return { rpc: mockRpc };
  },
}));
jest.mock('../../src/store/toast', () => ({
  toast: {
    success: mockToastSuccess,
    error: mockToastError,
  },
}));

import AdminBroadcastPanel from '../../src/components/AdminBroadcastPanel';

describe('AdminBroadcastPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends a trimmed message through the protected broadcast RPC', async () => {
    mockRpc.mockResolvedValue({ error: null });
    render(<AdminBroadcastPanel />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Mensagem' }), {
      target: { value: '  Servidor em manutenção às 22h.  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar para quem está online' }));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('admin_broadcast_message', {
        p_message: 'Servidor em manutenção às 22h.',
      });
    });
    expect(mockToastSuccess).toHaveBeenCalledWith('Mensagem enviada para os usuários online.');
    expect(screen.getByRole('textbox', { name: 'Mensagem' })).toHaveValue('');
  });

  it('disables sending when the message contains only whitespace', () => {
    render(<AdminBroadcastPanel />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Mensagem' }), {
      target: { value: '   ' },
    });

    expect(screen.getByRole('button', { name: 'Enviar para quem está online' })).toBeDisabled();
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockToastError).not.toHaveBeenCalled();
  });
});
