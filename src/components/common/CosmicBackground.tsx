import { useMemo } from 'react'
import styles from './CosmicBackground.module.css'

export default function CosmicBackground() {
  const { dots, sparks } = useMemo(() => {
    const dots = Array.from({ length: 66 }, () => ({
      left: Math.random() * 100,
      top: Math.random() * 100,
      size: Math.random() * 1.8 + 0.8,
      delay: Math.random() * 4,
      dur: Math.random() * 3 + 2.5,
    }))
    const sparks = Array.from({ length: 11 }, () => ({
      left: Math.random() * 92 + 3,
      top: Math.random() * 88 + 4,
      delay: Math.random() * 5,
      dur: Math.random() * 3 + 4,
    }))
    return { dots, sparks }
  }, [])

  return (
    <div className={styles.cosmic} aria-hidden="true">
      <div className={styles.aurora} />
      <div className={styles.ribbon}>
        <svg viewBox="0 0 1440 600" preserveAspectRatio="none">
          <defs>
            <linearGradient id="cosmicG1" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#3fbf8f" stopOpacity="0" />
              <stop offset="35%" stopColor="#3fbf8f" stopOpacity="0.8" />
              <stop offset="70%" stopColor="#2bb6d6" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#b27cff" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="cosmicG2" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#7c8cff" stopOpacity="0" />
              <stop offset="50%" stopColor="#3fbf8f" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#b27cff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path className={`${styles.r1}`} fill="none" stroke="url(#cosmicG1)" strokeWidth="60" strokeLinecap="round"
            d="M-100 170 C 250 90, 520 250, 800 150 S 1250 210, 1540 130" />
          <path className={`${styles.r2}`} fill="none" stroke="url(#cosmicG2)" strokeWidth="46" strokeLinecap="round"
            d="M-100 250 C 300 170, 600 330, 900 230 S 1300 290, 1540 210" />
        </svg>
      </div>
      <div className={styles.stars}>
        {dots.map((d, i) => (
          <span
            key={`d${i}`}
            className={styles.dot}
            style={{
              left: `${d.left}%`,
              top: `${d.top}%`,
              width: `${d.size}px`,
              height: `${d.size}px`,
              animationDelay: `${d.delay}s`,
              animationDuration: `${d.dur}s`,
            }}
          />
        ))}
        {sparks.map((s, i) => (
          <span
            key={`s${i}`}
            className={styles.spark}
            style={{
              left: `${s.left}%`,
              top: `${s.top}%`,
              animationDelay: `${s.delay}s`,
              animationDuration: `${s.dur}s`,
            }}
          />
        ))}
      </div>
    </div>
  )
}
