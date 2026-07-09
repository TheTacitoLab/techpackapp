import { create } from "zustand";
import { persist } from "zustand/middleware";

// UI-only state. The old active-brand / active-collection / show-archived
// selection model was retired with the Collections dashboard session —
// collections and the archive are real routes now (`/collections`,
// `/archive`), so navigation state lives in the URL. Stale keys persisted in
// existing browsers' localStorage are simply ignored by zustand's merge.
interface UiState {
  sidebarCollapsed: boolean;
  openSections: Record<string, boolean>;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSectionOpen: (key: string, open: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      openSections: {},
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setSectionOpen: (key, open) =>
        set((state) => ({
          openSections: { ...state.openSections, [key]: open },
        })),
    }),
    { name: "garspec-ui" },
  ),
);
