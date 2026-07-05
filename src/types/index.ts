export type KanbanStatus = 'backlog' | 'in-progress' | 'review' | 'done'
export type FileEventType = 'created' | 'modified' | 'deleted' | 'restored'
export type AIProviderName = 'xinghe' | 'ollama' | 'openai-compatible' | 'custom'
export type FolderType = 'source' | 'target'
export type ProjectStatus = 'active' | 'archived'
export type ProjectHealthStatus = 'active' | 'stalled' | 'needs_review' | 'completed'
export type ProjectEventType = 'update' | 'completed' | 'restored' | 'status_changed'

export interface Folder {
  id: number
  absolute_path: string
  scan_interval_seconds: number
  enabled: number
  folder_type: FolderType
  created_at: string
  updated_at: string
}

export interface ProjectFile {
  id: number
  folder_id: number
  relative_path: string
  filename: string
  extension: string
  current_checksum: string | null
  status: KanbanStatus
  is_deleted: number
  version_count: number
  last_event_type: FileEventType | null
  created_at: string
  updated_at: string
  absolute_path?: string
  ai_change_summary?: string | null
  ai_content_summary?: string | null
  ai_progress_impact?: string | null
}

export interface FileVersion {
  id: number
  file_id: number
  version_number: number
  checksum: string | null
  archive_path: string | null
  event_type: FileEventType
  size_bytes: number
  ai_change_summary: string | null
  ai_content_summary: string | null
  ai_progress_impact: string | null
  created_at: string
}

export interface AISettings {
  id?: number
  provider: AIProviderName
  base_url: string
  api_key: string
  model: string
  temperature: number
  max_tokens: number
  enabled: number
  created_at?: string
  updated_at?: string
}

export interface ProjectSummary {
  id: number
  scan_id: number
  summary_text: string
  suggested_next_step: string | null
  files_changed_count: number
  generated_at: string
  folder_id?: number
  started_at?: string
  files_added?: number
  files_modified?: number
  files_deleted?: number
}

export interface ScanRecord {
  id: number
  folder_id: number
  started_at: string
  completed_at: string | null
  files_added: number
  files_modified: number
  files_deleted: number
  status: 'running' | 'completed' | 'failed'
  error_message: string | null
}

export interface Project {
  id: number
  folder_id: number
  name: string
  path: string
  status: ProjectStatus
  kanban_status: KanbanStatus
  completed_at: string | null
  completed_scope: string | null
  folder_path?: string
  assignment_count?: number
  child_project_count?: number
  health_status?: ProjectHealthStatus
  health_reason?: string
  latest_activity_at?: string | null
  direct_latest_activity_at?: string | null
  latest_update?: ProjectEvent | null
  created_at: string
  updated_at: string
}

export interface ProjectEvent {
  id: number
  project_id: number
  event_type: ProjectEventType
  body: string | null
  metadata_json: string | null
  created_at: string
}

export interface ProjectStatusSettings {
  active_days: number
  needs_review_days: number
}

export interface FileAssignment {
  id: number
  source_file_id: number
  project_id: number
  dest_filename: string
  copied_at: string
  source_filename?: string
  source_relative_path?: string
}

export interface VersionContent {
  content: string
  isText: boolean
  truncated?: boolean
  message?: string
}

export interface ProjectShare {
  id?: number
  project_id?: number
  token: string | null
  enabled: boolean
  selected_assignment_ids: number[]
  created_at: string | null
  updated_at: string | null
  expires_at?: string | null
}

export interface ProjectShareFile {
  assignment_id: number
  dest_filename: string
  source_relative_path: string | null
  extension: string | null
  copied_at: string
  summary: string | null
  change_summary: string | null
  progress_impact: string | null
}

export interface PublicSharePayload {
  project: Pick<
    Project,
    | 'id'
    | 'name'
    | 'path'
    | 'status'
    | 'kanban_status'
    | 'completed_at'
    | 'health_status'
    | 'health_reason'
    | 'latest_activity_at'
    | 'direct_latest_activity_at'
    | 'assignment_count'
    | 'created_at'
    | 'updated_at'
  >
  events: ProjectEvent[]
  files: ProjectShareFile[]
  shared_at: string
}
