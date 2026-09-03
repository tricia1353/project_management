import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Layout from './components/common/Layout'
import CosmicBackground from './components/common/CosmicBackground'
import WorkspacePage from './pages/WorkspacePage'
import KanbanPage from './pages/KanbanPage'
import FileDetailPage from './pages/FileDetailPage'
import ProjectDetailPage from './pages/ProjectDetailPage'
import SettingsPage from './pages/SettingsPage'
import ChatPage from './pages/ChatPage'
import MessagesPage from './pages/MessagesPage'
import ReportsPage from './pages/ReportsPage'
import SharePage from './pages/SharePage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 10_000, retry: 1 },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <CosmicBackground />
      <BrowserRouter>
        <Routes>
          <Route path="/share/:token" element={<SharePage />} />
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/workspace" replace />} />
            <Route path="/workspace" element={<WorkspacePage />} />
            <Route path="/kanban" element={<KanbanPage />} />
            <Route path="/files/:id" element={<FileDetailPage />} />
            <Route path="/files/:id/versions/:versionId" element={<FileDetailPage />} />
            <Route path="/projects/:id" element={<ProjectDetailPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
