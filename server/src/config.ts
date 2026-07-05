// 应用配置常量
export const SERVER_PORT = 3001
export const DB_PATH = new URL('../data/kanban.db', import.meta.url).pathname

// 文件扫描排除列表
export const EXCLUDED_DIRS = new Set([
  '.kanban-archive',
  'node_modules',
  '.git',
])

export const EXCLUDED_FILES = new Set(['.DS_Store'])

// 文本文件预览支持的扩展名
export const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.json',
  '.js',
  '.ts',
  '.tsx',
  '.jsx',
  '.py',
  '.html',
  '.css',
  '.scss',
  '.yaml',
  '.yml',
  '.toml',
  '.sh',
  '.env',
  '.xml',
  '.csv',
])

// 文件内容发送 AI 的最大字节数（50KB）
export const MAX_CONTENT_BYTES = 50 * 1024

// 默认扫描间隔（秒）
export const DEFAULT_SCAN_INTERVAL = 300
