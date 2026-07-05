import { NavLink, Outlet } from 'react-router-dom'
import styles from './Layout.module.css'
import { useUnreadMessageCount } from '@/hooks/useMessages'

const navItems = [
  { to: '/workspace', label: '🧩 工作台' },
  { to: '/kanban', label: '🗂 看板' },
  { to: '/chat', label: '💬 智能对话' },
]

function MessagesNavItem() {
  const { data } = useUnreadMessageCount()
  const count = data?.count ?? 0
  return (
    <li>
      <NavLink
        to="/messages"
        className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
      >
        🔔 消息
        {count > 0 && <span className={styles.unreadBadge}>{count > 99 ? '99+' : count}</span>}
      </NavLink>
    </li>
  )
}

export default function Layout() {
  return (
    <div className={styles.layout}>
      <nav className={styles.sidebar}>
        <div className={styles.logo}>📁 Kanban</div>
        <ul className={styles.navList}>
          {navItems.map(item => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/workspace'}
                className={({ isActive }) =>
                  `${styles.navLink} ${isActive ? styles.active : ''}`
                }
              >
                {item.label}
              </NavLink>
            </li>
          ))}
          <MessagesNavItem />
          <li>
            <NavLink
              to="/settings"
              className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
            >
              ⚙️ 设置
            </NavLink>
          </li>
        </ul>
      </nav>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}
