import db from './client.js'

interface Migration {
  version: number
  sql: string
}

const migrations: Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS folders (
        id                    INTEGER PRIMARY KEY AUTOINCREMENT,
        absolute_path         TEXT NOT NULL UNIQUE,
        scan_interval_seconds INTEGER NOT NULL DEFAULT 300,
        enabled               INTEGER NOT NULL DEFAULT 1,
        created_at            TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE IF NOT EXISTS files (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        folder_id         INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
        relative_path     TEXT NOT NULL,
        filename          TEXT NOT NULL,
        extension         TEXT NOT NULL DEFAULT '',
        current_checksum  TEXT,
        status            TEXT NOT NULL DEFAULT 'backlog',
        is_deleted        INTEGER NOT NULL DEFAULT 0,
        version_count     INTEGER NOT NULL DEFAULT 0,
        last_event_type   TEXT,
        created_at        TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(folder_id, relative_path)
      );
      CREATE INDEX IF NOT EXISTS idx_files_folder_deleted ON files(folder_id, is_deleted);
      CREATE INDEX IF NOT EXISTS idx_files_folder_status  ON files(folder_id, status);
    `,
  },
  {
    version: 3,
    sql: `
      CREATE TABLE IF NOT EXISTS versions (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id             INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        version_number      INTEGER NOT NULL,
        checksum            TEXT,
        archive_path        TEXT,
        event_type          TEXT NOT NULL,
        size_bytes          INTEGER NOT NULL DEFAULT 0,
        ai_change_summary   TEXT,
        ai_content_summary  TEXT,
        ai_progress_impact  TEXT,
        created_at          TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_versions_file_id ON versions(file_id);
    `,
  },
  {
    version: 4,
    sql: `
      CREATE TABLE IF NOT EXISTS scans (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        folder_id       INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
        started_at      TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at    TEXT,
        files_added     INTEGER NOT NULL DEFAULT 0,
        files_modified  INTEGER NOT NULL DEFAULT 0,
        files_deleted   INTEGER NOT NULL DEFAULT 0,
        status          TEXT NOT NULL DEFAULT 'running',
        error_message   TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_scans_folder_started ON scans(folder_id, started_at);
    `,
  },
  {
    version: 5,
    sql: `
      CREATE TABLE IF NOT EXISTS project_summaries (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        scan_id             INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
        summary_text        TEXT NOT NULL,
        suggested_next_step TEXT,
        files_changed_count INTEGER NOT NULL DEFAULT 0,
        generated_at        TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
  {
    version: 6,
    sql: `
      CREATE TABLE IF NOT EXISTS ai_settings (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        provider    TEXT NOT NULL DEFAULT 'xinghe',
        base_url    TEXT NOT NULL DEFAULT '',
        api_key     TEXT NOT NULL DEFAULT '',
        model       TEXT NOT NULL DEFAULT '',
        temperature REAL NOT NULL DEFAULT 0.3,
        max_tokens  INTEGER NOT NULL DEFAULT 1000,
        enabled     INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
  {
    version: 7,
    // ALTER TABLE 在列已存在时会抛错，用 try/catch 保证幂等
    sql: `__v7_alter__`,
  },
  {
    version: 8,
    sql: `
      CREATE TABLE IF NOT EXISTS projects (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        folder_id   INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
        name        TEXT    NOT NULL,
        path        TEXT    NOT NULL,
        status      TEXT    NOT NULL DEFAULT 'active',
        created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        UNIQUE(folder_id, path)
      );
      CREATE INDEX IF NOT EXISTS idx_projects_folder ON projects(folder_id);
    `,
  },
  {
    version: 9,
    sql: `
      CREATE TABLE IF NOT EXISTS file_assignments (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        source_file_id  INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        dest_filename   TEXT    NOT NULL,
        copied_at       TEXT    NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_file_assignments_project ON file_assignments(project_id);
      CREATE INDEX IF NOT EXISTS idx_file_assignments_source  ON file_assignments(source_file_id);
    `,
  },
  {
    version: 10,
    sql: `__v10_project_kanban__`,
  },
  {
    version: 11,
    sql: `__v11_project_activity__`,
  },
  {
    version: 12,
    sql: `__v12_templates_messages__`,
  },
  {
    version: 13,
    sql: `__v13_chat_history__`,
  },
  {
    version: 14,
    sql: `__v14_template_source__`,
  },
  {
    version: 15,
    sql: `
      CREATE TABLE IF NOT EXISTS project_shares (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        token      TEXT NOT NULL UNIQUE,
        enabled    INTEGER NOT NULL DEFAULT 1,
        expires_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(project_id)
      );
      CREATE INDEX IF NOT EXISTS idx_project_shares_token ON project_shares(token);

      CREATE TABLE IF NOT EXISTS project_share_files (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        share_id      INTEGER NOT NULL REFERENCES project_shares(id) ON DELETE CASCADE,
        assignment_id INTEGER NOT NULL REFERENCES file_assignments(id) ON DELETE CASCADE,
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(share_id, assignment_id)
      );
      CREATE INDEX IF NOT EXISTS idx_project_share_files_share ON project_share_files(share_id);
    `,
  },
]

/**
 * 执行数据库迁移（幂等，启动时调用）
 */
export function runMigrations(): void {
  const currentVersion = (db.pragma('user_version', { simple: true }) as number) ?? 0

  const pending = migrations.filter(m => m.version > currentVersion)
  if (pending.length === 0) return

  const migrate = db.transaction(() => {
    for (const m of pending) {
      if (m.sql === '__v7_alter__') {
        // ALTER TABLE 不支持 IF NOT EXISTS，列已存在时 SQLite 会抛错
        try {
          db.exec(`ALTER TABLE folders ADD COLUMN folder_type TEXT NOT NULL DEFAULT 'source'`)
        } catch {
          // 列已存在，忽略
        }
      } else if (m.sql === '__v10_project_kanban__') {
        try {
          db.exec(`ALTER TABLE projects ADD COLUMN kanban_status TEXT NOT NULL DEFAULT 'backlog'`)
        } catch {
          // 列已存在，忽略
        }
        try {
          db.exec(`CREATE INDEX IF NOT EXISTS idx_projects_kanban ON projects(folder_id, kanban_status)`)
        } catch {
          // 忽略
        }
      } else if (m.sql === '__v11_project_activity__') {
        try {
          db.exec(`ALTER TABLE projects ADD COLUMN completed_at TEXT`)
        } catch {
          // 列已存在，忽略
        }
        try {
          db.exec(`ALTER TABLE projects ADD COLUMN completed_scope TEXT`)
        } catch {
          // 列已存在，忽略
        }
        db.exec(`
          CREATE TABLE IF NOT EXISTS project_events (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            event_type    TEXT NOT NULL,
            body          TEXT,
            metadata_json TEXT,
            created_at    TEXT NOT NULL DEFAULT (datetime('now'))
          );
          CREATE INDEX IF NOT EXISTS idx_project_events_project_created ON project_events(project_id, created_at DESC);

          CREATE TABLE IF NOT EXISTS app_settings (
            key        TEXT PRIMARY KEY,
            value      TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
          );
          INSERT OR IGNORE INTO app_settings (key, value) VALUES
            ('project_active_days', '7'),
            ('project_needs_review_days', '30');

          CREATE INDEX IF NOT EXISTS idx_projects_folder_path ON projects(folder_id, path);
          CREATE INDEX IF NOT EXISTS idx_versions_file_created ON versions(file_id, created_at DESC);
          CREATE INDEX IF NOT EXISTS idx_file_assignments_project_copied ON file_assignments(project_id, copied_at DESC);
        `)
      } else if (m.sql === '__v12_templates_messages__') {
        db.exec(`
          CREATE TABLE IF NOT EXISTS report_templates (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT NOT NULL,
            content    TEXT NOT NULL,
            is_default INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
          );

          CREATE TABLE IF NOT EXISTS messages (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            type          TEXT NOT NULL,
            title         TEXT NOT NULL,
            body          TEXT NOT NULL,
            project_id    INTEGER REFERENCES projects(id) ON DELETE SET NULL,
            metadata_json TEXT,
            status        TEXT NOT NULL DEFAULT 'unread',
            remind_at     TEXT,
            created_at    TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
          );
          CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status, created_at DESC);
          CREATE INDEX IF NOT EXISTS idx_messages_remind ON messages(remind_at) WHERE remind_at IS NOT NULL;
          CREATE INDEX IF NOT EXISTS idx_messages_project_type_created ON messages(project_id, type, created_at DESC);
        `)
      } else if (m.sql === '__v13_chat_history__') {
        db.exec(`
          CREATE TABLE IF NOT EXISTS chat_sessions (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            title      TEXT NOT NULL DEFAULT '新对话',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
          );

          CREATE TABLE IF NOT EXISTS chat_messages (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id     INTEGER NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
            role           TEXT NOT NULL,
            content        TEXT NOT NULL,
            citations_json TEXT,
            created_at     TEXT NOT NULL DEFAULT (datetime('now'))
          );
          CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at);
        `)
      } else if (m.sql === '__v14_template_source__') {
        // 给 report_templates 加 source_type 和 original_filename 两列
        try {
          db.exec(`ALTER TABLE report_templates ADD COLUMN source_type TEXT NOT NULL DEFAULT 'text'`)
        } catch { /* 列已存在，忽略 */ }
        try {
          db.exec(`ALTER TABLE report_templates ADD COLUMN original_filename TEXT`)
        } catch { /* 列已存在，忽略 */ }
      } else {
        db.exec(m.sql)
      }
    }
    const newVersion = pending[pending.length - 1].version
    db.pragma(`user_version = ${newVersion}`)
  })

  migrate()
  console.log(`[DB] Migrated from v${currentVersion} to v${pending[pending.length - 1].version}`)
}
