import { create } from "zustand";

export interface ConfirmOptions {
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface ConfirmState extends ConfirmOptions {
  open: boolean;
  resolve: ((value: boolean) => void) | null;
  requestConfirm: (options: ConfirmOptions) => Promise<boolean>;
  respond: (value: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  title: "",
  message: "",
  detail: "",
  confirmLabel: "Yes",
  cancelLabel: "No",
  resolve: null,

  requestConfirm: (options) => {
    if (get().open) {
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      set({
        open: true,
        title: options.title,
        message: options.message,
        detail: options.detail ?? "",
        confirmLabel: options.confirmLabel ?? "Yes",
        cancelLabel: options.cancelLabel ?? "No",
        resolve,
      });
    });
  },

  respond: (value) => {
    const { resolve } = get();
    if (resolve) {
      resolve(value);
    }
    set({ open: false, resolve: null });
  },
}));
