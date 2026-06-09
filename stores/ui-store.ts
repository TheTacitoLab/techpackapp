import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UiState {
  /** Sidebar collapse state (stub for a future collapsible sidebar). */
  sidebarCollapsed: boolean;
  /** Per-section open/closed memory, keyed by section_key. */
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
      setSidebarCollapsed: (collapsed) =>
        set({ sidebarCollapsed: collapsed }),
      setSectionOpen: (key, open) =>
        set((state) => ({
          openSections: { ...state.openSections, [key]: open },
        })),
    }),
    { name: "techpack-ui" },
  ),
);
