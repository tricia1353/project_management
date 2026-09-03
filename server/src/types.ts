export type KanbanStatus = 'backlog' | 'in-progress' | 'review' | 'done'
export type FileEventType = 'created' | 'modified' | 'deleted' | 'restored'
export type ScanStatus = 'running' | 'completed' | 'failed'
export type AIProviderName = 'xinghe' | 'ollama' | 'openai-compatible' | 'custom'
export type FolderType = 'source' | 'target'
export type ProjectStatus = 'active' | 'archived'
export type ProjectHealthStatus = 'active' | 'stalled' | 'needs_review' | 'completed'
export type ProjectEventType = 'update' | 'completed' | 'restored' | 'status_changed'
export type FileProcessingStatus = 'pending' | 'archived' | 'ignored'

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
  mtime: number | null
  size: number | null
  status: KanbanStatus
  is_deleted: number
  version_count: number
  last_event_type: FileEventType | null
  processing_status: FileProcessingStatus
  last_scan_id: number | null
  ignored_at: string | null
  manual_suggestion?: string | null
  manual_suggestion_updated_at?: string | null
  version_group_id?: number | null
  version_group_source?: string | null
  created_at: string
  updated_at: string
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
  // 以下字段仅在按版本组聚合返回时（GET /files/:id/versions）附带
  source_file_id?: number
  source_relative_path?: string
  source_filename?: string
  is_current_file_version?: boolean
  series_version_number?: number
}

export interface FileVersionGroup {
  id: number
  canonical_name: string | null
  created_at: string
  updated_at: string
}

export interface VersionGroupCandidate {
  file_id: number
  filename: string
  relative_path: string
  folder_id: number
  version_group_id: number | null
  reason: 'filename_match' | 'checksum_match'
}

export interface VersionGroupEvent {
  id: number
  file_id: number
  from_group_id: number | null
  to_group_id: number
  event_type: 'manual_merge' | 'manual_split'
  reason: string | null
  created_at: string
}

export interface FileSuggestionHistoryEntry {
  id: number
  file_id: number
  manual_suggestion: string | null
  pushed_to_messages: number
  created_at: string
  source_filename?: string
  source_relative_path?: string
}

export interface ScanRecord {
  id: number
  folder_id: number
  started_at: string
  completed_at: string | null
  files_added: number
  files_modified: number
  files_deleted: number
  status: ScanStatus
  error_message: string | null
}

export interface ProjectSummary {
  id: number
  scan_id: number
  summary_text: string
  suggested_next_step: string | null
  files_changed_count: number
  generated_at: string
}

export interface FileAssignment {
  id: number
  source_file_id: number
  project_id: number
  dest_filename: string
  copied_at: string
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

export interface Project {
  id: number
  folder_id: number
  name: string
  path: string
  status: ProjectStatus
  kanban_status: KanbanStatus
  completed_at: string | null
  completed_scope: string | null
  owner_name?: string | null
  collaborators_json?: string | null
  collaborators?: string[]
  next_step?: string | null
  created_at: string
  updated_at: string
  folder_path?: string
  assignment_count?: number
  child_project_count?: number
  health_status?: ProjectHealthStatus
  health_reason?: string
  latest_activity_at?: string | null
  direct_latest_activity_at?: string | null
  latest_update?: ProjectEvent | null
  recent_files?: FileAssignment[]
}

export interface AISettings {
  id: number
  provider: AIProviderName
  base_url: string
  api_key: string
  model: string
  temperature: number
  max_tokens: number
  enabled: number
  created_at: string
  updated_at: string
}

export interface FeishuSettings {
  id: number
  app_id: string
  app_secret: string
  document_id: string
  owner_open_id: string
  base_url: string
  enabled: number
  created_at: string
  updated_at: string
}
