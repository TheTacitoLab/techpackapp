import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UiState {
  sidebarCollapsed: boolean;
  openSections: Record<string, boolean>;
  activeBrandId: string | null;
  activeCollectionId: string | null;
  showArchived: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSectionOpen: (key: string, open: boolean) => void;
  setActiveBrandId: (id: string | null) => void;
  setActiveCollectionId: (id: string | null) => void;
  setShowArchived: (v: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      openSections: {},
      activeBrandId: null,
      activeCollectionId: null,
      showArchived: false,
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setSectionOpen: (key, open) =>
        set((state) => ({
          openSections: { ...state.openSections, [key]: open },
        })),
      setActiveBrandId: (id) => set({ activeBrandId: id }),
      setActiveCollectionId: (id) => set({ activeCollectionId: id }),
      setShowArchived: (v) => set({ showArchived: v }),
    }),
    { name: "techpack-ui" },
  ),
);

// Convenience selectors for the active-brand context.
export const useActiveBrand = () => useUiStore((s) => s.activeBrandId);
export const useSetActiveBrand = () => useUiStore((s) => s.setActiveBrandId);
