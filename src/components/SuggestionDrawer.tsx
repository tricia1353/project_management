import type { AssignmentSuggestion } from '@/api/ai'
import styles from './SuggestionDrawer.module.css'

interface SuggestionDrawerProps {
  open: boolean
  suggestions: AssignmentSuggestion[]
  skippedCount: number
  totalCount: number
  isSuggesting: boolean
  assigningFileId: number | null
  error?: string | null
  onClose: () => void
  onAccept: (suggestion: AssignmentSuggestion) => void
  onDismiss: (fileId: number) => void
  onRefresh: () => void
}

export function SuggestionDrawer({
  open,
  suggestions,
  skippedCount,
  totalCount,
  isSuggesting,
  assigningFileId,
  error,
  onClose,
  onAccept,
  onDismiss,
  onRefresh,
}: SuggestionDrawerProps) {
  if (!open) return null

  const analyzedCount = suggestions.length + skippedCount
  const progressPct = totalCount > 0 ? Math.round((analyzedCount / totalCount) * 100) : 0

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <aside className={styles.drawer} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h2>智能分类建议</h2>
            <p>AI 根据文件内容和项目语义推荐最合适的项目。</p>
          </div>
          <button className={styles.closeButton} onClick={onClose} type="button">×</button>
        </div>

        {isSuggesting && totalCount > 0 && (
          <div className={styles.progressWrap}>
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
            </div>
            <span className={styles.progressText}>
              已分析 {analyzedCount} / {totalCount} 个文件…
            </span>
          </div>
        )}

        {!isSuggesting && (
          <div className={styles.summary}>
            <span>{suggestions.length} 条可确认建议</span>
            {skippedCount > 0 && (
              <span className={styles.skippedBadge}>{skippedCount} 个置信度不足</span>
            )}
          </div>
        )}

        {error && <div className={styles.error}>{error}</div>}

        <button
          className={styles.refreshButton}
          onClick={onRefresh}
          disabled={isSuggesting}
          type="button"
        >
          {isSuggesting ? '分析中…' : '重新分析'}
        </button>

        <div className={styles.list}>
          {isSuggesting && suggestions.length === 0 ? (
            <div className={styles.empty}>正在逐一分析文件，结果将陆续出现…</div>
          ) : suggestions.length === 0 && !isSuggesting ? (
            <div className={styles.empty}>暂无高置信度分类建议。</div>
          ) : (
            suggestions.map(suggestion => (
              <div key={suggestion.file_id} className={styles.card}>
                <div className={styles.fileName}>{suggestion.filename}</div>
                <div className={styles.filePath}>{suggestion.relative_path}</div>

                <div className={styles.arrow}>推荐归档到</div>

                <div className={styles.projectName}>{suggestion.project_path}</div>
                <div className={styles.confidenceRow}>
                  <span className={styles.confidence}>置信度 {suggestion.confidence}%</span>
                  <span className={styles.confidenceBar}>
                    <span
                      className={styles.confidenceBarFill}
                      style={{ width: `${suggestion.confidence}%` }}
                    />
                  </span>
                </div>
                <div className={styles.reason}>{suggestion.reason}</div>

                <div className={styles.actions}>
                  <button
                    className={styles.acceptButton}
                    onClick={() => onAccept(suggestion)}
                    disabled={assigningFileId === suggestion.file_id}
                    type="button"
                  >
                    {assigningFileId === suggestion.file_id ? '归档中…' : '✅ 确认归档'}
                  </button>
                  <button
                    className={styles.dismissButton}
                    onClick={() => onDismiss(suggestion.file_id)}
                    disabled={assigningFileId === suggestion.file_id}
                    type="button"
                  >
                    忽略
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>
    </div>
  )
}
