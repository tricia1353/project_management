import { useRef, useState } from 'react'
import type { ReportTemplate } from '@/api/templates'
import {
  useTemplates, useCreateTemplate, useUpdateTemplate,
  useDeleteTemplate, useSetDefaultTemplate, useImportTemplate,
} from '@/hooks/useTemplates'
import styles from './TemplateManager.module.css'

interface Props {
  open: boolean
  onClose: () => void
  onSelect?: (template: ReportTemplate) => void
}

interface FormState {
  name: string
  content: string
}

const SOURCE_TYPE_LABEL: Record<string, string> = {
  text: '文本',
  docx: 'Word',
  doc: 'Word',
  xlsx: 'Excel',
  xls: 'Excel',
  csv: 'CSV',
  txt: 'TXT',
}

const ACCEPTED_EXTENSIONS = '.docx,.doc,.xlsx,.xls,.csv,.txt'

export function TemplateManager({ open, onClose, onSelect }: Props) {
  const { data: templates = [] } = useTemplates()
  const createTemplate = useCreateTemplate()
  const importTemplate = useImportTemplate()
  const updateTemplate = useUpdateTemplate()
  const deleteTemplate = useDeleteTemplate()
  const setDefault = useSetDefaultTemplate()

  const fileInputRef = useRef<HTMLInputElement>(null)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<FormState>({ name: '', content: '' })
  const [importError, setImportError] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<number | null>(null)

  if (!open) return null

  function startCreate() {
    setCreating(true)
    setEditingId(null)
    setPreviewId(null)
    setForm({ name: '', content: '' })
  }

  function startEdit(t: ReportTemplate) {
    setEditingId(t.id)
    setCreating(false)
    setPreviewId(null)
    setForm({ name: t.name, content: t.content })
  }

  function cancelForm() {
    setCreating(false)
    setEditingId(null)
    setForm({ name: '', content: '' })
  }

  async function handleSubmit() {
    const name = form.name.trim()
    const content = form.content.trim()
    if (!name || !content) return

    if (creating) {
      await createTemplate.mutateAsync({ name, content })
    } else if (editingId !== null) {
      await updateTemplate.mutateAsync({ id: editingId, input: { name, content } })
    }
    cancelForm()
  }

  async function handleDelete(id: number) {
    if (!confirm('确认删除此模版？')) return
    await deleteTemplate.mutateAsync(id)
    if (previewId === id) setPreviewId(null)
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!fileInputRef.current) return
    fileInputRef.current.value = ''
    if (!file) return

    setImportError(null)
    try {
      await importTemplate.mutateAsync(file)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : '导入失败')
    }
  }

  const isPending = createTemplate.isPending || updateTemplate.isPending
  const previewTemplate = previewId !== null ? templates.find(t => t.id === previewId) : null

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <aside className={styles.drawer} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>模版管理</h2>
          <div className={styles.headerActions}>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              className={styles.fileInputHidden}
              onChange={handleFileChange}
            />
            <button
              className={styles.btnImport}
              onClick={() => fileInputRef.current?.click()}
              disabled={importTemplate.isPending}
              type="button"
              title="从本地导入 Word / Excel / CSV / TXT 文件"
            >
              {importTemplate.isPending ? '导入中…' : '📂 导入文件'}
            </button>
            <button className={styles.btnCreate} onClick={startCreate} type="button">＋ 新建</button>
            <button className={styles.closeBtn} onClick={onClose} type="button">×</button>
          </div>
        </div>

        {importError && (
          <div className={styles.importError}>
            {importError}
            <button onClick={() => setImportError(null)} type="button">×</button>
          </div>
        )}

        {importTemplate.isSuccess && !importError && (
          <div className={styles.importSuccess}>
            文件已成功导入为模版
            <button onClick={() => importTemplate.reset()} type="button">×</button>
          </div>
        )}

        {(creating || editingId !== null) && (
          <div className={styles.form}>
            <div className={styles.formTitle}>{creating ? '新建文本模版' : '编辑模版'}</div>
            <input
              className={styles.input}
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="模版名称"
              autoFocus
            />
            <textarea
              className={styles.textarea}
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              placeholder={'模版内容，如：\n# 本周周报\n## 项目进展\n## 遇到的问题\n## 下周计划'}
              rows={8}
            />
            <div className={styles.formActions}>
              <button
                className={styles.btnSave}
                onClick={handleSubmit}
                disabled={!form.name.trim() || !form.content.trim() || isPending}
                type="button"
              >
                {isPending ? '保存中…' : '保存'}
              </button>
              <button className={styles.btnCancel} onClick={cancelForm} type="button">取消</button>
            </div>
          </div>
        )}

        <div className={styles.body}>
          <div className={styles.list}>
            {templates.length === 0 && !creating ? (
              <div className={styles.empty}>
                <p>暂无模版</p>
                <p className={styles.emptyHint}>点击「新建」手写模版，或「导入文件」从 Word/Excel 导入</p>
              </div>
            ) : (
              templates.map(t => (
                <div
                  key={t.id}
                  className={`${styles.card} ${editingId === t.id ? styles.cardActive : ''} ${previewId === t.id ? styles.cardPreviewing : ''}`}
                >
                  <div className={styles.cardTop}>
                    <div className={styles.cardName}>
                      <span
                        className={`${styles.sourceTypeBadge} ${styles[`badge_${t.source_type ?? 'text'}`]}`}
                      >
                        {SOURCE_TYPE_LABEL[t.source_type ?? 'text'] ?? t.source_type}
                      </span>
                      {t.name}
                      {t.is_default === 1 && <span className={styles.defaultBadge}>默认</span>}
                    </div>
                    <div className={styles.cardActions}>
                      {onSelect && (
                        <button
                          className={styles.btnUse}
                          onClick={() => { onSelect(t); onClose() }}
                          type="button"
                        >
                          使用
                        </button>
                      )}
                      <button
                        className={styles.btnPreview}
                        onClick={() => setPreviewId(prev => prev === t.id ? null : t.id)}
                        type="button"
                      >
                        {previewId === t.id ? '收起' : '预览'}
                      </button>
                      <button
                        className={styles.btnEdit}
                        onClick={() => startEdit(t)}
                        type="button"
                      >
                        编辑
                      </button>
                      {t.is_default !== 1 && (
                        <button
                          className={styles.btnDefault}
                          onClick={() => setDefault.mutate(t.id)}
                          type="button"
                        >
                          设默认
                        </button>
                      )}
                      <button
                        className={styles.btnDelete}
                        onClick={() => handleDelete(t.id)}
                        type="button"
                      >
                        删除
                      </button>
                    </div>
                  </div>

                  {t.original_filename && (
                    <div className={styles.originalFilename}>
                      📄 来源文件：{t.original_filename}
                    </div>
                  )}

                  {previewId !== t.id && (
                    <div className={styles.cardPreview}>
                      {t.content.slice(0, 80)}{t.content.length > 80 ? '…' : ''}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {previewTemplate && (
            <div className={styles.previewPanel}>
              <div className={styles.previewHeader}>
                <span>📄 {previewTemplate.name} 完整内容</span>
                <button onClick={() => setPreviewId(null)} type="button">×</button>
              </div>
              <pre className={styles.previewContent}>{previewTemplate.content}</pre>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
