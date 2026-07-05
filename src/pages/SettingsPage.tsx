import { useEffect, useState } from 'react'
import { useFolders, useCreateFolder, useUpdateFolder, useDeleteFolder, useScanFolder } from '@/hooks/useFolders'
import { useAISettings, useSaveAISettings, useTestAISettings } from '@/hooks/useAISettings'
import { useProjectStatusSettings, useSaveProjectStatusSettings } from '@/hooks/useAppSettings'
import type { AISettings, Folder, FolderType } from '@/types'
import styles from './SettingsPage.module.css'

const INTERVAL_OPTIONS = [
  { label: '30 秒', value: 30 },
  { label: '1 分钟', value: 60 },
  { label: '5 分钟', value: 300 },
  { label: '10 分钟', value: 600 },
]

function FolderCard({ folder }: { folder: Folder }) {
  const update = useUpdateFolder()
  const del = useDeleteFolder()
  const scan = useScanFolder()
  const [scanning, setScanning] = useState(false)

  const handleScan = async () => {
    setScanning(true)
    try { await scan.mutateAsync(folder.id) } finally { setScanning(false) }
  }

  const typeLabel = folder.folder_type === 'target' ? '🗂 目标文件夹' : '🔍 来源文件夹'

  return (
    <div className={styles.folderCard}>
      <div className={styles.folderPath}>
        {folder.absolute_path}
        <span className={styles.folderTypeBadge}>{typeLabel}</span>
      </div>
      <div className={styles.folderMeta}>
        <label>类型：</label>
        <select
          value={folder.folder_type}
          onChange={e => update.mutate({ id: folder.id, input: { folder_type: e.target.value as FolderType } })}
        >
          <option value="source">来源文件夹</option>
          <option value="target">目标文件夹</option>
        </select>
        <label style={{ marginLeft: 16 }}>扫描间隔：</label>
        <select
          value={folder.scan_interval_seconds}
          onChange={e => update.mutate({ id: folder.id, input: { scan_interval_seconds: Number(e.target.value) } })}
        >
          {INTERVAL_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <label style={{ marginLeft: 16 }}>
          <input
            type="checkbox"
            checked={folder.enabled === 1}
            onChange={e => update.mutate({ id: folder.id, input: { enabled: e.target.checked } as { enabled: boolean } })}
          />
          {' '}启用
        </label>
      </div>
      <div className={styles.folderActions}>
        <button className={styles.btnScan} onClick={handleScan} disabled={scanning || folder.folder_type === 'target'}>
          {scanning ? '扫描中…' : folder.folder_type === 'target' ? '目标目录无需扫描' : '立即扫描'}
        </button>
        <button className={styles.btnDanger} onClick={() => {
          if (confirm('确认删除该文件夹配置？')) del.mutate(folder.id)
        }}>删除</button>
      </div>
    </div>
  )
}

function AddFolderForm({ onDone }: { onDone: () => void }) {
  const create = useCreateFolder()
  const [path, setPath] = useState('')
  const [interval, setInterval] = useState(300)
  const [folderType, setFolderType] = useState<FolderType>('source')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!path.trim()) return
    await create.mutateAsync({
      absolute_path: path.trim(),
      scan_interval_seconds: interval,
      enabled: true,
      folder_type: folderType,
    })
    setPath('')
    onDone()
  }

  return (
    <form className={styles.addFolderForm} onSubmit={handleSubmit}>
      <select className={styles.select} value={folderType} onChange={e => setFolderType(e.target.value as FolderType)}>
        <option value="source">来源文件夹</option>
        <option value="target">目标文件夹</option>
      </select>
      <input
        className={styles.input}
        value={path}
        onChange={e => setPath(e.target.value)}
        placeholder={folderType === 'source' ? '来源目录绝对路径（将被扫描）' : '目标目录绝对路径（整理归档到这里）'}
        style={{ flex: 1 }}
      />
      {folderType === 'source' && (
        <select className={styles.select} value={interval} onChange={e => setInterval(Number(e.target.value))}>
          {INTERVAL_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )}
      <button className={styles.btnPrimary} type="submit" disabled={create.isPending}>添加</button>
      <button type="button" className={styles.btnGhost} onClick={onDone}>取消</button>
    </form>
  )
}

const PROVIDER_OPTIONS: { label: string; value: AISettings['provider'] }[] = [
  { label: '星河社区', value: 'xinghe' },
  { label: 'Ollama 本地模型', value: 'ollama' },
  { label: 'OpenAI Compatible', value: 'openai-compatible' },
  { label: '自定义 API', value: 'custom' },
]

function AISettingsForm() {
  const { data: saved, isLoading } = useAISettings()
  const save = useSaveAISettings()
  const test = useTestAISettings()
  const [form, setForm] = useState<AISettings>({
    provider: 'xinghe',
    base_url: '',
    api_key: '',
    model: '',
    temperature: 0.3,
    max_tokens: 1000,
    enabled: 1,
  })
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  // 保存成功后同步到 form（只初始化一次，避免用户输入被覆盖）
  useEffect(() => {
    if (saved) {
      setForm(prev => ({ ...prev, ...saved }))
    }
  }, [saved?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (key: keyof AISettings, value: unknown) => {
    setForm(f => ({ ...f, [key]: value }))
    setTestResult(null)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    await save.mutateAsync(form)
    alert('AI 设置已保存')
  }

  const handleTest = async () => {
    const result = await test.mutateAsync(form)
    setTestResult(result)
  }

  if (isLoading) return <div>加载中…</div>

  return (
    <form className={styles.aiForm} onSubmit={handleSave}>
      <div className={styles.formRow}>
        <label>AI 服务商</label>
        <select
          className={styles.select}
          value={form.provider}
          onChange={e => handleChange('provider', e.target.value)}
        >
          {PROVIDER_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <div className={styles.formRow}>
        <label>API Base URL</label>
        <input
          className={styles.input}
          value={form.base_url}
          onChange={e => handleChange('base_url', e.target.value)}
          placeholder="https://api.example.com"
        />
      </div>
      <div className={styles.formRow}>
        <label>API Key</label>
        <input
          className={styles.input}
          type="password"
          value={form.api_key}
          onChange={e => handleChange('api_key', e.target.value)}
          placeholder="sk-..."
        />
      </div>
      <div className={styles.formRow}>
        <label>模型名称</label>
        <input
          className={styles.input}
          value={form.model}
          onChange={e => handleChange('model', e.target.value)}
          placeholder="如 ernie-4.5-turbo-128k"
        />
      </div>
      <div className={styles.formRow}>
        <label>温度参数</label>
        <input
          className={styles.inputSmall}
          type="number"
          step="0.1"
          min="0"
          max="2"
          value={form.temperature}
          onChange={e => handleChange('temperature', Number(e.target.value))}
        />
      </div>
      <div className={styles.formRow}>
        <label>最大输出长度</label>
        <input
          className={styles.inputSmall}
          type="number"
          step="100"
          min="100"
          max="8192"
          value={form.max_tokens}
          onChange={e => handleChange('max_tokens', Number(e.target.value))}
        />
      </div>
      <div className={styles.formActions}>
        <button type="button" className={styles.btnSecondary} onClick={handleTest} disabled={test.isPending}>
          {test.isPending ? '测试中…' : '测试连接'}
        </button>
        <button type="submit" className={styles.btnPrimary} disabled={save.isPending}>
          {save.isPending ? '保存中…' : '保存配置'}
        </button>
      </div>
      {testResult && (
        <div className={testResult.ok ? styles.testOk : styles.testFail}>
          {testResult.ok ? '✅' : '❌'} {testResult.message}
        </div>
      )}
      <p className={styles.hint}>⚠️ API Key 明文保存在本地，Demo 阶段仅限本机使用。</p>
    </form>
  )
}

function ProjectStatusSettingsForm() {
  const { data, isLoading } = useProjectStatusSettings()
  const save = useSaveProjectStatusSettings()
  const [activeDays, setActiveDays] = useState(7)
  const [needsReviewDays, setNeedsReviewDays] = useState(30)

  useEffect(() => {
    if (data) {
      setActiveDays(data.active_days)
      setNeedsReviewDays(data.needs_review_days)
    }
  }, [data])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (needsReviewDays <= activeDays) {
      alert('待确认天数必须大于活跃天数')
      return
    }
    await save.mutateAsync({ active_days: activeDays, needs_review_days: needsReviewDays })
    alert('项目状态规则已保存')
  }

  if (isLoading) return <div>加载中…</div>

  return (
    <form className={styles.aiForm} onSubmit={handleSave}>
      <div className={styles.formRow}>
        <label>活跃天数</label>
        <input
          className={styles.inputSmall}
          type="number"
          min="1"
          max="3650"
          value={activeDays}
          onChange={e => setActiveDays(Number(e.target.value))}
        />
      </div>
      <div className={styles.formRow}>
        <label>待确认天数</label>
        <input
          className={styles.inputSmall}
          type="number"
          min="2"
          max="3650"
          value={needsReviewDays}
          onChange={e => setNeedsReviewDays(Number(e.target.value))}
        />
      </div>
      <div className={styles.formActions}>
        <button type="submit" className={styles.btnPrimary} disabled={save.isPending}>
          {save.isPending ? '保存中…' : '保存规则'}
        </button>
      </div>
      <p className={styles.hint}>
        最近 N 天有文件归档或版本变化时显示为「活跃」；超过待确认天数未活动时显示为「待确认」，中间状态显示为「停滞」。
      </p>
    </form>
  )
}

export default function SettingsPage() {
  const { data: folders, isLoading } = useFolders()
  const [showAddForm, setShowAddForm] = useState(false)

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>设置</h1>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>文件夹配置</h2>
          <button className={styles.btnPrimary} onClick={() => setShowAddForm(v => !v)}>
            {showAddForm ? '取消' : '+ 添加文件夹'}
          </button>
        </div>
        {showAddForm && <AddFolderForm onDone={() => setShowAddForm(false)} />}
        {isLoading ? (
          <div>加载中…</div>
        ) : folders?.length === 0 ? (
          <div className={styles.empty}>暂无文件夹，请添加</div>
        ) : (
          folders?.map(f => <FolderCard key={f.id} folder={f} />)
        )}
      </section>

      <section className={styles.section}>
        <h2>项目状态规则</h2>
        <ProjectStatusSettingsForm />
      </section>

      <section className={styles.section}>
        <h2>AI 模型配置</h2>
        <AISettingsForm />
      </section>
    </div>
  )
}
