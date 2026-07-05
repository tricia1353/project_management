import { useParams } from 'react-router-dom'
import { usePublicShare } from '@/hooks/useShare'
import styles from './SharePage.module.css'

const HEALTH_LABELS: Record<string, string> = {
  active: '活跃',
  stalled: '停滞',
  needs_review: '待确认',
  completed: '已结束',
}

const KANBAN_LABELS: Record<string, string> = {
  backlog: '待处理',
  'in-progress': '进行中',
  review: '审核中',
  done: '已完成',
}

const EVENT_ICONS: Record<string, string> = {
  update: '📝',
  completed: '🏁',
  restored: '↩',
  status_changed: '🔄',
}

function ExtBadge({ ext }: { ext: string | null }) {
  const label = ext ? (ext.startsWith('.') ? ext.slice(1) : ext).toUpperCase() : 'FILE'
  return <span className={styles.extBadge}>{label}</span>
}

export default function SharePage() {
  const { token } = useParams<{ token: string }>()
  const { data, isLoading, isError } = usePublicShare(token ?? null)

  if (!token) {
    return <div className={styles.notFound}>无效的分享链接。</div>
  }

  if (isLoading) {
    return (
      <div className={styles.shell}>
        <div className={styles.loading}>加载中…</div>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className={styles.shell}>
        <div className={styles.notFound}>
          <div className={styles.notFoundIcon}>🔒</div>
          <h2>分享链接不可用</h2>
          <p>该链接已失效或不存在。请联系项目负责人获取最新链接。</p>
        </div>
      </div>
    )
  }

  const { project, events, files, shared_at } = data
  const health = project.health_status ?? 'needs_review'

  return (
    <div className={styles.shell}>
      <div className={styles.page}>
        <div className={styles.header}>
          <div>
            <div className={styles.breadcrumb}>项目进展共享</div>
            <h1 className={styles.title}>{project.name}</h1>
            <div className={styles.badges}>
              <span className={`${styles.badge} ${styles[`health_${health}`] ?? ''}`}>
                {HEALTH_LABELS[health] ?? health}
              </span>
              <span className={`${styles.badge} ${styles.badgeKanban}`}>
                {KANBAN_LABELS[project.kanban_status] ?? project.kanban_status}
              </span>
            </div>
          </div>
          <div className={styles.meta}>
            <span>最近更新：{project.latest_activity_at
              ? new Date(project.latest_activity_at.replace(' ', 'T')).toLocaleString('zh-CN')
              : new Date(project.updated_at).toLocaleString('zh-CN')}
            </span>
            <span>发布时间：{new Date(shared_at.replace(' ', 'T')).toLocaleString('zh-CN')}</span>
          </div>
        </div>

        <div className={styles.statsRow}>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{project.assignment_count ?? 0}</div>
            <div className={styles.statLabel}>归档文件</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{files.length}</div>
            <div className={styles.statLabel}>公开文件</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{events.length}</div>
            <div className={styles.statLabel}>动态记录</div>
          </div>
          {project.completed_at && (
            <div className={styles.statCard}>
              <div className={styles.statValue}>🏁</div>
              <div className={styles.statLabel}>已结束</div>
            </div>
          )}
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>项目动态</h2>
          {events.length === 0 ? (
            <div className={styles.empty}>暂无动态记录。</div>
          ) : (
            <div className={styles.timeline}>
              {events.map(event => (
                <div key={event.id} className={styles.timelineItem}>
                  <span className={styles.timelineIcon}>{EVENT_ICONS[event.event_type] ?? '📌'}</span>
                  <div className={styles.timelineContent}>
                    <div className={styles.timelineBody}>{event.body ?? event.event_type}</div>
                    <div className={styles.timelineTime}>
                      {new Date(event.created_at.replace(' ', 'T')).toLocaleString('zh-CN')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>公开文件（{files.length}）</h2>
          {files.length === 0 ? (
            <div className={styles.empty}>负责人暂未公开任何文件。</div>
          ) : (
            <div className={styles.fileList}>
              {files.map(file => (
                <div key={file.assignment_id} className={styles.fileCard}>
                  <div className={styles.fileHeader}>
                    <ExtBadge ext={file.extension} />
                    <div className={styles.fileTitleBlock}>
                      <div className={styles.fileName}>{file.dest_filename}</div>
                      {file.source_relative_path && (
                        <div className={styles.fileSrc}>来源：{file.source_relative_path}</div>
                      )}
                    </div>
                    <div className={styles.fileTime}>{new Date(file.copied_at.replace(' ', 'T')).toLocaleDateString('zh-CN')}</div>
                  </div>
                  <div className={styles.fileSummary}>
                    <strong>文件梗概</strong>
                    <p>{file.summary || file.change_summary || file.progress_impact || '暂无梗概。'}</p>
                  </div>
                  {(file.change_summary || file.progress_impact) && (
                    <div className={styles.fileExtraSummary}>
                      {file.change_summary && <p><span>变更：</span>{file.change_summary}</p>}
                      {file.progress_impact && <p><span>影响：</span>{file.progress_impact}</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.footer}>此页面为只读视图，仅展示项目负责人授权公开的信息。</div>
      </div>
    </div>
  )
}
