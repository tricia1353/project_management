import { useState, useMemo, useRef, useEffect, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable,
} from '@dnd-kit/core'
import { useFolders, useScanFolder, useScans } from '@/hooks/useFolders'
import { useFiles, useIgnoreFile, useRestoreFile } from '@/hooks/useFiles'
import {
  useProjects, useCreateProject, useDeleteProject, useAssignFile,
  useFinalizeProject, useArchiveProject, useUnarchiveProject,
  useProjectAssignments,
} from '@/hooks/useProjects'
import { SuggestionDrawer } from '@/components/SuggestionDrawer'
import { streamSuggestAssignments, type AssignmentSuggestion } from '@/api/ai'
import type { FileAssignment, Folder, Project, ProjectFile } from '@/types'
import styles from './WorkspacePage.module.css'

type ProjectTreeNode = Project & { children: ProjectTreeNode[] }

function buildProjectTree(projects: Project[]): ProjectTreeNode[] {
  const nodes = new Map<string, ProjectTreeNode>()
  const roots: ProjectTreeNode[] = []

  for (const project of projects) {
    nodes.set(project.path, { ...project, children: [] })
  }

  for (const node of nodes.values()) {
    const parentPath = node.path.includes('/') ? node.path.split('/').slice(0, -1).join('/') : ''
    const parent = parentPath ? nodes.get(parentPath) : undefined
    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  const sortByPath = (a: ProjectTreeNode, b: ProjectTreeNode) => a.path.localeCompare(b.path, 'zh-Hans-CN')
  const sortNodes = (items: ProjectTreeNode[]) => {
    items.sort(sortByPath)
    items.forEach(item => sortNodes(item.children))
  }
  sortNodes(roots)

  return roots
}

// ─── 左侧：可拖拽文件卡 ──────────────────────────────────────────────────

function DraggableFileCard({ file, onIgnore, onRestore }: {
  file: ProjectFile
  onIgnore?: (fileId: number) => void
  onRestore?: (fileId: number) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `file-${file.id}`,
    data: { fileId: file.id },
    disabled: file.processing_status === 'ignored',
  })
  const style: CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} className={styles.fileCard} style={style} {...attributes} {...listeners}>
      <div className={styles.fileName}>{file.filename}</div>
      <div className={styles.fileMeta}>
        <span>{file.extension || '无扩展名'}</span>
        <span>{file.relative_path.split('/').slice(0, -1).join('/') || '根目录'}</span>
      </div>
      {(onIgnore || onRestore) && (
        <div className={styles.fileCardActions}>
          {onIgnore && (
            <button
              type="button"
              className={styles.btnIgnore}
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onIgnore(file.id) }}
            >
              忽略
            </button>
          )}
          {onRestore && (
            <button
              type="button"
              className={styles.btnRestore}
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onRestore(file.id) }}
            >
              ↩ 恢复
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── 拖拽预览气泡 ────────────────────────────────────────────────────────

function DragFilePreview({ file }: { file: ProjectFile }) {
  return (
    <div className={`${styles.fileCard} ${styles.dragPreview}`}>
      <div className={styles.fileName}>{file.filename}</div>
      <div className={styles.fileMeta}>
        <span>{file.extension || '无扩展名'}</span>
        <span>{file.relative_path.split('/').slice(0, -1).join('/') || '根目录'}</span>
      </div>
    </div>
  )
}

// ─── 左侧面板：单个来源文件夹的批次选择 ────────────────────────────────────

function SourceFolderGroup({
  folder,
  search,
  extFilter,
  viewMode,
  scan,
  onIgnore,
  onRestore,
}: {
  folder: Folder
  search: string
  extFilter: string
  viewMode: 'pending' | 'ignored'
  scan: ReturnType<typeof useScanFolder>
  onIgnore: (fileId: number) => void
  onRestore: (fileId: number) => void
}) {
  const { data: scans = [] } = useScans(folder.id)
  const completedScans = useMemo(() => scans.filter(s => s.status === 'completed'), [scans])
  const [selectedScanId, setSelectedScanId] = useState<number | null>(null)

  // 默认选中该文件夹最近一次已完成的扫描批次
  useEffect(() => {
    if (completedScans.length === 0) {
      setSelectedScanId(null)
      return
    }
    setSelectedScanId(prev => {
      if (prev && completedScans.some(s => s.id === prev)) return prev
      return completedScans[0].id
    })
  }, [completedScans])

  const filesQuery = useFiles({
    folderId: folder.id,
    scanId: viewMode === 'pending' ? selectedScanId : undefined,
    processingStatus: viewMode,
    search: search || undefined,
    extension: extFilter || undefined,
  })
  const files: ProjectFile[] = filesQuery.data ?? []

  return (
    <div className={styles.folderGroup}>
      <div className={styles.folderGroupHeader}>
        <span>{folder.absolute_path.split('/').pop()}</span>
        <button
          className={styles.btnScan}
          onClick={() => scan.mutate(folder.id)}
          disabled={scan.isPending}
        >
          {scan.isPending ? '扫描中…' : '扫描'}
        </button>
      </div>

      {viewMode === 'pending' && (
        completedScans.length === 0 ? (
          <div className={styles.emptyGroup}>暂无扫描记录，请先扫描。</div>
        ) : (
          <div className={styles.batchSelectRow}>
            <select
              className={styles.selectInput}
              value={selectedScanId ?? ''}
              onChange={e => setSelectedScanId(Number(e.target.value))}
            >
              {completedScans.map(s => (
                <option key={s.id} value={s.id}>
                  {new Date(s.started_at).toLocaleString()} · 新增{s.files_added} 修改{s.files_modified} 删除{s.files_deleted} · 待处理{s.pending_count ?? 0}
                </option>
              ))}
            </select>
          </div>
        )
      )}

      <div className={styles.fileList}>
        {files.length === 0 ? (
          <div className={styles.emptyGroup}>
            {viewMode === 'ignored' ? '暂无已忽略文件。' : '暂无待处理文件，请先扫描。'}
          </div>
        ) : (
          files.map(file => (
            <DraggableFileCard
              key={file.id}
              file={file}
              onIgnore={viewMode === 'pending' ? onIgnore : undefined}
              onRestore={viewMode === 'ignored' ? onRestore : undefined}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ─── 左侧面板 ────────────────────────────────────────────────────────────

function ScanPoolPanel() {
  const { data: sourceFolders = [] } = useFolders()
  const [search, setSearch] = useState('')
  const [extFilter, setExtFilter] = useState('')
  const [viewMode, setViewMode] = useState<'pending' | 'ignored'>('pending')
  const scan = useScanFolder()
  const ignoreFile = useIgnoreFile()
  const restoreFile = useRestoreFile()

  const srcFolders = sourceFolders.filter(f => f.folder_type === 'source')

  const allPendingFiles = useFiles({ processingStatus: 'pending' })
  const totalPending = (allPendingFiles.data ?? []).filter(
    f => srcFolders.some(sf => sf.id === f.folder_id),
  ).length

  const extensions = useMemo(() => {
    const files = allPendingFiles.data ?? []
    return Array.from(new Set(files.map(f => f.extension).filter(Boolean))).sort()
  }, [allPendingFiles.data])

  async function handleIgnore(fileId: number) {
    try {
      await ignoreFile.mutateAsync(fileId)
    } catch (err) {
      alert(err instanceof Error ? err.message : '忽略失败')
    }
  }

  async function handleRestore(fileId: number) {
    try {
      await restoreFile.mutateAsync(fileId)
    } catch (err) {
      alert(err instanceof Error ? err.message : '恢复失败')
    }
  }

  return (
    <div className={styles.scanPanel}>
      <div className={styles.panelHeader}>
        <h2>扫描池</h2>
        <span className={styles.badge}>{totalPending} 个待处理</span>
      </div>
      <div className={styles.filters}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="搜索文件名"
          className={styles.searchInput}
        />
        <select value={extFilter} onChange={e => setExtFilter(e.target.value)} className={styles.selectInput}>
          <option value="">全部类型</option>
          {extensions.map(ext => <option key={ext} value={ext}>{ext}</option>)}
        </select>
      </div>
      <div className={styles.viewToggle}>
        <button
          type="button"
          className={viewMode === 'pending' ? styles.viewTabActive : styles.viewTab}
          onClick={() => setViewMode('pending')}
        >
          待处理
        </button>
        <button
          type="button"
          className={viewMode === 'ignored' ? styles.viewTabActive : styles.viewTab}
          onClick={() => setViewMode('ignored')}
        >
          已忽略
        </button>
      </div>

      {srcFolders.length === 0 ? (
        <div className={styles.empty}>请在设置页添加「来源文件夹」并扫描。</div>
      ) : (
        srcFolders.map(folder => (
          <SourceFolderGroup
            key={folder.id}
            folder={folder}
            search={search}
            extFilter={extFilter}
            viewMode={viewMode}
            scan={scan}
            onIgnore={handleIgnore}
            onRestore={handleRestore}
          />
        ))
      )}
    </div>
  )
}

// ─── 右侧：项目卡 ────────────────────────────────────────────────────────

function ProjectCard({
  project,
  isDraggingFile,
  onCreateChild,
}: {
  project: Project
  isDraggingFile: boolean
  onCreateChild: (project: Project) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `project-${project.id}` })
  const { data: assignments = [] } = useProjectAssignments(project.id)
  const finalize = useFinalizeProject()
  const archive = useArchiveProject()
  const unarchive = useUnarchiveProject()
  const deleteProject = useDeleteProject()

  const handleFinalize = async () => {
    const result = await finalize.mutateAsync(project.id)
    if (result.moved.length === 0) {
      alert('没有需要整理的多版本文件。')
    } else {
      alert(`已将 ${result.moved.length} 个旧版本文件移入「其他」目录：\n${result.moved.join('\n')}`)
    }
  }

  const handleArchive = async () => {
    if (!confirm(`确认归档项目「${project.name}」？归档后将折叠显示。`)) return
    await archive.mutateAsync(project.id)
  }

  const handleDelete = async () => {
    const assignmentCount = project.assignment_count ?? assignments.length
    const message = assignmentCount > 0
      ? `确认删除项目「${project.path}」？\n\n这只会撤销项目记录和归档记录，不会删除磁盘上的目录和文件。当前项目已有 ${assignmentCount} 个文件记录。`
      : `确认删除项目「${project.path}」？\n\n这只会撤销项目记录，不会删除磁盘上的目录和文件。`
    if (!confirm(message)) return
    await deleteProject.mutateAsync(project.id)
  }

  return (
    <div
      ref={setNodeRef}
      className={`${styles.projectCard} ${isOver && isDraggingFile ? styles.dropTarget : ''} ${project.status === 'archived' ? styles.archivedCard : ''}`}
    >
      <div className={styles.projectCardHeader}>
        <span className={styles.projectName}>{project.name}</span>
        <span className={styles.badge}>{project.assignment_count ?? assignments.length} 个文件</span>
      </div>
      {project.path.includes('/') && (
        <div className={styles.projectPath}>📁 {project.path}</div>
      )}

      {assignments.length > 0 && (
        <ul className={styles.assignmentList}>
          {assignments.slice(0, 5).map((a: FileAssignment) => (
            <li key={a.id} className={styles.assignmentItem}>
              <span title={a.source_relative_path}>{a.dest_filename}</span>
            </li>
          ))}
          {assignments.length > 5 && (
            <li className={styles.assignmentMore}>还有 {assignments.length - 5} 个…</li>
          )}
        </ul>
      )}

      {!isDraggingFile && (
        <div className={styles.projectActions}>
          {project.status === 'active' ? (
            <>
              <button
                className={styles.btnChild}
                onClick={() => onCreateChild(project)}
                type="button"
              >
                ＋ 子项目
              </button>
              <button
                className={styles.btnFinalize}
                onClick={handleFinalize}
                disabled={finalize.isPending}
                title="保留同名文件的最新版本，旧版本移入「其他」子目录"
              >
                📌 保留最终版
              </button>
              <button
                className={styles.btnArchive}
                onClick={handleArchive}
                disabled={archive.isPending}
              >
                📦 归档
              </button>
              <button
                className={styles.btnDelete}
                onClick={handleDelete}
                disabled={deleteProject.isPending}
                type="button"
                title="只删除项目记录，不删除磁盘目录和文件"
              >
                删除
              </button>
            </>
          ) : (
            <button className={styles.btnUnarchive} onClick={() => unarchive.mutate(project.id)}>
              ↩ 取消归档
            </button>
          )}
        </div>
      )}

      {isOver && isDraggingFile && (
        <div className={styles.dropHint}>松手以归档到此项目</div>
      )}
    </div>
  )
}

function ProjectTree({
  nodes,
  isDraggingFile,
  onCreateChild,
  level = 0,
}: {
  nodes: ProjectTreeNode[]
  isDraggingFile: boolean
  onCreateChild: (project: Project) => void
  level?: number
}) {
  return (
    <div className={level === 0 ? styles.projectTree : styles.projectChildren}>
      {nodes.map(node => (
        <div key={node.id} className={styles.projectTreeNode}>
          <ProjectCard project={node} isDraggingFile={isDraggingFile} onCreateChild={onCreateChild} />
          {node.children.length > 0 && (
            <ProjectTree
              nodes={node.children}
              isDraggingFile={isDraggingFile}
              onCreateChild={onCreateChild}
              level={level + 1}
            />
          )}
        </div>
      ))}
    </div>
  )
}

// ─── 右侧面板 ────────────────────────────────────────────────────────────

function OrganizePanel({
  isDraggingFile,
  onTargetFolderChange,
}: {
  isDraggingFile: boolean
  onTargetFolderChange: (folderId: number | null) => void
}) {
  const { data: targetFolders = [] } = useFolders()
  const tgtFolder = targetFolders.find(f => f.folder_type === 'target') as Folder | undefined

  useEffect(() => {
    onTargetFolderChange(tgtFolder?.id ?? null)
  }, [tgtFolder?.id])

  const [showArchived, setShowArchived] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const createInputRef = useRef<HTMLInputElement>(null)

  const { data: allProjects = [] } = useProjects({ folderId: tgtFolder?.id })
  const createProject = useCreateProject()

  const activeProjects = allProjects.filter(p => p.status === 'active')
  const archivedProjects = allProjects.filter(p => p.status === 'archived')
  const activeProjectTree = useMemo(() => buildProjectTree(activeProjects), [activeProjects])
  const archivedProjectTree = useMemo(() => buildProjectTree(archivedProjects), [archivedProjects])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tgtFolder || !newProjectName.trim()) return
    // 轻量客户端验证
    if (newProjectName.trim().startsWith('/') || newProjectName.includes('..')) {
      alert('路径不能以 / 开头或包含 ..')
      return
    }
    await createProject.mutateAsync({ folder_id: tgtFolder.id, path: newProjectName.trim() })
    setNewProjectName('')
    setShowCreateForm(false)
  }

  const handleCreateChild = (project: Project) => {
    setNewProjectName(`${project.path}/`)
    setShowCreateForm(true)
    window.setTimeout(() => {
      createInputRef.current?.focus()
      createInputRef.current?.setSelectionRange(project.path.length + 1, project.path.length + 1)
    }, 0)
  }

  return (
    <div className={styles.organizePanel}>
      <div className={styles.panelHeader}>
        <h2>整理区</h2>
        <div className={styles.panelToolbar}>
          <label className={styles.toggleLabel}>
            <input
              type="checkbox"
              checked={showArchived}
              onChange={e => setShowArchived(e.target.checked)}
            />
            {' '}显示已归档（{archivedProjects.length}）
          </label>
          {tgtFolder ? (
            <button
              className={styles.btnCreate}
              onClick={() => setShowCreateForm(v => !v)}
            >
              ＋ 新建项目
            </button>
          ) : (
            <Link className={styles.btnCreate} style={{ textDecoration: 'none' }} to="/settings">
              ⚙️ 配置目标文件夹
            </Link>
          )}
        </div>
      </div>

      {!tgtFolder ? (
        <div className={styles.empty}>请在设置页添加一个「目标文件夹」。</div>
      ) : (
        <>
          {showCreateForm && (
            <form className={styles.createForm} onSubmit={handleCreate}>
              <input
                ref={createInputRef}
                autoFocus
                className={styles.searchInput}
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                placeholder="项目路径，支持多级，如：研究/目标/子目标"
              />
              <button className={styles.btnCreate} type="submit" disabled={createProject.isPending}>
                确认
              </button>
              <button type="button" className={styles.btnGhost} onClick={() => setShowCreateForm(false)}>
                取消
              </button>
            </form>
          )}

          <div className={styles.projectTreeWrap}>
            {activeProjectTree.length > 0 ? (
              <ProjectTree nodes={activeProjectTree} isDraggingFile={isDraggingFile} onCreateChild={handleCreateChild} />
            ) : (
              <div className={styles.empty}>暂无活跃项目，点击「新建项目」开始。</div>
            )}
          </div>

          {showArchived && archivedProjects.length > 0 && (
            <>
              <div className={styles.archivedDivider}>已归档项目</div>
              <div className={styles.projectTreeWrap}>
                <ProjectTree nodes={archivedProjectTree} isDraggingFile={isDraggingFile} onCreateChild={handleCreateChild} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

// ─── 主页 ────────────────────────────────────────────────────────────────

export default function WorkspacePage() {
  const assign = useAssignFile()
  const ignoreFile = useIgnoreFile()
  const { data: allFiles = [] } = useFiles({})
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const [activeFileId, setActiveFileId] = useState<number | null>(null)
  const activeFile = allFiles.find(f => f.id === activeFileId)

  // ─── 智能分类 Drawer 状态 ─────────────────────────────────────────────
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<AssignmentSuggestion[]>([])
  const [lowConfidenceSuggestions, setLowConfidenceSuggestions] = useState<AssignmentSuggestion[]>([])
  const [skippedCount, setSkippedCount] = useState(0)
  const [suggestError, setSuggestError] = useState<string | null>(null)
  const [isSuggesting, setIsSuggesting] = useState(false)
  const [suggestTotal, setSuggestTotal] = useState(0)
  const [assigningFileId, setAssigningFileId] = useState<number | null>(null)
  const [targetFolderId, setTargetFolderId] = useState<number | null>(null)
  const suggestAbortRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => suggestAbortRef.current?.()
  }, [])

  function handleSuggest() {
    suggestAbortRef.current?.()
    setDrawerOpen(true)
    setSuggestError(null)
    setSuggestions([])
    setLowConfidenceSuggestions([])
    setSkippedCount(0)
    setSuggestTotal(0)
    setIsSuggesting(true)

    suggestAbortRef.current = streamSuggestAssignments(
      { targetFolderId: targetFolderId ?? undefined },
      {
        onStart: total => setSuggestTotal(total),
        onItem: item => {
          if ('error' in item) {
            setSkippedCount(count => count + 1)
            return
          }
          const suggestion = item as AssignmentSuggestion
          const update = (prev: AssignmentSuggestion[]) => {
            const exists = prev.some(s => s.file_id === suggestion.file_id)
            return exists ? prev.map(s => s.file_id === suggestion.file_id ? suggestion : s) : [...prev, suggestion]
          }
          if (suggestion.confident) {
            setSuggestions(update)
          } else {
            setLowConfidenceSuggestions(update)
          }
        },
        onDone: result => {
          setIsSuggesting(false)
          if (result.message) setSuggestError(result.message)
        },
        onError: message => {
          setIsSuggesting(false)
          setSuggestError(message)
        },
      },
    )
  }

  async function handleAccept(suggestion: AssignmentSuggestion) {
    setAssigningFileId(suggestion.file_id)
    try {
      await assign.mutateAsync({ projectId: suggestion.project_id, fileId: suggestion.file_id })
      setSuggestions(prev => prev.filter(s => s.file_id !== suggestion.file_id))
      setLowConfidenceSuggestions(prev => prev.filter(s => s.file_id !== suggestion.file_id))
    } catch (err) {
      alert(err instanceof Error ? err.message : '归档失败')
    } finally {
      setAssigningFileId(null)
    }
  }

  async function handleDismiss(fileId: number) {
    try {
      await ignoreFile.mutateAsync(fileId)
      setSuggestions(prev => prev.filter(s => s.file_id !== fileId))
      setLowConfidenceSuggestions(prev => prev.filter(s => s.file_id !== fileId))
    } catch (err) {
      alert(err instanceof Error ? err.message : '忽略失败')
    }
  }

  function handleCloseSuggest() {
    suggestAbortRef.current?.()
    suggestAbortRef.current = null
    setIsSuggesting(false)
    setDrawerOpen(false)
  }

  // PointerSensor 需要移动 8px 才算拖拽开始，避免误触点击事件
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  function handleDragStart(event: DragStartEvent) {
    if (String(event.active.id).startsWith('file-')) {
      setIsDraggingFile(true)
      setActiveFileId(event.active.data.current?.fileId as number)
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    setIsDraggingFile(false)
    setActiveFileId(null)
    const { active, over } = event
    if (!over) return

    const fileId = active.data.current?.fileId as number | undefined
    const projectIdStr = String(over.id).startsWith('project-')
      ? String(over.id).replace('project-', '')
      : null

    if (fileId && projectIdStr) {
      try {
        await assign.mutateAsync({ projectId: Number(projectIdStr), fileId })
      } catch (err) {
        alert(err instanceof Error ? err.message : '归档失败')
      }
    }
  }

  function handleDragCancel() {
    setIsDraggingFile(false)
    setActiveFileId(null)
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderContent}>
          <div>
            <h1>工作台</h1>
            <p>把散落的本地文件，自动沉淀成带 AI 记忆的项目库。将左侧扫描到的文件拖拽到右侧项目中完成归档。</p>
          </div>
          <button
            className={styles.btnSuggest}
            onClick={handleSuggest}
            disabled={isSuggesting}
            type="button"
          >
            {isSuggesting ? '分析中…' : '✨ 智能分类'}
          </button>
        </div>
      </div>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className={styles.workspace}>
          <ScanPoolPanel />
          <OrganizePanel isDraggingFile={isDraggingFile} onTargetFolderChange={setTargetFolderId} />
        </div>
        <DragOverlay dropAnimation={null}>
          {activeFile ? <DragFilePreview file={activeFile} /> : null}
        </DragOverlay>
      </DndContext>
      <SuggestionDrawer
        open={drawerOpen}
        suggestions={suggestions}
        lowConfidenceSuggestions={lowConfidenceSuggestions}
        skippedCount={skippedCount}
        totalCount={suggestTotal}
        isSuggesting={isSuggesting}
        assigningFileId={assigningFileId}
        error={suggestError}
        onClose={handleCloseSuggest}
        onAccept={handleAccept}
        onDismiss={handleDismiss}
        onRefresh={handleSuggest}
      />
    </div>
  )
}
