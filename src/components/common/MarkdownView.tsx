import { Fragment, type ReactNode } from 'react'
import styles from './MarkdownView.module.css'

type Block =
  | { type: 'h1' | 'h2' | 'h3'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'hr' }
  | { type: 'ul'; items: string[] }
  | { type: 'table'; header: string[]; rows: string[][] }
  | { type: 'p'; text: string }

function splitRow(line: string): string[] {
  return line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(s => s.trim())
}

function parseBlocks(content: string): Block[] {
  const lines = content.split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('### ')) {
      blocks.push({ type: 'h3', text: line.slice(4) })
      i++
    } else if (line.startsWith('## ')) {
      blocks.push({ type: 'h2', text: line.slice(3) })
      i++
    } else if (line.startsWith('# ')) {
      blocks.push({ type: 'h1', text: line.slice(2) })
      i++
    } else if (line.trim() === '---') {
      blocks.push({ type: 'hr' })
      i++
    } else if (line.startsWith('> ')) {
      blocks.push({ type: 'quote', text: line.slice(2) })
      i++
    } else if (line.startsWith('|')) {
      const header = splitRow(line)
      const sep = lines[i + 1]
      if (sep && sep.includes('-') && /^\s*\|?[\s:|-]+\|?\s*$/.test(sep)) {
        i += 2
        const rows: string[][] = []
        while (i < lines.length && lines[i].startsWith('|')) {
          rows.push(splitRow(lines[i]))
          i++
        }
        blocks.push({ type: 'table', header, rows })
      } else {
        blocks.push({ type: 'p', text: line })
        i++
      }
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      const items: string[] = []
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('* '))) {
        items.push(lines[i].slice(2))
        i++
      }
      blocks.push({ type: 'ul', items })
    } else if (line.trim() === '') {
      i++
    } else {
      blocks.push({ type: 'p', text: line })
      i++
    }
  }

  return blocks
}

// 行内渲染：支持 **加粗**
function renderInline(text: string): ReactNode {
  const parts = text.split('**')
  return parts.map((p, idx) =>
    idx % 2 === 1 ? <strong key={idx}>{p}</strong> : <Fragment key={idx}>{p}</Fragment>,
  )
}

export default function MarkdownView({ content }: { content: string }) {
  const blocks = parseBlocks(content)

  return (
    <div className={styles.md}>
      {blocks.map((b, idx) => {
        switch (b.type) {
          case 'h1':
            return <h1 key={idx} className={styles.h1}>{renderInline(b.text)}</h1>
          case 'h2':
            return <h2 key={idx} className={styles.h2}>{renderInline(b.text)}</h2>
          case 'h3':
            return <h3 key={idx} className={styles.h3}>{renderInline(b.text)}</h3>
          case 'hr':
            return <hr key={idx} className={styles.hr} />
          case 'quote':
            return <blockquote key={idx} className={styles.quote}>{renderInline(b.text)}</blockquote>
          case 'ul':
            return (
              <ul key={idx} className={styles.ul}>
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it)}</li>
                ))}
              </ul>
            )
          case 'table':
            return (
              <table key={idx} className={styles.table}>
                <thead>
                  <tr>
                    {b.header.map((h, j) => (
                      <th key={j}>{renderInline(h)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((row, j) => (
                    <tr key={j}>
                      {row.map((cell, k) => (
                        <td key={k}>{renderInline(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          case 'p':
            return <p key={idx} className={styles.p}>{renderInline(b.text)}</p>
          default:
            return null
        }
      })}
    </div>
  )
}
