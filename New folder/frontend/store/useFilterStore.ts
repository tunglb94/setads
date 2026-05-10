import { create } from "zustand";
import { persist } from "zustand/middleware";

export type DateRangeOption = 1 | 3 | 7 | 30;

interface FilterState {
  dateRange: DateRangeOption;
  statusFilter: "ALL" | "ACTIVE" | "PAUSED";
  searchQuery: string;
  setDateRange: (days: DateRangeOption) => void;
  setStatusFilter: (status: "ALL" | "ACTIVE" | "PAUSED") => void;
  setSearchQuery: (q: string) => void;
}

export const useFilterStore = create<FilterState>()(
  persist(
    (set) => ({
      dateRange: 3,
      statusFilter: "ALL",
      searchQuery: "",
      setDateRange: (dateRange) => set({ dateRange }),
      setStatusFilter: (statusFilter) => set({ statusFilter }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
    }),
    { name: "superadmin-filters" }
  )
);
