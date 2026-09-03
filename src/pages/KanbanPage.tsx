import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFolders } from '@/hooks/useFolders'
import { useProjects, useAddProjectEvent, useCompleteProject, useRestoreProject, useUpdateProject } from '@/hooks/useProjects'
import type { Project, ProjectHealthStatus } from '@/types'
import styles from './KanbanPage.module.css'

type ProjectTreeNode = Project & { children: ProjectTreeNode[] }
type HealthFilter = 'all' | ProjectHealthStatus

const HEALTH_LABELS: Record<ProjectHealthStatus, string> = {
  active: '活跃',
  stalled: '停滞',
  needs_review: '待确认',
  completed: '已结束',
}

function buildProjectTree(projects: Project[]): ProjectTreeNode[] {
  const nodes = new Map<string, ProjectTreeNode>()
  const roots: ProjectTreeNode[] = []

  projects.forEach(project => nodes.set(project.path, { ...project, children: [] }))

  Array.from(nodes.values())
    .sort((a, b) => a.path.localeCompare(b.path))
    .forEach(node => {
      const parts = node.path.split('/').filter(Boolean)
      let parent: ProjectTreeNode | undefined
      for (let i = parts.length - 1; i > 0; i--) {
        const parentPath = parts.slice(0, i).join('/')
        parent = nodes.get(parentPath)
        if (parent) break
      }
      if (parent) parent.children.push(node)
      else roots.push(node)
    })

  return roots
}

function formatDate(dateText?: string | null) {
  if (!dateText) return '暂无活动'
  return new Date(dateText.replace(' ', 'T')).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function isToday(dateText?: string | null) {
  if (!dateText) return false
  return new Date(dateText.replace(' ', 'T')).toDateString() === new Date().toDateString()
}

function ProjectNode({ node }: { node: ProjectTreeNode }) {
  const navigate = useNavigate()
  const addEvent = useAddProjectEvent()
  const complete = useCompleteProject()
  const restore = useRestoreProject()
  const updateProject = useUpdateProject()
  const [expanded, setExpanded] = useState(true)
  const [summaryExpanded, setSummaryExpanded] = useState(false)
  const [showUpdate, setShowUpdate] = useState(false)
  const [updateText, setUpdateText] = useState('')
  const [ownerDraft, setOwnerDraft] = useState(node.owner_name ?? '')
  const [collaboratorsDraft, setCollaboratorsDraft] = useState((node.collaborators ?? []).join('、'))
  const [nextStepDraft, setNextStepDraft] = useState(node.next_step ?? '')

  const health = node.health_status ?? 'needs_review'
  const hasChildren = node.children.length > 0
  const collaborators = node.collaborators ?? []
  const visibleCollaborators = collaborators.slice(0, 3)
  const hiddenCollaboratorCount = Math.max(collaborators.length - visibleCollaborators.length, 0)
  const isFollowUp = node.kanban_status === 'review'

  useEffect(() => {
    setOwnerDraft(node.owner_name ?? '')
    setCollaboratorsDraft((node.collaborators ?? []).join('、'))
    setNextStepDraft(node.next_step ?? '')
  }, [node.owner_name, node.collaborators, node.next_step])

  const handleSubmitUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!updateText.trim()) return
    await addEvent.mutateAsync({ projectId: node.id, body: updateText.trim() })
    setUpdateText('')
    setShowUpdate(false)
  }

  const handleSubmitWorkflow = async (e: React.FormEvent) => {
    e.preventDefault()
    const collaboratorsInput = collaboratorsDraft
      .split(/[、,，\n]/)
      .map(item => item.trim())
      .filter(Boolean)
    await updateProject.mutateAsync({
      id: node.id,
      input: {
        owner_name: ownerDraft.trim() || null,
        collaborators: collaboratorsInput,
        next_step: nextStepDraft.trim() || null,
      },
    })
  }

  const handleMarkFollowUp = async () => {
    if (isFollowUp) return
    await updateProject.mutateAsync({ id: node.id, input: { kanban_status: 'review' } })
  }

  const handleComplete = async () => {
    if (!confirm(`确认结束项目「${node.name}」？`)) return
    const includeChildren = hasChildren && confirm('是否同时结束所有子项目？')
    await complete.mutateAsync({ projectId: node.id, scope: includeChildren ? 'with_children' : 'current' })
  }

  const handleRestore = async () => {
    const includeChildren = hasChildren && confirm('是否同时恢复所有子项目？')
    await restore.mutateAsync({ projectId: node.id, scope: includeChildren ? 'with_children' : 'current' })
  }

  return (
    <div className={styles.treeNode}>
      <div className={styles.projectCard}>
        <div className={styles.projectMain} onClick={() => navigate(`/projects/${node.id}`)}>
          <div className={styles.projectTitleRow}>
            {hasChildren ? (
              <button
                className={styles.expandBtn}
                onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
                title={expanded ? '收起子项目' : '展开子项目'}
              >
                {expanded ? '▾' : '▸'}
              </button>
            ) : <span className={styles.expandSpacer} />}
            <strong>{node.name}</strong>
            <span className={`${styles.healthBadge} ${styles[`health_${health}`]}`}>{HEALTH_LABELS[health]}</span>
          </div>
          <div className={styles.projectPath}>📁 {node.path}</div>
          <div className={styles.workflowMeta}>
            <span>负责人：{node.owner_name || '未分配负责人'}</span>
            <span>下一步：{node.next_step || '暂无下一步'}</span>
          </div>
          <div className={styles.peopleRow}>
            {visibleCollaborators.length > 0 ? visibleCollaborators.map(person => (
              <span key={person} className={styles.personChip}>{person}</span>
            )) : <span className={styles.emptyChip}>暂无协作者</span>}
            {hiddenCollaboratorCount > 0 && <span className={styles.personChip}>+{hiddenCollaboratorCount}</span>}
          </div>
          <div className={styles.projectMeta}>
            <span>{node.health_reason ?? '暂无状态说明'}</span>
            <span>最近活动：{formatDate(node.latest_activity_at)}</span>
            <span>{node.assignment_count ?? 0} 个文件</span>
            {hasChildren && <span>{node.children.length} 个直接子项目</span>}
          </div>
          {node.latest_update?.body && (
            <div className={styles.latestUpdate}>最新动态：{node.latest_update.body}</div>
          )}
        </div>
        <div className={styles.projectActions}>
          <button onClick={() => setShowUpdate(v => !v)}>添加动态</button>
          <button
            className={isFollowUp ? styles.followUpActive : undefined}
            onClick={handleMarkFollowUp}
            disabled={isFollowUp || updateProject.isPending}
          >
            {isFollowUp ? '已待跟进' : '待跟进'}
          </button>
          <button onClick={() => setSummaryExpanded(v => !v)}>{summaryExpanded ? '收起摘要' : '展开摘要'}</button>
          {health === 'completed' ? (
            <button onClick={handleRestore} disabled={restore.isPending}>恢复</button>
          ) : (
            <button className={styles.dangerBtn} onClick={handleComplete} disabled={complete.isPending}>项目结束</button>
          )}
          <button onClick={() => navigate(`/projects/${node.id}`)}>详情</button>
        </div>
        {showUpdate && (
          <form className={styles.updateForm} onSubmit={handleSubmitUpdate}>
            <input value={updateText} onChange={e => setUpdateText(e.target.value)} placeholder="输入近期项目动态，如：进入谈判阶段" />
            <button type="submit" disabled={addEvent.isPending}>保存</button>
          </form>
        )}
        {summaryExpanded && (
          <div className={styles.summaryPanel}>
            <div className={styles.summaryGrid}>
              <div><span>健康说明</span><strong>{node.health_reason ?? '暂无状态说明'}</strong></div>
              <div><span>最新动态</span><strong>{node.latest_update?.body ?? '暂无动态'}</strong></div>
              <div><span>直接活动</span><strong>{formatDate(node.direct_latest_activity_at)}</strong></div>
              <div><span>累计内容</span><strong>{node.assignment_count ?? 0} 个文件 / {node.child_project_count ?? node.children.length} 个子项目</strong></div>
            </div>
            <form className={styles.workflowForm} onSubmit={handleSubmitWorkflow}>
              <label>
                负责人
                <input value={ownerDraft} onChange={e => setOwnerDraft(e.target.value)} placeholder="例如：张三" />
              </label>
              <label>
                协作者
                <input value={collaboratorsDraft} onChange={e => setCollaboratorsDraft(e.target.value)} placeholder="用顿号、逗号或换行分隔" />
              </label>
              <label>
                下一步
                <input value={nextStepDraft} onChange={e => setNextStepDraft(e.target.value)} placeholder="例如：确认需求清单" />
              </label>
              <button type="submit" disabled={updateProject.isPending}>保存工作流信息</button>
            </form>
          </div>
        )}
      </div>
      {expanded && hasChildren && (
        <div className={styles.children}>
          {node.children.map(child => <ProjectNode key={child.id} node={child} />)}
        </div>
      )}
    </div>
  )
}

export default function KanbanPage() {
  const { data: folders = [] } = useFolders()
  const targetFolders = folders.filter(f => f.folder_type === 'target')
  const [activeFolderId, setActiveFolderId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<HealthFilter>('all')

  const effectiveFolderId = activeFolderId ?? targetFolders[0]?.id ?? null
  const { data: projects = [], isLoading } = useProjects({ folderId: effectiveFolderId, includeCompleted: true })

  const overview = useMemo(() => {
    return {
      total: projects.length,
      active: projects.filter(project => project.health_status === 'active').length,
      stalled: projects.filter(project => project.health_status === 'stalled').length,
      needsReview: projects.filter(project => project.health_status === 'needs_review' || project.kanban_status === 'review').length,
      today: projects.filter(project => isToday(project.latest_activity_at)).length,
      completed: projects.filter(project => project.health_status === 'completed' || !!project.completed_at).length,
    }
  }, [projects])

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase()
    return projects.filter(project => {
      const matchesSearch = !q || project.name.toLowerCase().includes(q) || project.path.toLowerCase().includes(q)
      const matchesFilter = filter === 'all' || project.health_status === filter
      return matchesSearch && matchesFilter
    })
  }, [projects, search, filter])

  const tree = useMemo(() => buildProjectTree(filteredProjects), [filteredProjects])
  const statItems = [
    { label: '全部项目', value: overview.total, hint: '当前目标目录' },
    { label: '活跃', value: overview.active, hint: '近期有活动' },
    { label: '停滞', value: overview.stalled, hint: '需要推进' },
    { label: '待确认', value: overview.needsReview, hint: '含待跟进标记' },
    { label: '今日活动', value: overview.today, hint: '今天有更新' },
    { label: '已结束', value: overview.completed, hint: '可在卡片恢复' },
  ]

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1>项目看板</h1>
          <p>以项目树方式管理目标文件夹中的项目，识别停滞和待确认事项。</p>
        </div>
        <div className={styles.actions}>
          {targetFolders.length > 0 && (
            <select value={effectiveFolderId ?? ''} onChange={e => setActiveFolderId(Number(e.target.value))}>
              {targetFolders.map(folder => <option key={folder.id} value={folder.id}>{folder.absolute_path}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className={styles.statsGrid}>
        {statItems.map(item => (
          <div key={item.label} className={styles.statTile}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.hint}</small>
          </div>
        ))}
      </div>

      <div className={styles.toolbar}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索项目名或路径" />
        <select value={filter} onChange={e => setFilter(e.target.value as HealthFilter)}>
          <option value="all">全部</option>
          <option value="active">活跃</option>
          <option value="stalled">停滞</option>
          <option value="needs_review">待确认</option>
          <option value="completed">已结束</option>
        </select>
        <span className={styles.projectCount}>{filteredProjects.length} 个项目</span>
      </div>

      <div className={styles.tree}>
        {isLoading ? (
          <div className={styles.empty}>加载中...</div>
        ) : tree.length > 0 ? (
          tree.map(node => <ProjectNode key={node.id} node={node} />)
        ) : (
          <div className={styles.empty}>暂无项目。请先在文件归档页创建或选择目标项目。</div>
        )}
      </div>
    </div>
  )
}
