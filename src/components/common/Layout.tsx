import { NavLink, Outlet } from 'react-router-dom'
import styles from './Layout.module.css'
import { useUnreadMessageCount } from '@/hooks/useMessages'

type IconName = 'grid' | 'board' | 'chat' | 'bell' | 'gear' | 'mark' | 'report'

function Icon({ name }: { name: IconName }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  switch (name) {
    case 'grid':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      )
    case 'board':
      return (
        <svg {...common}>
          <rect x="3" y="4" width="5" height="16" rx="1.5" />
          <rect x="10" y="4" width="5" height="11" rx="1.5" />
          <rect x="17" y="4" width="4" height="14" rx="1.5" />
        </svg>
      )
    case 'chat':
      return (
        <svg {...common}>
          <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.6-.8L3 21l1.9-5.4A8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" />
        </svg>
      )
    case 'bell':
      return (
        <svg {...common}>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
      )
    case 'gear':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      )
    case 'mark':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="4" width="4.5" height="16" rx="1.6" fill="url(#sbGrad)" />
          <rect x="9.75" y="4" width="4.5" height="11" rx="1.6" fill="url(#sbGrad)" opacity="0.7" />
          <rect x="16.5" y="4" width="4.5" height="14" rx="1.6" fill="url(#sbGrad)" opacity="0.45" />
          <defs>
            <linearGradient id="sbGrad" x1="3" y1="4" x2="21" y2="20" gradientUnits="userSpaceOnUse">
              <stop stopColor="#6d5efc" />
              <stop offset="1" stopColor="#2bb6d6" />
            </linearGradient>
          </defs>
        </svg>
      )
    case 'report':
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="M8 13h8" />
          <path d="M8 17h8" />
          <path d="M8 9h2" />
        </svg>
      )
    default:
      return null
  }
}

const navItems: { to: string; label: string; icon: IconName }[] = [
  { to: '/workspace', label: '工作台', icon: 'grid' },
  { to: '/kanban', label: '看板', icon: 'board' },
  { to: '/reports', label: '报告', icon: 'report' },
  { to: '/chat', label: '对话', icon: 'chat' },
]

function NavItem({ to, label, icon }: { to: string; label: string; icon: IconName }) {
  return (
    <li>
      <NavLink
        to={to}
        end={to === '/workspace'}
        className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
      >
        <Icon name={icon} />
        <span className={styles.navLabel}>{label}</span>
      </NavLink>
    </li>
  )
}

function MessagesNavItem() {
  const { data } = useUnreadMessageCount()
  const count = data?.count ?? 0
  return (
    <li>
      <NavLink
        to="/messages"
        className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
      >
        <Icon name="bell" />
        <span className={styles.navLabel}>消息</span>
        {count > 0 && <span className={styles.unreadBadge}>{count > 99 ? '99+' : count}</span>}
      </NavLink>
    </li>
  )
}

export default function Layout() {
  return (
    <div className={styles.layout}>
      <nav className={styles.sidebar}>
        <div className={styles.logo}>
          <Icon name="mark" />
          <span className={styles.logoText}>项目经纬</span>
        </div>
        <ul className={styles.navList}>
          {navItems.map(item => (
            <NavItem key={item.to} {...item} />
          ))}
          <MessagesNavItem />
          <li>
            <NavLink
              to="/settings"
              className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
            >
              <Icon name="gear" />
              <span className={styles.navLabel}>设置</span>
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
