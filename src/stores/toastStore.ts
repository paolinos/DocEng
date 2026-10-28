import { create } from "zustand";

export type ToastKind = "info" | "success" | "warning" | "error";

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, kind?: ToastKind, durationMs?: number) => number;
  dismiss: (id: number) => void;
}

const timers = new Map<number, ReturnType<typeof setTimeout>>();
let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  push: (message, kind = "info", durationMs = 4200) => {
    const id = nextId++;
    set((state) => ({
      toasts: [...state.toasts, { id, kind, message }].slice(-4),
    }));

    if (durationMs > 0) {
      timers.set(
        id,
        setTimeout(() => get().dismiss(id), durationMs),
      );
    }

    return id;
  },

  dismiss: (id) => {
    const timer = timers.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.delete(id);
    }
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
  },
}));
