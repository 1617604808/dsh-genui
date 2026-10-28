/** Synthetic real-renderer regression for #382 (`table.wrap`). No host or model
 *  service: just the real renderer, the real stylesheet, and a fixed column
 *  width standing in for the message area.
 *
 *  Two behaviours are pinned against each other:
 *  - the data-table voice (#326): `.table` sizes to `max-content`, cells stay
 *    `nowrap`, and `.tableWrap` scrolls when the table is wider than the
 *    message column. A grid of short values must keep exactly this shape.
 *  - the opt-in prose layout (`wrap: true`): the table tracks the container and
 *    cells wrap, so a column of sentences is readable without a scrollbar —
 *    while `break-word` + a `min-width` floor keep #326's column-collapse bug
 *    (a short column squeezed to one glyph per line) from coming back.
 */
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { GenuiBlock } from '../../src/client/GenuiBlock.tsx'
import { STANDALONE_THEME_CSS } from '../../src/client/artifact/standalone-theme.ts'
import type { GenuiNode } from '../../src/client/spec.ts'

const theme = document.createElement('style')
theme.textContent = STANDALONE_THEME_CSS
document.head.appendChild(theme)

/** #326's incident table: six columns, a 51-char CJK product name, and one cell
 *  carrying a hard `\n`. This is the shape the data-table voice was tuned for. */
const ISSUE_326_ROWS = [[
  '某店',
  '洁柔粉Face悬挂抽纸280抽4层加厚柔韧可湿水不易烂可作洗脸巾可擦手面巾纸餐巾纸',
  'SPU 10001035164766\nSKU 18506716626',
  '¥29.9',
  '1,234',
  '现货',
]]

/** The #382 shape: a comparison table whose columns are full sentences. */
const PROSE_ROWS = [
  ['跨设备记忆同步评估 · 1.7k 字', '2 处，全部真命中（翻案腔、结论冒号）', '5 处顿号，约 3 处是技术枚举，其余是正常并列'],
  ['Reasonix 吸收评估 · 2.4k 字', '1 处，真命中', '23 处顿号，几乎全是技术名词枚举，需要逐条判断'],
]

interface Case {
  name: string
  width: number
  node: GenuiNode
}

const cases: Case[] = [
  {
    name: 'issue326 data table, default',
    width: 818,
    node: {
      type: 'table',
      columns: ['店铺', '商品', '编码', '单价', '库存', '备注'],
      rows: ISSUE_326_ROWS,
    },
  },
  {
    name: 'issue326 data table, wrap',
    width: 818,
    node: {
      type: 'table',
      columns: ['店铺', '商品', '编码', '单价', '库存', '备注'],
      rows: ISSUE_326_ROWS,
      wrap: true,
    },
  },
  {
    name: 'prose table, default',
    width: 640,
    node: {
      type: 'table',
      columns: ['实测样本', 'A 级（机械改）', 'B 级（结构改）'],
      rows: PROSE_ROWS,
    },
  },
  {
    name: 'prose table, wrap',
    width: 640,
    node: {
      type: 'table',
      columns: ['实测样本', 'A 级（机械改）', 'B 级（结构改）'],
      rows: PROSE_ROWS,
      wrap: true,
    },
  },
]

const root = createRoot(document.getElementById('root')!)
flushSync(() => {
  root.render(
    <>
      {cases.map((testCase, index) => (
        <div
          key={index}
          className="case"
          data-case={testCase.name}
          style={{ width: `${testCase.width}px` }}
        >
          <header>{testCase.name} · {testCase.width}px column</header>
          <GenuiBlock spec={{ items: [testCase.node] }} />
        </div>
      ))}
    </>,
  )
})

const measurements = cases.map(testCase => {
  const host = document.querySelector<HTMLElement>(`[data-case="${testCase.name}"]`)!
  const table = host.querySelector('table')!
  const wrap = table.parentElement as HTMLElement
  const row = table.querySelector('tbody tr')!
  const cells = [...row.children] as HTMLElement[]
  const colWidths = cells.map(cell => Math.round(cell.getBoundingClientRect().width))
  return {
    name: testCase.name,
    wrapWidth: Math.round(wrap.getBoundingClientRect().width),
    tableWidth: Math.round(table.getBoundingClientRect().width),
    overflows: wrap.scrollWidth > wrap.clientWidth + 1,
    colWidths,
    minColWidth: Math.min(...colWidths),
    rowHeight: Math.round(row.getBoundingClientRect().height),
    cellWhiteSpace: getComputedStyle(cells[0]!).whiteSpace,
    tableLayout: getComputedStyle(table).tableLayout,
  }
})

document.getElementById('results')!.textContent = JSON.stringify(measurements)
