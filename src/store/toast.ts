import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastStore {
  toasts: Toast[];
  show: (type: ToastType, message: string) => void;
  remove: (id: string) => void;
}

export const useToast = create<ToastStore>((set) => ({
  toasts: [],
  show: (type, message) => {
    const id = Math.random().toString(36).slice(2);
    set(st => ({ toasts: [...st.toasts, { id, type, message }] }));
    setTimeout(() => set(st => ({ toasts: st.toasts.filter(t => t.id !== id) })), 3500);
  },
  remove: (id) => set(st => ({ toasts: st.toasts.filter(t => t.id !== id) })),
}));

export const toast = {
  success: (m: string) => useToast.getState().show('success', m),
  error: (m: string) => useToast.getState().show('error', m),
  warning: (m: string) => useToast.getState().show('warning', m),
  info: (m: string) => useToast.getState().show('info', m),
};
