import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { dirname } from 'path'
import { DB_PATH } from '../config.js'

// 确保数据库目录存在
mkdirSync(dirname(DB_PATH), { recursive: true })

// 创建 better-sqlite3 单例
const db = new Database(DB_PATH)

// 开启 WAL 模式提升并发读性能
db.pragma('journal_mode = WAL')
// 开启外键约束
db.pragma('foreign_keys = ON')

export default db
