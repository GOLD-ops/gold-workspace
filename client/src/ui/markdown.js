// 轻量 Markdown 渲染：用于笔记等富文本内容的展示
// 兼容旧数据：若内容本身是 HTML，则原样返回
export function renderMarkdown(src) {
  if (!src) return ''
  const text = String(src)
  const t = text.trim()
  if (t.startsWith('<') || /<\/[a-z]+>|<br\s*\/?>/.test(t)) return text

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  // 行内格式：先转义，再处理 代码/粗体/斜体/链接
  function inline(s) {
    let h = esc(s)
    h = h.replace(/`([^`\n]+)`/g, '<code>$1</code>')
    h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    h = h.replace(/\*([^*]+)\*/g, '<em>$1</em>')
    h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, t, u) => {
      const safe = String(u).trim().replace(/^(javascript|vbscript|data):/i, '#')
      return `<a href="${safe}" target="_blank" rel="noopener">${t}</a>`
    })
    return h
  }

  // 任务列表项：- [ ] / - [x]
  function itemInline(s) {
    const m = s.match(/^\[([ xX])\]\s+(.*)$/)
    if (m) {
      const checked = /[xX]/.test(m[1])
      return (
        '<span class="md-task">' +
        `<input type="checkbox" disabled${checked ? ' checked' : ''}>` +
        `<span>${inline(m[2])}</span></span>`
      )
    }
    return inline(s)
  }

  // ---- 表格解析 ----
  function isTableRow(line) {
    return line.includes('|') && splitRow(line).length >= 2
  }
  function splitRow(line) {
    let s = line.trim()
    if (s.startsWith('|')) s = s.slice(1)
    if (s.endsWith('|')) s = s.slice(0, -1)
    return s.split('|').map((c) => c.trim())
  }
  function isTableSep(line) {
    const cells = splitRow(line)
    return cells.length >= 2 && cells.every((c) => /^:?-{3,}:?$/.test(c))
  }
  function tableAligns(line) {
    return splitRow(line).map((c) => {
      if (c.startsWith(':') && c.endsWith(':')) return 'center'
      if (c.endsWith(':')) return 'right'
      if (c.startsWith(':')) return 'left'
      return ''
    })
  }
  function renderTable(headerLine, sepLine, rowLines) {
    const headers = splitRow(headerLine)
    const aligns = tableAligns(sepLine)
    let out = '<table>\n<thead>\n<tr>'
    headers.forEach((c, i) => {
      const a = aligns[i]
      out += `<th${a ? ` style="text-align:${a}"` : ''}>${inline(c)}</th>`
    })
    out += '</tr>\n</thead>\n'
    if (rowLines.length) {
      out += '<tbody>\n'
      for (const row of rowLines) {
        const cells = splitRow(row)
        out += '<tr>'
        for (let j = 0; j < cells.length; j++) {
          const a = aligns[j]
          out += `<td${a ? ` style="text-align:${a}"` : ''}>${inline(cells[j] || '')}</td>`
        }
        out += '</tr>\n'
      }
      out += '</tbody>\n'
    }
    return out + '</table>\n'
  }

  const lines = text.split('\n')
  let html = ''
  let listType = null
  let inCode = false
  let codeBuf = []

  const closeList = () => {
    if (listType) {
      html += `</${listType}>\n`
      listType = null
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const line = raw.trim()

    if (line.startsWith('```')) {
      if (inCode) {
        html += `<pre><code>${esc(codeBuf.join('\n'))}</code></pre>\n`
        codeBuf = []
        inCode = false
      } else {
        closeList()
        inCode = true
      }
      continue
    }
    if (inCode) {
      codeBuf.push(raw)
      continue
    }

    // 空行：列表保持不中断（GitHub 风格），其它位置输出换行
    if (!line) {
      if (!listType) html += '\n'
      continue
    }

    // 分隔线：--- / *** / ___
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      closeList()
      html += '<hr>\n'
      continue
    }

    // 标题 1-6 级
    if (/^#{1,6}\s/.test(line)) {
      closeList()
      const level = line.match(/^(#+)/)[1].length
      html += `<h${level}>${inline(line.replace(/^#+\s/, ''))}</h${level}>\n`
      continue
    }

    // 表格：表头行 + 分隔行
    if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1].trim())) {
      closeList()
      const sepLine = lines[i + 1].trim()
      i += 2
      const rows = []
      while (i < lines.length) {
        const r = lines[i].trim()
        if (!r || !isTableRow(r)) break
        rows.push(r)
        i++
      }
      i--
      html += renderTable(line, sepLine, rows)
      continue
    }

    if (/^>\s?/.test(line)) {
      closeList()
      html += `<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>\n`
      continue
    }

    // 无序列表（含任务列表）
    const ulMatch = line.match(/^([-*+])\s+(.*)$/)
    if (ulMatch) {
      if (listType !== 'ul') {
        closeList()
        html += '<ul>\n'
        listType = 'ul'
      }
      html += `<li>${itemInline(ulMatch[2])}</li>\n`
      continue
    }

    // 有序列表
    const olMatch = line.match(/^\d+[.)]\s+(.*)$/)
    if (olMatch) {
      if (listType !== 'ol') {
        closeList()
        html += '<ol>\n'
        listType = 'ol'
      }
      html += `<li>${itemInline(olMatch[1])}</li>\n`
      continue
    }

    closeList()
    html += `<p>${inline(line)}</p>\n`
  }
  closeList()
  if (inCode) html += `<pre><code>${esc(codeBuf.join('\n'))}</code></pre>\n`
  return html
}
