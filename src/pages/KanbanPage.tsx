import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFolders } from '@/hooks/useFolders'
import { useProjects, useAddProjectEvent, useCompleteProject, useRestoreProject } from '@/hooks/useProjects'
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

  for (const project of projects) nodes.set(project.path, { ...project, children: [] })
  for (const node of nodes.values()) {
    const parentPath = node.path.includes('/') ? node.path.split('/').slice(0, -1).join('/') : ''
    const parent = parentPath ? nodes.get(parentPath) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  const sortNodes = (items: ProjectTreeNode[]) => {
    items.sort((a, b) => a.path.localeCompare(b.path, 'zh-Hans-CN'))
    items.forEach(item => sortNodes(item.children))
  }
  sortNodes(roots)
  return roots
}

function formatDate(dateText?: string | null) {
  if (!dateText) return '暂无活动'
  return new Date(dateText.replace(' ', 'T')).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function ProjectNode({ node }: { node: ProjectTreeNode }) {
  const navigate = useNavigate()
  const addEvent = useAddProjectEvent()
  const complete = useCompleteProject()
  const restore = useRestoreProject()
  const [expanded, setExpanded] = useState(true)
  const [showUpdate, setShowUpdate] = useState(false)
  const [updateText, setUpdateText] = useState('')

  const health = node.health_status ?? 'needs_review'
  const hasChildren = node.children.length > 0

  const handleSubmitUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!updateText.trim()) return
    await addEvent.mutateAsync({ projectId: node.id, body: updateText.trim() })
    setUpdateText('')
    setShowUpdate(false)
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
          {health === 'completed' ? (
            <button onClick={handleRestore}>恢复</button>
          ) : (
            <button className={styles.dangerBtn} onClick={handleComplete}>项目结束</button>
          )}
          <button onClick={() => navigate(`/projects/${node.id}`)}>详情</button>
        </div>
        {showUpdate && (
          <form className={styles.updateForm} onSubmit={handleSubmitUpdate}>
            <input value={updateText} onChange={e => setUpdateText(e.target.value)} placeholder="输入近期项目动态，如：进入谈判阶段" />
            <button type="submit" disabled={addEvent.isPending}>保存</button>
          </form>
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
  const includeCompleted = filter === 'all' || filter === 'completed'
  const { data: projects = [], isLoading } = useProjects({ folderId: effectiveFolderId, status: 'active', includeCompleted })

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase()
    return projects.filter(project => {
      const matchesText = !q || project.name.toLowerCase().includes(q) || project.path.toLowerCase().includes(q)
      const matchesHealth = filter === 'all' || project.health_status === filter
      return matchesText && matchesHealth
    })
  }, [projects, search, filter])

  const tree = useMemo(() => buildProjectTree(filteredProjects), [filteredProjects])

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1>项目看板</h1>
          <p>以项目树查看活跃度、近期动态和结束状态。</p>
        </div>
        <div className={styles.actions}>
          {targetFolders.length > 1 && (
            <select value={effectiveFolderId ?? ''} onChange={e => setActiveFolderId(Number(e.target.value))}>
              {targetFolders.map(folder => <option key={folder.id} value={folder.id}>{folder.absolute_path}</option>)}
            </select>
          )}
        </div>
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

      {targetFolders.length === 0 ? (
        <div className={styles.empty}>请先到设置页添加目标文件夹，再到工作台创建项目。</div>
      ) : isLoading ? (
        <div className={styles.empty}>加载中…</div>
      ) : tree.length === 0 ? (
        <div className={styles.empty}>暂无匹配项目。</div>
      ) : (
        <div className={styles.tree}>
          {tree.map(node => <ProjectNode key={node.id} node={node} />)}
        </div>
      )}
    </div>
  )
}
