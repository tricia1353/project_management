import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { useFile, useSuggestionHistory, useUpdateFileRemark } from '@/hooks/useFiles'
import {
  useMergeVersionGroup,
  useRestoreVersion,
  useSplitVersionGroup,
  useVersionGroupCandidates,
  useVersions,
} from '@/hooks/useVersions'
import type { FileEventType } from '@/types'
import styles from './FileDetailPage.module.css'

const EVENT_LABELS: Record<FileEventType, string> = {
  created: '原始版本',
  modified: '内容修改',
  deleted: '文件删除',
  restored: '版本恢复',
}

function getEventLabel(eventType: FileEventType, isFirstInTimeline: boolean) {
  if (eventType === 'created' && !isFirstInTimeline) return '接续版本'
  return EVENT_LABELS[eventType]
}

function getChangeSummary(eventType: FileEventType, isFirstInTimeline: boolean, summary?: string | null) {
  if (eventType === 'created' && isFirstInTimeline) return '首次归档，作为后续版本对比基线。'
  if (summary?.trim()) return summary
  return '正在分析版本差异。'
}

function getContentSummary(eventType: FileEventType, isFirstInTimeline: boolean, summary?: string | null) {
  if (eventType === 'created' && isFirstInTimeline) return '原始版本不做 AI 差异分析，后续文件变化会自动生成并保存摘要。'
  if (summary?.trim()) return summary
  return '正在分析版本内容。'
}

function getProgressImpact(eventType: FileEventType, isFirstInTimeline: boolean, impact?: string | null) {
  if (eventType === 'created' && isFirstInTimeline) return '原始版本作为项目基线，不单独评估进度影响。'
  if (impact?.trim()) return impact
  return '正在分析项目进度影响。'
}

function getCurrentPath(file?: { absolute_path?: string; relative_path: string }) {
  if (!file) return '-'
  return file.absolute_path ? `${file.absolute_path}/${file.relative_path}` : file.relative_path
}

export default function FileDetailPage() {
  const navigate = useNavigate()
  const { id, versionId } = useParams()
  const fileId = Number(id)
  const selectedVersionId = Number(versionId)
  const highlightedVersionRef = useRef<HTMLLIElement | null>(null)

  const { data: file, isLoading: fileLoading } = useFile(fileId)
  const { data: versions = [], isLoading: versionsLoading } = useVersions(fileId)
  const { data: candidates = [] } = useVersionGroupCandidates(fileId)
  const { data: suggestionHistory = [] } = useSuggestionHistory(fileId)
  const restore = useRestoreVersion()
  const updateRemark = useUpdateFileRemark()
  const mergeGroup = useMergeVersionGroup()
  const splitGroup = useSplitVersionGroup()

  const [suggestionDraft, setSuggestionDraft] = useState('')
  const [pushToMessages, setPushToMessages] = useState(false)

  useEffect(() => {
    setSuggestionDraft(file?.manual_suggestion ?? '')
  }, [file?.manual_suggestion])

  useEffect(() => {
    if (!highlightedVersionRef.current) return
    highlightedVersionRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [selectedVersionId, versions.length])

  const currentPath = useMemo(() => getCurrentPath(file), [file])
  const hasSuggestionChanged = suggestionDraft.trim() !== (file?.manual_suggestion ?? '').trim()
  const groupFileCount = useMemo(() => new Set(versions.map(v => v.source_file_id ?? fileId)).size, [versions, fileId])

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1)
      return
    }
    navigate('/kanban')
  }

  const handleSaveSuggestion = () => {
    if (!file) return
    updateRemark.mutate(
      {
        id: file.id,
        manual_suggestion: suggestionDraft,
        push_to_messages: pushToMessages,
      },
      {
        onSuccess: () => {
          setPushToMessages(false)
        },
      },
    )
  }

  const handleMerge = (targetFileId: number) => {
    if (!file) return
    mergeGroup.mutate({ fileId: file.id, targetFileId })
  }

  const handleSplit = () => {
    if (!file) return
    splitGroup.mutate(file.id)
  }

  if (fileLoading) return <div className={styles.page}>加载中...</div>
  if (!file) return <div className={styles.page}>文件不存在</div>

  return (
    <div className={styles.page}>
      <button className={styles.back} onClick={handleBack}>返回上一级</button>

      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>文件详情</p>
          <h1>{file.filename}</h1>
          <p>{currentPath}</p>
        </div>
        <span className={styles.status}>{file.status}</span>
      </header>

      <section className={styles.section}>
        <div className={styles.sectionTitleRow}>
          <h2>文件信息</h2>
        </div>
        <div className={styles.grid}>
          <div>
            <strong>当前路径</strong>
            <span>{currentPath}</span>
          </div>
          <div>
            <strong>版本数</strong>
            <span>{file.version_count}</span>
          </div>
          <div>
            <strong>更新时间</strong>
            <span>{formatDistanceToNow(new Date(file.updated_at), { addSuffix: true, locale: zhCN })}</span>
          </div>
        </div>

        <div className={styles.remarkBox}>
          <div className={styles.remarkHeader}>
            <div>
              <strong>修改建议</strong>
              {file.manual_suggestion_updated_at && (
                <span>
                  上次更新 {formatDistanceToNow(new Date(file.manual_suggestion_updated_at), { addSuffix: true, locale: zhCN })}
                </span>
              )}
            </div>
            <button
              onClick={handleSaveSuggestion}
              disabled={updateRemark.isPending || (!hasSuggestionChanged && !pushToMessages)}
            >
              {updateRemark.isPending ? '保存中...' : '保存'}
            </button>
          </div>
          <textarea
            value={suggestionDraft}
            onChange={event => setSuggestionDraft(event.target.value)}
            placeholder="记录下一步修改建议、确认事项或需要同步的备注"
            rows={4}
          />
          <label className={styles.pushOption}>
            <input
              type="checkbox"
              checked={pushToMessages}
              onChange={event => setPushToMessages(event.target.checked)}
            />
            <span>同时推送到消息界面</span>
          </label>
        </div>

        {suggestionHistory.length > 0 && (
          <div className={styles.suggestionHistory}>
            <strong>历史建议</strong>
            <ul>
              {suggestionHistory.map(entry => (
                <li key={entry.id}>
                  <div className={styles.suggestionHistoryMeta}>
                    <time>{formatDistanceToNow(new Date(entry.created_at), { addSuffix: true, locale: zhCN })}</time>
                    {entry.pushed_to_messages ? <span className={styles.badge}>已推送</span> : null}
                    {entry.source_filename && entry.source_filename !== file.filename && (
                      <span className={styles.badge}>来自：{entry.source_relative_path}</span>
                    )}
                  </div>
                  <p>{entry.manual_suggestion || '（已清空）'}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitleRow}>
          <h2>历史归属</h2>
        </div>

        {file.version_group_source === 'scanner_filename' && (
          <p className={styles.hint}>系统按文件名自动归类，如有误可手动调整。</p>
        )}

        {candidates.length > 0 && (
          <div className={styles.candidateCard}>
            <strong>检测到可能是同一份材料</strong>
            <ul>
              {candidates.map(candidate => (
                <li key={candidate.file_id}>
                  <div>
                    <span>{candidate.relative_path}</span>
                    <span className={styles.badge}>
                      {candidate.reason === 'checksum_match' ? '内容一致' : '文件名一致'}
                    </span>
                  </div>
                  <button onClick={() => handleMerge(candidate.file_id)} disabled={mergeGroup.isPending}>
                    合并
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {groupFileCount > 1 && (
          <button
            className={styles.splitButton}
            onClick={handleSplit}
            disabled={splitGroup.isPending}
          >
            从当前历史线拆出
          </button>
        )}

        {candidates.length === 0 && groupFileCount <= 1 && (
          <p className={styles.empty}>暂无需要调整的历史归属信息</p>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitleRow}>
          <h2>版本时间线</h2>
          <span>{versions.length} 个版本</span>
        </div>

        {versionsLoading ? (
          <p className={styles.empty}>版本加载中...</p>
        ) : versions.length === 0 ? (
          <p className={styles.empty}>暂无版本记录</p>
        ) : (
          <ol className={styles.timeline}>
            {versions.map(version => {
              const isHighlighted = version.id === selectedVersionId
              const isOtherSource = version.source_filename && version.source_relative_path !== file.relative_path
              const isFirstInTimeline = (version.series_version_number ?? version.version_number) === 1
              return (
                <li
                  key={version.id}
                  ref={isHighlighted ? highlightedVersionRef : undefined}
                  className={`${styles.versionItem} ${isHighlighted ? styles.highlightedVersion : ''}`}
                >
                  <div className={styles.versionHeader}>
                    <div>
                      <strong>v{version.series_version_number ?? version.version_number}</strong>
                      <span>{getEventLabel(version.event_type, isFirstInTimeline)}</span>
                      {isOtherSource && (
                        <span className={styles.sourceTag}>来自：{version.source_relative_path}</span>
                      )}
                    </div>
                    <time>{formatDistanceToNow(new Date(version.created_at), { addSuffix: true, locale: zhCN })}</time>
                  </div>

                  <div className={styles.diffBlock}>
                    <strong>本次变化点</strong>
                    <p>{getChangeSummary(version.event_type, isFirstInTimeline, version.ai_change_summary)}</p>
                  </div>
                  <div className={styles.diffBlock}>
                    <strong>当前版本摘要</strong>
                    <p>{getContentSummary(version.event_type, isFirstInTimeline, version.ai_content_summary)}</p>
                  </div>
                  <div className={styles.impact}>
                    <strong>项目影响</strong>
                    <p>{getProgressImpact(version.event_type, isFirstInTimeline, version.ai_progress_impact)}</p>
                  </div>

                  {version.event_type !== 'deleted' && version.is_current_file_version !== false && (
                    <div className={styles.versionActions}>
                      <button
                        onClick={() => restore.mutate(version.id)}
                        disabled={restore.isPending}
                      >
                        恢复到此版本
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </section>
    </div>
  )
}
