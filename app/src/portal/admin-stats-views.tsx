/*
 * Statistics page of the admin server. The charts are plain HTML/CSS bars
 * (plus an SVG line for the average), so they need no chart library and no
 * inline script; admin.js only adds the hover tooltip.
 */

import dayjs from 'dayjs'
import { AdminHeader } from './admin-views'
import { Lang, Messages, t } from './i18n'
import { brandName } from './settings'
import { DayCounts } from './stats'
import { BrandHead, STATIC } from './views'

export type StatsRange = '30' | '90' | 'all'

export interface StatsBucket {
  /** First day of the bucket (YYYY-MM-DD) */
  start: string
  counts: DayCounts
  /** Trailing 7-day average of visitors (daily buckets only) */
  average?: number
}

export interface StatsShareRow {
  id: string
  title: string
  status: 'active' | 'no-password' | 'expired' | 'deleted'
  visitors7: number
  visitorsPrev7: number
  visitorsTotal: number
  downloadsTotal: number
  lastVisit?: string
  daysSinceVisit?: number
  /** Still online, but nobody has come for a while */
  quiet: boolean
  /** Visitors per day, last 30 days */
  spark: number[]
}

export interface StatsPageProps {
  lang: Lang
  csrf: string
  range: StatsRange
  shareId?: string
  rows: StatsShareRow[]
  buckets: StatsBucket[]
  weekly: boolean
  /** Sums over the chart period */
  period: DayCounts
  /** Last 7 days and the 7 days before */
  current: DayCounts
  previous: DayCounts
  lastVisit?: string
  today: string
  persistent: boolean
  deleted: boolean
  error?: string
}

function numberFormat (lang: Lang) {
  const format = new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-GB')
  return (n: number) => format.format(n)
}

/** Round axis ticks: about four steps of 1, 2 or 5 × 10^n. */
export function niceScale (max: number): { top: number, ticks: number[] } {
  if (!(max > 0)) return { top: 1, ticks: [0, 1] }
  const raw = max / 4
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = Math.max(1, ([1, 2, 5, 10].find(s => s * magnitude >= raw) || 10) * magnitude)
  const top = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = 0; v <= top; v += step) ticks.push(v)
  return { top, ticks }
}

/** Indexes of the x-axis labels: about six, anchored at the newest bucket. */
function labelIndexes (n: number): number[] {
  const step = Math.max(1, Math.ceil(n / 6))
  const result: number[] = []
  for (let i = n - 1; i >= 0; i -= step) result.unshift(i)
  return result
}

function lastVisitText (day: string | undefined, today: string, m: Messages): string {
  if (!day) return m.stats.never
  const ago = dayjs(today).diff(dayjs(day), 'day')
  if (ago <= 0) return m.stats.today
  if (ago === 1) return m.stats.yesterday
  return m.stats.daysAgo(ago)
}

function Delta ({ current, previous, m }: { current: number, previous: number, m: Messages }) {
  let text: string
  let kind: string
  if (!current && !previous) {
    text = m.stats.deltaNone
    kind = 'same'
  } else if (!previous) {
    text = m.stats.deltaNew
    kind = 'up'
  } else if (current === previous) {
    text = m.stats.deltaSame
    kind = 'same'
  } else {
    const pct = Math.round(Math.abs(current - previous) / previous * 100)
    kind = current > previous ? 'up' : 'down'
    text = current > previous ? m.stats.deltaUp(pct) : m.stats.deltaDown(pct)
  }
  return <p class={'st-delta st-delta-' + kind}>{text}</p>
}

interface ChartProps {
  lang: Lang
  title: string
  total: string
  buckets: StatsBucket[]
  weekly: boolean
  value: (b: StatsBucket) => number
  tip: (b: StatsBucket, label: string) => string
  average: boolean
  empty: string
}

function Chart (props: ChartProps) {
  const m = t(props.lang)
  const fmt = numberFormat(props.lang)
  const n = props.buckets.length
  const values = props.buckets.map(props.value)
  const averages = props.buckets.map(b => b.average || 0)
  const showAverage = props.average && !props.weekly && values.some(v => v > 0)
  const { top, ticks } = niceScale(Math.max(...values, ...(showAverage ? averages : [0])))
  const label = (b: StatsBucket) => props.weekly
    ? m.stats.weekOf(dayjs(b.start).format(m.dateFormat))
    : dayjs(b.start).format(m.dateFormat)
  const points = averages.map((v, i) => `${i + 0.5},${(top - v).toFixed(2)}`).join(' ')
  return (
    <figure class="st-chart">
      <figcaption>
        <h2>{props.title}</h2>
        <span class="st-total">{props.total}</span>
        {showAverage && (
          <span class="st-legend">
            <span><i class="st-key st-key-bar"/>{m.stats.legendBars}</span>
            <span><i class="st-key st-key-line"/>{m.stats.legendAverage}</span>
          </span>
        )}
      </figcaption>
      <div class="st-plot">
        {ticks.map(v => (
          <div key={v} class="st-gridline" style={`bottom: ${v / top * 100}%`}><span>{fmt(v)}</span></div>
        ))}
        <div class={'st-bars' + (n > 45 ? ' st-dense' : '')}>
          {props.buckets.map((b, i) => (
            <div key={b.start} class="st-col" data-tip={props.tip(b, label(b))}>
              <span style={values[i] > 0 ? `height: ${values[i] / top * 100}%; min-height: 2px` : 'height: 0'}/>
            </div>
          ))}
        </div>
        {showAverage && (
          <svg class="st-line" viewBox={`0 0 ${n} ${top}`} preserveAspectRatio="none" aria-hidden="true">
            <polyline points={points} vector-effect="non-scaling-stroke"/>
          </svg>
        )}
        {!values.some(v => v > 0) && <p class="st-empty">{props.empty}</p>}
      </div>
      <div class="st-xaxis" aria-hidden="true">
        {labelIndexes(n).map(i => (
          <span key={i} style={`left: ${(i + 0.5) / n * 100}%`}>{dayjs(props.buckets[i].start).format(m.stats.shortDate)}</span>
        ))}
      </div>
    </figure>
  )
}

function Sparkline ({ values }: { values: number[] }) {
  const top = Math.max(1, ...values)
  const last = values.length - 1
  const line = values.map((v, i) => `${i},${(top - v).toFixed(2)}`).join(' ')
  return (
    <svg class="st-spark" viewBox={`0 0 ${last} ${top}`} preserveAspectRatio="none" aria-hidden="true">
      <polygon points={`0,${top} ${line} ${last},${top}`}/>
      <polyline points={line} vector-effect="non-scaling-stroke"/>
    </svg>
  )
}

function statusText (status: StatsShareRow['status'], m: Messages): string {
  if (status === 'active') return m.admin.statusActive
  if (status === 'no-password') return m.admin.statusNoPassword
  if (status === 'expired') return m.admin.statusExpired
  return m.stats.statusDeleted
}

function DataTable ({ props, m }: { props: StatsPageProps, m: Messages }) {
  const fmt = numberFormat(props.lang)
  const active = props.buckets.filter(b => b.counts.views || b.counts.downloads || b.counts.logins || b.counts.qr).reverse()
  if (!active.length) return null
  return (
    <details class="st-table-fold">
      <summary>{m.stats.tableToggle}</summary>
      <div class="st-scroll">
        <table class="st-table">
          <thead>
            <tr>
              <th scope="col">{props.weekly ? m.stats.colWeek : m.stats.colDay}</th>
              <th scope="col">{m.stats.colVisitors}</th>
              <th scope="col">{m.stats.colViews}</th>
              <th scope="col">{m.stats.colDownloads}</th>
              <th scope="col">{m.stats.colZips}</th>
              <th scope="col">{m.stats.colLogins}</th>
              <th scope="col">{m.stats.colQr}</th>
            </tr>
          </thead>
          <tbody>
            {active.map(b => (
              <tr key={b.start}>
                <th scope="row">{dayjs(b.start).format(m.dateFormat)}</th>
                <td>{fmt(b.counts.visitors)}</td>
                <td>{fmt(b.counts.views)}</td>
                <td>{fmt(b.counts.downloads)}</td>
                <td>{fmt(b.counts.zips)}</td>
                <td>{fmt(b.counts.logins)}</td>
                <td>{fmt(b.counts.qr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

function ShareTable ({ props, m }: { props: StatsPageProps, m: Messages }) {
  const fmt = numberFormat(props.lang)
  if (!props.rows.length) return null
  return (
    <section class="st-card">
      <h2>{m.stats.sharesHeading}</h2>
      <div class="st-scroll">
        <table class="st-table st-shares">
          <thead>
            <tr>
              <th scope="col">{m.stats.colShare}</th>
              <th scope="col" class="st-spark-col">{m.stats.col30}</th>
              <th scope="col">{m.stats.col7}</th>
              <th scope="col">{m.stats.colTotal}</th>
              <th scope="col">{m.stats.colDownloadsTotal}</th>
              <th scope="col">{m.stats.colLast}</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map(row => (
              <tr key={row.id} class={'st-row-' + row.status + (row.id === props.shareId ? ' st-selected' : '')}>
                <th scope="row">
                  <a href={`/statistik?freigabe=${encodeURIComponent(row.id)}&zeitraum=${props.range}`}>{row.title}</a>
                  <span class="st-status">
                    <span class={'adm-dot st-dot-' + row.status} aria-hidden="true"/>{statusText(row.status, m)}
                  </span>
                  {row.quiet && (
                    <span class="adm-badge adm-warn st-quiet">
                      {row.daysSinceVisit !== undefined ? m.stats.quiet(row.daysSinceVisit) : m.stats.neverVisited}
                    </span>
                  )}
                  {(row.status === 'expired' || row.status === 'deleted') && row.visitorsTotal + row.downloadsTotal > 0 && (
                    <form method="post" action="/statistik/loeschen" class="st-delete" data-confirm={m.stats.deleteConfirm}>
                      <input type="hidden" name="csrf" value={props.csrf}/>
                      <input type="hidden" name="id" value={row.id}/>
                      <button type="submit" class="adm-mini">{m.stats.deleteStats}</button>
                    </form>
                  )}
                </th>
                <td class="st-spark-col"><Sparkline values={row.spark}/></td>
                <td data-label={m.stats.col7}>
                  <span>
                    {fmt(row.visitors7)}
                    {(row.visitors7 > 0 || row.visitorsPrev7 > 0) && row.visitors7 !== row.visitorsPrev7 && (
                      <span class="st-trend" title={m.stats.prevWeekTitle(row.visitorsPrev7)}>
                        {row.visitors7 > row.visitorsPrev7 ? ' ↑' : ' ↓'}
                      </span>
                    )}
                  </span>
                </td>
                <td data-label={m.stats.colTotal}>{fmt(row.visitorsTotal)}</td>
                <td data-label={m.stats.colDownloadsTotal}>{fmt(row.downloadsTotal)}</td>
                <td data-label={m.stats.colLast}>{lastVisitText(row.lastVisit, props.today, m)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p class="adm-note">{m.stats.quietNote}</p>
    </section>
  )
}

export function StatsPage (props: StatsPageProps) {
  const m = t(props.lang)
  const fmt = numberFormat(props.lang)
  const brand = brandName(props.lang)
  const selected = props.rows.find(r => r.id === props.shareId)
  const rangeOptions: Array<[StatsRange, string]> = [['30', m.stats.range30], ['90', m.stats.range90], ['all', m.stats.rangeAll]]
  return (
    <html lang={m.htmlLang}>
      <head>
        <BrandHead lang={props.lang} title={m.stats.title + ' – ' + brand}/>
        <link rel="stylesheet" href={`${STATIC}/portal/admin.css`}/>
      </head>
      <body class="eg-page adm" data-copied={m.admin.copied} data-copy-prompt={m.admin.copyPrompt}>
        <AdminHeader lang={props.lang} active="stats" title={m.stats.title} subtitle={m.stats.intro}/>

        <main class="adm-main">
          {props.error && (
            <div class="adm-alert"><strong>{m.admin.immichError}</strong> {props.error}</div>
          )}
          {!props.persistent && <div class="adm-alert">{m.stats.notPersisted(<code>/app/data</code>)}</div>}
          {props.deleted && <p class="adm-saved">{m.stats.deleted}</p>}

          <form method="get" action="/statistik" class="st-filter" data-autosubmit="">
            <label>
              <span>{m.stats.filterShare}</span>
              <select name="freigabe">
                <option value="">{m.stats.allShares}</option>
                {props.rows.map(row => (
                  <option key={row.id} value={row.id} selected={row.id === props.shareId}>
                    {row.title + (row.status === 'deleted' ? ' ' + m.stats.deletedSuffix : '')}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{m.stats.filterRange}</span>
              <select name="zeitraum">
                {rangeOptions.map(([value, text]) => (
                  <option key={value} value={value} selected={value === props.range}>{text}</option>
                ))}
              </select>
            </label>
            <button type="submit" class="adm-btn st-filter-submit">{m.stats.show}</button>
          </form>

          {selected && (
            <p class="st-selection">
              <strong>{selected.title}</strong> · {statusText(selected.status, m)} · <a href={`/statistik?zeitraum=${props.range}`}>{m.stats.showAll}</a>
            </p>
          )}

          <div class="st-tiles">
            <div class="st-tile">
              <p class="st-tile-label">{m.stats.tileVisitors}</p>
              <p class="st-tile-value">{fmt(props.current.visitors)}</p>
              <Delta current={props.current.visitors} previous={props.previous.visitors} m={m}/>
            </div>
            <div class="st-tile">
              <p class="st-tile-label">{m.stats.tileDownloads}</p>
              <p class="st-tile-value">{fmt(props.current.downloads)}</p>
              <Delta current={props.current.downloads} previous={props.previous.downloads} m={m}/>
            </div>
            <div class="st-tile">
              <p class="st-tile-label">{m.stats.tileLastVisit}</p>
              <p class="st-tile-value">{lastVisitText(props.lastVisit, props.today, m)}</p>
              <p class="st-delta">{props.lastVisit ? dayjs(props.lastVisit).format(m.dateFormat) : ' '}</p>
            </div>
            <div class="st-tile">
              <p class="st-tile-label">{m.stats.tileLogins}</p>
              <p class="st-tile-value">{fmt(props.period.logins + props.period.qr)}</p>
              <p class="st-delta">{m.stats.loginsDetail(fmt(props.period.logins), fmt(props.period.qr))}</p>
            </div>
          </div>

          <section class="st-card">
            <Chart
              lang={props.lang}
              title={props.weekly ? m.stats.chartVisitorsWeek : m.stats.chartVisitors}
              total={m.stats.inPeriod(fmt(props.period.visitors))}
              buckets={props.buckets}
              weekly={props.weekly}
              value={b => b.counts.visitors}
              tip={(b, label) => m.stats.tipVisitors(label, fmt(b.counts.visitors), fmt(b.counts.views)) +
                (b.average !== undefined ? m.stats.tipAverage(fmt(b.average)) : '')}
              average
              empty={m.stats.emptyVisitors}
            />
            <Chart
              lang={props.lang}
              title={props.weekly ? m.stats.chartDownloadsWeek : m.stats.chartDownloads}
              total={m.stats.inPeriod(fmt(props.period.downloads))}
              buckets={props.buckets}
              weekly={props.weekly}
              value={b => b.counts.downloads}
              tip={(b, label) => m.stats.tipDownloads(label, fmt(b.counts.downloads), fmt(b.counts.zips))}
              average={false}
              empty={m.stats.emptyDownloads}
            />
            <DataTable props={props} m={m}/>
          </section>

          <ShareTable props={props} m={m}/>

          <p class="adm-note">{m.stats.countNote}</p>
        </main>
        <div class="st-tip" id="st-tip" role="tooltip" hidden/>
        <script src={`${STATIC}/portal/admin.js`}/>
      </body>
    </html>
  )
}
