import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { useFile } from '@/hooks/useFiles'
import { useRestoreVersion, useVersionContent, useVersions } from '@/hooks/useVersions'
import styles from './FileDetailPage.module.css'

export default function FileDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const fileId = Number(id)
  const { data: file, isLoading: fileLoading } = useFile(fileId)
  const { data: versions = [], isLoading: versionsLoading } = useVersions(fileId)
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null)
  const { data: content } = useVersionContent(selectedVersionId)
  const restore = useRestoreVersion()

  if (fileLoading) return <div className={styles.empty}>加载中…</div>
  if (!file) return <div className={styles.empty}>文件不存在</div>

  const latestVersion = versions[0]

  const handleRestore = async (versionId: number) => {
    if (!confirm('确认恢复此历史版本？当前文件会被覆盖，但历史版本不会删除。')) return
    await restore.mutateAsync(versionId)
    alert('已恢复版本')
  }

  return (
    <div className={styles.page}>
      <button className={styles.back} onClick={() => navigate('/')}>← 返回看板</button>
      <div className={styles.header}>
        <div>
          <h1>{file.filename}</h1>
          <p>{file.relative_path}</p>
        </div>
        <span className={styles.status}>{file.status}</span>
      </div>

      <section className={styles.section}>
        <h2>基本信息</h2>
        <div className={styles.grid}>
          <div><strong>绝对路径</strong><span>{file.absolute_path}/{file.relative_path}</span></div>
          <div><strong>文件类型</strong><span>{file.extension || '无扩展名'}</span></div>
          <div><strong>Checksum</strong><span>{file.current_checksum || '-'}</span></div>
          <div><strong>版本数</strong><span>{file.version_count}</span></div>
          <div><strong>最后事件</strong><span>{file.last_event_type || '-'}</span></div>
          <div><strong>更新时间</strong><span>{formatDistanceToNow(new Date(file.updated_at), { addSuffix: true, locale: zhCN })}</span></div>
        </div>
      </section>

      <section className={styles.section}>
        <h2>AI 总结</h2>
        <div className={styles.summaryGrid}>
          <div><h3>变更总结</h3><p>{latestVersion?.ai_change_summary || file.ai_change_summary || '总结中…'}</p></div>
          <div><h3>内容总结</h3><p>{latestVersion?.ai_content_summary || file.ai_content_summary || '总结中…'}</p></div>
          <div><h3>项目进度影响</h3><p>{latestVersion?.ai_progress_impact || file.ai_progress_impact || '总结中…'}</p></div>
        </div>
      </section>

      <section className={styles.section}>
        <h2>版本时间线</h2>
        {versionsLoading ? <div>加载中…</div> : (
          <div className={styles.timeline}>
            {versions.map(version => (
              <div className={styles.versionItem} key={version.id}>
                <div className={styles.versionHeader}>
                  <strong>v{version.version_number}</strong>
                  <span>{version.event_type}</span>
                  <span>{new Date(version.created_at).toLocaleString()}</span>
                  <span>{(version.size_bytes / 1024).toFixed(1)} KB</span>
                </div>
                <p>{version.ai_change_summary || '暂无 AI 总结'}</p>
                <div className={styles.versionActions}>
                  <button onClick={() => setSelectedVersionId(version.id)}>查看内容</button>
                  {version.archive_path && <button onClick={() => handleRestore(version.id)}>恢复此版本</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {selectedVersionId && (
        <section className={styles.section}>
          <h2>历史内容预览</h2>
          {content?.isText ? (
            <pre className={styles.preview}>{content.content}</pre>
          ) : (
            <div className={styles.empty}>{content?.message || '该版本不支持预览'}</div>
          )}
        </section>
      )}
    </div>
  )
}
