import { create } from 'zustand'

interface KanbanStore {
  activeFolderId: number | null
  searchQuery: string
  filterExtension: string
  setActiveFolderId: (id: number | null) => void
  setSearchQuery: (query: string) => void
  setFilterExtension: (extension: string) => void
}

export const useKanbanStore = create<KanbanStore>(set => ({
  activeFolderId: null,
  searchQuery: '',
  filterExtension: '',
  setActiveFolderId: id => set({ activeFolderId: id }),
  setSearchQuery: searchQuery => set({ searchQuery }),
  setFilterExtension: filterExtension => set({ filterExtension }),
}))
