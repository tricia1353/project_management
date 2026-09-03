import type { AssignmentSuggestion } from '@/api/ai'
import styles from './SuggestionDrawer.module.css'

interface SuggestionDrawerProps {
  open: boolean
  suggestions: AssignmentSuggestion[]
  lowConfidenceSuggestions: AssignmentSuggestion[]
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

function SuggestionCard({
  suggestion,
  assigningFileId,
  onAccept,
  onDismiss,
}: {
  suggestion: AssignmentSuggestion
  assigningFileId: number | null
  onAccept: (suggestion: AssignmentSuggestion) => void
  onDismiss: (fileId: number) => void
}) {
  const isAssigning = assigningFileId === suggestion.file_id

  return (
    <div className={styles.card}>
      <div className={styles.fileInfo}>
        <div className={styles.fileName}>{suggestion.filename}</div>
        <div className={styles.filePath}>{suggestion.relative_path}</div>
      </div>
      <div className={styles.arrow}>→</div>
      <div className={styles.projectInfo}>
        <div className={styles.projectName}>{suggestion.project_name}</div>
        <div className={styles.filePath}>{suggestion.project_path}</div>
      </div>
      <div className={styles.confidenceRow}>
        <div className={styles.confidenceBar}>
          <div
            className={styles.confidenceBarFill}
            style={{ width: `${Math.round(suggestion.confidence)}%` }}
          />
        </div>
        <span className={styles.confidence}>{Math.round(suggestion.confidence)}%</span>
      </div>
      <p className={styles.reason}>{suggestion.reason}</p>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.acceptButton}
          onClick={() => onAccept(suggestion)}
          disabled={isAssigning}
        >
          {isAssigning ? '归档中…' : '确认归档'}
        </button>
        <button
          type="button"
          className={styles.dismissButton}
          onClick={() => onDismiss(suggestion.file_id)}
          disabled={isAssigning}
        >
          忽略
        </button>
      </div>
    </div>
  )
}

export function SuggestionDrawer({
  open,
  suggestions,
  lowConfidenceSuggestions,
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

  const suggestionCount = suggestions.length + lowConfidenceSuggestions.length
  const analyzedCount = suggestionCount + skippedCount
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
            {lowConfidenceSuggestions.length > 0 && (
              <span className={styles.skippedBadge}>{lowConfidenceSuggestions.length} 条低置信度</span>
            )}
            {skippedCount > 0 && (
              <span className={styles.skippedBadge}>{skippedCount} 个无法生成建议</span>
            )}
          </div>
        )}

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.list}>
          {suggestions.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>建议归档</div>
              {suggestions.map(suggestion => (
                <SuggestionCard
                  key={suggestion.file_id}
                  suggestion={suggestion}
                  assigningFileId={assigningFileId}
                  onAccept={onAccept}
                  onDismiss={onDismiss}
                />
              ))}
            </section>
          )}

          {lowConfidenceSuggestions.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>低置信度，需人工确认</div>
              {lowConfidenceSuggestions.map(suggestion => (
                <SuggestionCard
                  key={suggestion.file_id}
                  suggestion={suggestion}
                  assigningFileId={assigningFileId}
                  onAccept={onAccept}
                  onDismiss={onDismiss}
                />
              ))}
            </section>
          )}

          {!isSuggesting && suggestionCount === 0 && !error && (
            <div className={styles.empty}>
              <p>暂无可用建议。</p>
              <button type="button" onClick={onRefresh}>重新分析</button>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
