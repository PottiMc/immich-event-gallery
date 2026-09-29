/*
 * Statistics page of the admin server: visitors and downloads per day, for
 * all shares or one, plus a table that shows which shares are still in use.
 */

import dayjs, { Dayjs } from 'dayjs'
import express from 'express'
import { Express } from 'express-serve-static-core'
import { h } from 'preact'
import { asyncHandler } from '../http'
import { log } from '../utils/log'
import { renderPage } from '../view/render'
import { adminFormToken, validFormPost } from './admin-forms'
import { StatsBucket, StatsPage, StatsRange, StatsShareRow } from './admin-stats-views'
import { langOf, t } from './i18n'
import { isExpired, linkTitle, listSharedLinks, PortalLink } from './links'
import { settingsPersistent } from './runtime-settings'
import { allStats, DayCounts, deleteShareStats, METRICS, ShareStats, today } from './stats'

/** A share without a visit for this many days is marked as no longer needed. */
export const QUIET_DAYS = 14
/** Longer periods are shown per week, so the bars stay readable. */
const MAX_DAILY_BUCKETS = 120
const DAY = 'YYYY-MM-DD'

function emptyCounts (): DayCounts {
  return { visitors: 0, views: 0, downloads: 0, zips: 0, logins: 0, qr: 0 }
}

function addCounts (target: DayCounts, source: Partial<DayCounts> | undefined) {
  if (!source) return
  for (const metric of METRICS) target[metric] += source[metric] || 0
}

/** The counters of several shares summed per day. */
export function mergeDays (list: ShareStats[]): Map<string, DayCounts> {
  const merged = new Map<string, DayCounts>()
  for (const share of list) {
    for (const [day, counts] of Object.entries(share.days)) {
      const target = merged.get(day) ?? emptyCounts()
      addCounts(target, counts)
      merged.set(day, target)
    }
  }
  return merged
}

function sumRange (days: Map<string, DayCounts>, from: Dayjs, to: Dayjs): DayCounts {
  const total = emptyCounts()
  for (let d = from; !d.isAfter(to, 'day'); d = d.add(1, 'day')) addCounts(total, days.get(d.format(DAY)))
  return total
}

function sumAll (days: Map<string, DayCounts>): DayCounts {
  const total = emptyCounts()
  for (const counts of days.values()) addCounts(total, counts)
  return total
}

function lastDayWith (days: Map<string, DayCounts>, metric: keyof DayCounts): string | undefined {
  let last: string | undefined
  for (const [day, counts] of days) {
    if (counts[metric] > 0 && (!last || day > last)) last = day
  }
  return last
}

export function isStatsRange (value: unknown): value is StatsRange {
  return value === '30' || value === '90' || value === 'all'
}

/**
 * Chart buckets for the period, zero-filled: one per day, or one per week
 * (starting Monday) when the period is long. Daily buckets carry the
 * trailing 7-day average of visitors.
 */
export function buildBuckets (days: Map<string, DayCounts>, range: StatsRange, now = dayjs()): { buckets: StatsBucket[], weekly: boolean } {
  const end = now.startOf('day')
  let start = end.subtract(range === '90' ? 89 : 29, 'day')
  if (range === 'all') {
    const first = [...days.keys()].sort()[0]
    if (first && dayjs(first).isBefore(start)) start = dayjs(first)
  }
  const span = end.diff(start, 'day') + 1
  if (span <= MAX_DAILY_BUCKETS) {
    const buckets: StatsBucket[] = []
    for (let d = start; !d.isAfter(end, 'day'); d = d.add(1, 'day')) {
      const week = sumRange(days, d.subtract(6, 'day'), d)
      buckets.push({
        start: d.format(DAY),
        counts: { ...emptyCounts(), ...days.get(d.format(DAY)) },
        average: Math.round(week.visitors / 7 * 10) / 10
      })
    }
    return { buckets, weekly: false }
  }
  // Monday of the first week (dayjs weeks start on Sunday)
  let weekStart = start.subtract((start.day() + 6) % 7, 'day')
  const buckets: StatsBucket[] = []
  while (!weekStart.isAfter(end, 'day')) {
    buckets.push({ start: weekStart.format(DAY), counts: sumRange(days, weekStart, weekStart.add(6, 'day')) })
    weekStart = weekStart.add(7, 'day')
  }
  return { buckets, weekly: true }
}

type RowStatus = StatsShareRow['status']
const STATUS_ORDER: Record<RowStatus, number> = { active: 0, 'no-password': 1, expired: 2, deleted: 3 }

function rowStatus (link: PortalLink | undefined): RowStatus {
  if (!link) return 'deleted'
  if (isExpired(link)) return 'expired'
  return link.password ? 'active' : 'no-password'
}

/** One table row per share that exists in Immich or has statistics. */
export function buildRows (links: PortalLink[], stats: Record<string, ShareStats>, now = dayjs()): StatsShareRow[] {
  const end = now.startOf('day')
  const byId = new Map(links.map(link => [link.id, link]))
  const ids = new Set([...byId.keys(), ...Object.keys(stats)])
  const rows: StatsShareRow[] = []
  for (const id of ids) {
    const link = byId.get(id)
    const days = mergeDays(stats[id] ? [stats[id]] : [])
    const total = sumAll(days)
    const lastVisit = lastDayWith(days, 'visitors')
    const daysSinceVisit = lastVisit ? end.diff(dayjs(lastVisit), 'day') : undefined
    const status = rowStatus(link)
    const age = link ? end.diff(dayjs(link.createdAt).startOf('day'), 'day') : 0
    const live = status === 'active' || status === 'no-password'
    rows.push({
      id,
      title: link ? linkTitle(link) : stats[id]?.title || id,
      status,
      visitors7: sumRange(days, end.subtract(6, 'day'), end).visitors,
      visitorsPrev7: sumRange(days, end.subtract(13, 'day'), end.subtract(7, 'day')).visitors,
      visitorsTotal: total.visitors,
      downloadsTotal: total.downloads,
      lastVisit,
      daysSinceVisit,
      quiet: live && (daysSinceVisit !== undefined ? daysSinceVisit >= QUIET_DAYS : age >= QUIET_DAYS),
      spark: Array.from({ length: 30 }, (_, i) => days.get(end.subtract(29 - i, 'day').format(DAY))?.visitors || 0)
    })
  }
  rows.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
    b.visitors7 - a.visitors7 || b.visitorsTotal - a.visitorsTotal || a.title.localeCompare(b.title))
  return rows
}

export function registerStatsRoutes (app: Express) {
  app.get('/statistik', asyncHandler(async (req, res) => {
    const lang = langOf(res)
    const range: StatsRange = isStatsRange(req.query.zeitraum) ? req.query.zeitraum : '30'
    const list = await listSharedLinks()
    const stats = allStats()
    const rows = buildRows(list.ok ? list.links : [], stats)
    const shareId = typeof req.query.freigabe === 'string' && rows.some(r => r.id === req.query.freigabe)
      ? req.query.freigabe
      : undefined
    const selected = shareId ? (stats[shareId] ? [stats[shareId]] : []) : Object.values(stats)
    const days = mergeDays(selected)
    const { buckets, weekly } = buildBuckets(days, range)
    const end = dayjs(today())
    const current = sumRange(days, end.subtract(6, 'day'), end)
    const previous = sumRange(days, end.subtract(13, 'day'), end.subtract(7, 'day'))
    const period = emptyCounts()
    for (const bucket of buckets) addCounts(period, bucket.counts)
    res.send(renderPage(h(StatsPage, {
      lang,
      csrf: adminFormToken(),
      range,
      shareId,
      rows,
      buckets,
      weekly,
      period,
      current,
      previous,
      lastVisit: lastDayWith(days, 'visitors'),
      today: end.format(DAY),
      persistent: settingsPersistent(),
      deleted: 'geloescht' in req.query,
      error: list.ok ? undefined : list.message
    })))
  }))

  app.post('/statistik/loeschen', express.urlencoded({ extended: false, limit: '2kb' }), (req, res) => {
    const id = req.body?.id
    if (!validFormPost(req) || typeof id !== 'string' || !allStats()[id]) {
      res.status(400).send(t(langOf(res)).admin.invalidForm)
      return
    }
    deleteShareStats(id)
    log('Admin: statistics of share ' + id + ' deleted')
    res.redirect(303, '/statistik?geloescht')
  })
}
