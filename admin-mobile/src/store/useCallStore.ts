import { create } from "zustand";
import type { ActiveCall } from "../types";

interface CallState {
  activeCalls: ActiveCall[];
  isLoading: boolean;
  filterLanguage: string;
  setActiveCalls: (calls: ActiveCall[]) => void;
  setLoading: (isLoading: boolean) => void;
  setFilterLanguage: (lang: string) => void;
}

export const useCallStore = create<CallState>((set) => ({
  activeCalls: [],
  isLoading: false,
  filterLanguage: "ALL",
  setActiveCalls: (activeCalls) => set({ activeCalls }),
  setLoading: (isLoading) => set({ isLoading }),
  setFilterLanguage: (filterLanguage) => set({ filterLanguage }),
}));
