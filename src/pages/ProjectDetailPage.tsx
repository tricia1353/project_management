import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useProject, useProjectAssignments, useProjectEvents, useAddProjectEvent, useCompleteProject, useRestoreProject } from '@/hooks/useProjects'
import { useProjectShare, useUpdateProjectShare, useResetProjectShareToken } from '@/hooks/useShare'
import type { KanbanStatus, ProjectHealthStatus } from '@/types'
import styles from './ProjectDetailPage.module.css'

const HEALTH_LABELS: Record<ProjectHealthStatus, string> = {
  active: '活跃',
  stalled: '停滞',
  needs_review: '待确认',
  completed: '已结束',
}

const HEALTH_BADGE: Record<ProjectHealthStatus, string> = {
  active: styles.badgeActive,
  stalled: styles.badgeStalled,
  needs_review: styles.badgeNeedsReview,
  completed: styles.badgeCompleted,
}

const EVENT_LABELS: Record<string, string> = {
  update: '📝',
  completed: '🏁',
  restored: '↩',
  status_changed: '🔄',
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const projectId = Number(id)
  const navigate = useNavigate()

  const { data: project, isLoading } = useProject(projectId)
  const { data: assignments = [] } = useProjectAssignments(projectId)
  const { data: events = [] } = useProjectEvents(projectId)
  const addEvent = useAddProjectEvent()
  const complete = useCompleteProject()
  const restore = useRestoreProject()

  const { data: shareConfig } = useProjectShare(projectId)
  const updateShare = useUpdateProjectShare()
  const resetToken = useResetProjectShareToken()

  const [updateText, setUpdateText] = useState('')
  const [shareEnabled, setShareEnabled] = useState(false)
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<number[]>([])
  const [shareSaved, setShareSaved] = useState(false)

  useEffect(() => {
    if (shareConfig) {
      setShareEnabled(shareConfig.enabled)
      setSelectedAssignmentIds(shareConfig.selected_assignment_ids ?? [])
    }
  }, [shareConfig])

  if (isLoading) return <div className={styles.page}><p>加载中…</p></div>
  if (!project) return <div className={styles.page}><p>项目不存在。</p></div>

  const health = project.health_status ?? 'needs_review'
  const hasChildren = (project.child_project_count ?? 0) > 0
  const shareUrl = shareConfig?.token ? `${window.location.origin}/share/${shareConfig.token}` : ''

  const handleSubmitUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!updateText.trim()) return
    await addEvent.mutateAsync({ projectId, body: updateText.trim() })
    setUpdateText('')
  }

  const handleComplete = async () => {
    if (!confirm(`确认结束项目「${project.name}」？`)) return
    const includeChildren = hasChildren && confirm('是否同时结束所有子项目？')
    await complete.mutateAsync({ projectId, scope: includeChildren ? 'with_children' : 'current' })
  }

  const handleRestore = async () => {
    const includeChildren = hasChildren && confirm('是否同时恢复所有子项目？')
    await restore.mutateAsync({ projectId, scope: includeChildren ? 'with_children' : 'current' })
  }

  const handleSaveShare = async () => {
    await updateShare.mutateAsync({ projectId, input: { enabled: shareEnabled, assignmentIds: selectedAssignmentIds } })
    setShareSaved(true)
    setTimeout(() => setShareSaved(false), 2000)
  }

  const handleResetToken = async () => {
    if (!confirm('重置后当前分享链接将立即失效，对方需要使用新链接。确认重置？')) return
    await resetToken.mutateAsync(projectId)
  }

  const handleToggleAssignment = (assignmentId: number) => {
    setSelectedAssignmentIds(prev =>
      prev.includes(assignmentId) ? prev.filter(x => x !== assignmentId) : [...prev, assignmentId],
    )
  }

  const handleCopyLink = () => {
    if (!shareUrl) return
    navigator.clipboard.writeText(shareUrl)
  }

  return (
    <div className={styles.page}>
      <button className={styles.back} onClick={() => navigate('/kanban')}>← 返回看板</button>

      <div className={styles.header}>
        <div>
          <h1>{project.name}</h1>
          <p>{project.folder_path ? `${project.folder_path}/${project.path}` : project.path}</p>
          <div className={styles.badges}>
            <span className={`${styles.badge} ${HEALTH_BADGE[health]}`}>
              {HEALTH_LABELS[health]}
            </span>
            {project.health_reason && <span className={styles.healthReason}>{project.health_reason}</span>}
            {project.status === 'archived' && <span className={`${styles.badge} ${styles.badgeCompleted}`}>已归档</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-start', marginTop: 6 }}>
          {health === 'completed' ? (
            <button className={`${styles.statusBtn} ${styles.statusBtnInProgress}`} onClick={handleRestore}>↩ 恢复项目</button>
          ) : (
            <button className={`${styles.statusBtn} ${styles.statusBtnBacklog}`} onClick={handleComplete}>🏁 结束项目</button>
          )}
        </div>
      </div>

      {/* 基本信息 */}
      <div className={styles.section}>
        <h2>项目信息</h2>
        <div className={styles.grid}>
          <div><strong>项目名称</strong><span>{project.name}</span></div>
          <div><strong>路径</strong><span>{project.path}</span></div>
          <div><strong>最近活动</strong><span>{project.latest_activity_at ? new Date(project.latest_activity_at.replace(' ', 'T')).toLocaleString('zh-CN') : '暂无'}</span></div>
          <div><strong>直接文件活动</strong><span>{project.direct_latest_activity_at ? new Date(project.direct_latest_activity_at.replace(' ', 'T')).toLocaleString('zh-CN') : '暂无'}</span></div>
          <div><strong>归档文件数</strong><span>{project.assignment_count ?? assignments.length}</span></div>
          {hasChildren && <div><strong>子项目数</strong><span>{project.child_project_count}</span></div>}
          <div><strong>创建时间</strong><span>{new Date(project.created_at).toLocaleString('zh-CN')}</span></div>
          <div><strong>最后更新</strong><span>{new Date(project.updated_at).toLocaleString('zh-CN')}</span></div>
          {project.completed_at && <div><strong>结束时间</strong><span>{new Date(project.completed_at.replace(' ', 'T')).toLocaleString('zh-CN')}</span></div>}
        </div>
      </div>

      {/* 添加动态 */}
      <div className={styles.section}>
        <h2>添加动态</h2>
        <form onSubmit={handleSubmitUpdate} style={{ display: 'flex', gap: 8 }}>
          <input
            style={{ flex: 1, border: '1px solid #d7dce7', borderRadius: 8, padding: '8px 12px' }}
            value={updateText}
            onChange={e => setUpdateText(e.target.value)}
            placeholder="输入项目近期动态，如：进入谈判阶段、等待客户反馈…"
          />
          <button type="submit" className={styles.statusBtn} style={{ background: '#2563eb', color: 'white' }} disabled={addEvent.isPending}>
            保存
          </button>
        </form>
      </div>

      {/* 项目时间线 */}
      <div className={styles.section}>
        <h2>项目时间线</h2>
        {events.length === 0 ? (
          <div className={styles.empty}>暂无动态记录。</div>
        ) : (
          <div className={styles.timeline}>
            {events.map(event => (
              <div key={event.id} className={styles.timelineItem}>
                <span className={styles.timelineIcon}>{EVENT_LABELS[event.event_type] ?? '📌'}</span>
                <div className={styles.timelineContent}>
                  <div className={styles.timelineBody}>{event.body ?? event.event_type}</div>
                  <div className={styles.timelineTime}>{new Date(event.created_at.replace(' ', 'T')).toLocaleString('zh-CN')}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 归档文件列表 */}
      <div className={styles.section}>
        <h2>归档文件（{assignments.length}）</h2>
        {assignments.length === 0 ? (
          <div className={styles.empty}>暂无归档文件，请在工作台将文件拖入此项目。</div>
        ) : (
          <div className={styles.assignmentList}>
            {assignments.map(a => (
              <div key={a.id} className={styles.assignmentItem}
                onClick={() => a.source_file_id && navigate(`/files/${a.source_file_id}`)}
                style={{ cursor: a.source_file_id ? 'pointer' : 'default' }}
              >
                <div className={styles.assignmentName}>{a.dest_filename}</div>
                <div className={styles.assignmentTime}>{new Date(a.copied_at).toLocaleDateString('zh-CN')}</div>
                {a.source_relative_path && (
                  <div className={styles.assignmentSrc}>来源：{a.source_relative_path}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 公开分享 */}
      <div className={styles.section}>
        <h2>公开分享</h2>
        <div className={styles.shareToggle}>
          <label className={styles.shareLabel}>
            <input
              type="checkbox"
              checked={shareEnabled}
              onChange={e => setShareEnabled(e.target.checked)}
            />
            <span>公开此项目进展</span>
          </label>
        </div>

        {assignments.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <p className={styles.shareSectionTitle}>可公开的归档文件</p>
            <div className={styles.shareFileList}>
              {assignments.map(a => (
                <label key={a.id} className={styles.shareFileItem}>
                  <input
                    type="checkbox"
                    checked={selectedAssignmentIds.includes(a.id)}
                    onChange={() => handleToggleAssignment(a.id)}
                  />
                  <span>{a.dest_filename}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className={styles.statusBtn}
            style={{ background: '#2563eb', color: 'white' }}
            onClick={handleSaveShare}
            disabled={updateShare.isPending}
          >
            {shareSaved ? '✓ 已保存' : '保存设置'}
          </button>
          {shareConfig?.token && (
            <button
              className={styles.statusBtn}
              style={{ background: '#fee2e2', color: '#b91c1c' }}
              onClick={handleResetToken}
              disabled={resetToken.isPending}
            >
              重置链接
            </button>
          )}
        </div>

        {shareConfig?.token && shareConfig.enabled && shareUrl && (
          <div className={styles.shareLink}>
            <span className={styles.shareLinkUrl}>{shareUrl}</span>
            <button className={styles.shareCopyBtn} onClick={handleCopyLink}>复制</button>
          </div>
        )}

        <p className={styles.shareNotice}>
          ⚠️ 分享链接可供任何持有者访问，仅开放项目基本进展和已勾选文件的预览。公网访问需要本机服务保持运行，并通过 Cloudflare Tunnel 等工具暴露到公网。
        </p>
      </div>
    </div>
  )
}
