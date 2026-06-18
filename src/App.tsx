import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getAnalyticsSummary,
  getBottlenecks,
  getDemoMonitoringStatus,
  getFabMap,
  getOhts,
  getOperationsOverview,
  getTransferRequests,
  openMonitoringStream,
  startDemoMonitoring,
  stopDemoMonitoring,
  tickDemoMonitoring,
  type AlertSeverity,
  type AnalyticsSummaryResponse,
  type BottleneckResponse,
  type DemoMonitoringStatusResponse,
  type FabMapResponse,
  type FabNodeResponse,
  type MonitoringEvent,
  type OhtResponse,
  type OperationsOverviewResponse,
  type PageResponse,
  type TransferPriority,
  type TransferRequestResponse,
  type TransferStatus,
} from './api'
import './App.css'

type LiveTransfer = TransferRequestResponse & {
  demo?: boolean
  updatedAt?: string
}

type EventFilter = 'ALL' | 'WARNING' | 'CRITICAL' | 'OHT' | 'TRANSFER' | 'ROUTE'

const emptyOverview: OperationsOverviewResponse = {
  counts: {
    waitingTransfers: 0,
    assignedTransfers: 0,
    movingTransfers: 0,
    completedTransfers: 0,
    failedTransfers: 0,
    canceledTransfers: 0,
    idleOhts: 0,
    reservedOhts: 0,
    movingOhts: 0,
    errorOhts: 0,
    blockedEdges: 0,
  },
  recentProblemTransfers: [],
  abnormalOhts: [],
  blockedEdges: [],
}

const emptyTransfers: PageResponse<TransferRequestResponse> = {
  content: [],
  page: 0,
  size: 20,
  totalElements: 0,
  totalPages: 0,
  first: true,
  last: true,
}

const emptyMap: FabMapResponse = { nodes: [], edges: [] }
const emptyAnalytics: AnalyticsSummaryResponse = {
  totalRequests: 0,
  completedRequests: 0,
  failedRequests: 0,
  canceledRequests: 0,
  completionRate: 0,
  failureRate: 0,
  averageTransferSeconds: 0,
  p95TransferSeconds: 0,
  delayedRequests: 0,
}

const statusTabs: Array<{ label: string; value: TransferStatus | '' }> = [
  { label: '전체', value: '' },
  { label: '대기', value: 'WAITING' },
  { label: '배정', value: 'ASSIGNED' },
  { label: '이동', value: 'MOVING' },
  { label: '완료', value: 'COMPLETED' },
  { label: '실패', value: 'FAILED' },
]

const eventFilters: Array<{ label: string; value: EventFilter }> = [
  { label: '전체', value: 'ALL' },
  { label: '경고', value: 'WARNING' },
  { label: '치명', value: 'CRITICAL' },
  { label: 'OHT', value: 'OHT' },
  { label: '반송', value: 'TRANSFER' },
  { label: '경로', value: 'ROUTE' },
]

function App() {
  const [overview, setOverview] = useState<OperationsOverviewResponse>(emptyOverview)
  const [transfers, setTransfers] = useState<PageResponse<TransferRequestResponse>>(emptyTransfers)
  const [fabMap, setFabMap] = useState<FabMapResponse>(emptyMap)
  const [ohts, setOhts] = useState<OhtResponse[]>([])
  const [liveTransfers, setLiveTransfers] = useState<LiveTransfer[]>([])
  const [liveFabMap, setLiveFabMap] = useState<FabMapResponse>(emptyMap)
  const [liveOhts, setLiveOhts] = useState<OhtResponse[]>([])
  const [analytics, setAnalytics] = useState<AnalyticsSummaryResponse>(emptyAnalytics)
  const [bottlenecks, setBottlenecks] = useState<BottleneckResponse[]>([])
  const [events, setEvents] = useState<MonitoringEvent[]>([])
  const [demoStatus, setDemoStatus] = useState<DemoMonitoringStatusResponse | null>(null)
  const [streamConnected, setStreamConnected] = useState(false)
  const [statusFilter, setStatusFilter] = useState<TransferStatus | ''>('')
  const [eventFilter, setEventFilter] = useState<EventFilter>('ALL')
  const [selectedOhtId, setSelectedOhtId] = useState('OHT-01')
  const [selectedTransferId, setSelectedTransferId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null)
  const [workingDemo, setWorkingDemo] = useState(false)

  const loadControlRoom = useCallback(async () => {
    setError(null)
    try {
      const [overviewData, transferData, mapData, ohtData, analyticsData, bottleneckData, demoData] =
        await Promise.all([
          getOperationsOverview(10),
          getTransferRequests({ status: statusFilter, page: 0, size: 10 }),
          getFabMap(),
          getOhts(),
          getAnalyticsSummary(),
          getBottlenecks(5),
          getDemoMonitoringStatus(),
        ])
      setOverview(overviewData)
      setTransfers(transferData)
      setFabMap(mapData)
      setOhts(ohtData)
      setLiveFabMap(mapData)
      setLiveOhts(ohtData)
      setLiveTransfers(transferData.content)
      setAnalytics(analyticsData)
      setBottlenecks(bottleneckData)
      setDemoStatus(demoData)
      setSelectedOhtId((current) => current || ohtData[0]?.ohtId || 'OHT-01')
      setSelectedTransferId((current) => current ?? transferData.content[0]?.requestId ?? null)
      setLastLoadedAt(new Date().toISOString())
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : '관제 데이터를 불러오지 못했습니다.')
    }
  }, [statusFilter])

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadControlRoom()
    }, 0)
    return () => window.clearTimeout(timerId)
  }, [loadControlRoom])

  const applyMonitoringEvent = useCallback((event: MonitoringEvent) => {
    setLiveOhts((current) => applyOhtEvent(current, event))
    setLiveTransfers((current) => applyTransferEvent(current, event))
    setLiveFabMap((current) => applyFabEvent(current, event))
  }, [])

  useEffect(() => {
    const source = openMonitoringStream((event) => {
      setEvents((current) => [event, ...current].slice(0, 24))
      applyMonitoringEvent(event)
      if (typeof event.ohtId === 'string') {
        setSelectedOhtId(event.ohtId)
      }
      const requestId = numberValue(event.requestId)
      if (requestId) {
        setSelectedTransferId(requestId)
      }
      void getDemoMonitoringStatus().then(setDemoStatus).catch(() => undefined)
    })

    source.onopen = () => setStreamConnected(true)
    source.onerror = () => setStreamConnected(false)

    return () => source.close()
  }, [applyMonitoringEvent])

  const visibleTransfers = useMemo(() => {
    const rows = liveTransfers.length > 0 ? liveTransfers : transfers.content
    return statusFilter ? rows.filter((row) => row.status === statusFilter) : rows
  }, [liveTransfers, statusFilter, transfers.content])

  const selectedOht = useMemo(
    () => liveOhts.find((oht) => oht.ohtId === selectedOhtId) ?? liveOhts[0] ?? ohts[0] ?? null,
    [liveOhts, ohts, selectedOhtId],
  )

  const selectedTransfer = useMemo(() => {
    if (selectedTransferId) {
      const selected = visibleTransfers.find((transfer) => transfer.requestId === selectedTransferId)
      if (selected) return selected
    }
    if (selectedOht?.currentRequestId) {
      return visibleTransfers.find((transfer) => transfer.requestId === selectedOht.currentRequestId) ?? null
    }
    return visibleTransfers[0] ?? null
  }, [selectedOht, selectedTransferId, visibleTransfers])

  const filteredEvents = useMemo(
    () => events.filter((event) => matchesEventFilter(event, eventFilter)),
    [eventFilter, events],
  )

  const selectedTransferEvents = useMemo(() => {
    if (!selectedTransfer) return []
    return events.filter((event) => numberValue(event.requestId) === selectedTransfer.requestId).slice(0, 5)
  }, [events, selectedTransfer])

  const liveCounts = useMemo(() => countLiveState(overview, visibleTransfers, liveOhts, liveFabMap), [
    overview,
    visibleTransfers,
    liveOhts,
    liveFabMap,
  ])

  async function runDemoAction(action: () => Promise<DemoMonitoringStatusResponse | unknown>) {
    setWorkingDemo(true)
    setError(null)
    try {
      await action()
      const status = await getDemoMonitoringStatus()
      setDemoStatus(status)
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : '데모 모니터링 제어에 실패했습니다.')
    } finally {
      setWorkingDemo(false)
    }
  }

  return (
    <main className="control-shell">
      <header className="control-topbar">
        <div className="brand-block">
          <button className="menu-button" type="button" aria-label="메뉴">
            <span />
            <span />
            <span />
          </button>
          <h1>AMHS/OHT 반송 관제</h1>
        </div>
        <div className="topbar-status">
          <StatusText label="FAB" value="FAB-01" />
          <StatusText label="시뮬레이션" value={demoStatus?.running ? '실행중' : '중지'} active={demoStatus?.running} />
          <StatusText label="SSE" value={streamConnected ? '연결 정상' : '대기'} active={streamConnected} />
          <StatusText label="이벤트" value={`${demoStatus?.emittedEvents ?? 0}건`} />
          <StatusText label="마지막 수신" value={formatTime(events[0]?.occurredAt ?? demoStatus?.lastEventAt ?? lastLoadedAt)} />
        </div>
      </header>

      {error && <div className="system-message">{error}</div>}

      <section className="control-grid">
        <section className="pane queue-pane">
          <PaneHeader title="반송작업 현황" right={`${visibleTransfers.length}건`} />
          <div className="status-tabs">
            {statusTabs.map((tab) => (
              <button
                className={statusFilter === tab.value ? 'active' : ''}
                key={tab.label}
                type="button"
                onClick={() => setStatusFilter(tab.value)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <TransferTable
            rows={visibleTransfers}
            selectedRequestId={selectedTransfer?.requestId ?? null}
            onSelect={(transfer) => {
              setSelectedTransferId(transfer.requestId)
              if (transfer.assignedOhtId) {
                setSelectedOhtId(transfer.assignedOhtId)
              }
            }}
          />
        </section>

        <section className="pane map-pane">
          <PaneHeader
            title="FAB 반송 지도"
            right={
              <div className="demo-actions">
                <button disabled={workingDemo || demoStatus?.running} type="button" onClick={() => runDemoAction(startDemoMonitoring)}>
                  실행
                </button>
                <button disabled={workingDemo || !demoStatus?.running} type="button" onClick={() => runDemoAction(stopDemoMonitoring)}>
                  정지
                </button>
                <button disabled={workingDemo} type="button" onClick={() => runDemoAction(tickDemoMonitoring)}>
                  1회 발생
                </button>
              </div>
            }
          />
          <FabMapCanvas
            events={events}
            map={liveFabMap.nodes.length > 0 ? liveFabMap : fabMap}
            ohts={liveOhts.length > 0 ? liveOhts : ohts}
            selectedOhtId={selectedOht?.ohtId ?? null}
            onSelectOht={setSelectedOhtId}
          />
        </section>

        <aside className="side-stack">
          <section className="pane oht-pane">
            <PaneHeader title="OHT 장비 상태" right={selectedOht?.ohtId ?? '-'} />
            <OhtDetail oht={selectedOht} transfer={selectedTransfer} />
            <OhtTable ohts={liveOhts.length > 0 ? liveOhts : ohts} selectedOhtId={selectedOht?.ohtId ?? null} onSelect={setSelectedOhtId} />
          </section>

          <section className="pane event-pane">
            <PaneHeader title="실시간 이벤트" right={streamConnected ? 'LIVE' : 'OFF'} />
            <EventFilterBar value={eventFilter} onChange={setEventFilter} />
            <EventLog events={filteredEvents} />
          </section>
        </aside>
      </section>

      <section className="bottom-grid">
        <section className="pane metrics-pane">
          <PaneHeader title="운영 지표" right="Live + Today" />
          <div className="metric-strip">
            <Metric label="활성 작업" value={`${liveCounts.activeTransfers.toLocaleString()}건`} />
            <Metric label="완료율" value={formatPercent(analytics.completionRate)} tone="good" />
            <Metric label="평균 반송" value={`${analytics.averageTransferSeconds.toFixed(1)}초`} />
            <Metric label="P95 반송" value={`${analytics.p95TransferSeconds.toFixed(1)}초`} tone="warn" />
            <Metric label="차단 구간" value={`${liveCounts.blockedEdges.toLocaleString()}건`} tone="warn" />
            <Metric label="장비 오류" value={`${liveCounts.errorOhts.toLocaleString()}건`} tone="bad" />
          </div>
        </section>

        <section className="pane transfer-detail-pane">
          <PaneHeader title="선택 작업 상세" right={selectedTransfer ? `#${selectedTransfer.requestId}` : '-'} />
          <TransferDetail transfer={selectedTransfer} events={selectedTransferEvents} />
        </section>

        <section className="pane bottleneck-pane">
          <PaneHeader title="병목 구간" right={`${liveCounts.blockedEdges} blocked`} />
          <BottleneckTable rows={bottlenecks} />
        </section>
      </section>
    </main>
  )
}

function PaneHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <header className="pane-header">
      <h2>{title}</h2>
      {right && <div className="pane-action">{right}</div>}
    </header>
  )
}

function StatusText({ label, value, active = false }: { label: string; value: string; active?: boolean }) {
  return (
    <span className="status-text">
      <em>{label}</em>
      <strong className={active ? 'active' : ''}>{value}</strong>
    </span>
  )
}

function TransferTable({
  rows,
  selectedRequestId,
  onSelect,
}: {
  rows: LiveTransfer[]
  selectedRequestId: number | null
  onSelect: (transfer: LiveTransfer) => void
}) {
  if (rows.length === 0) {
    return <div className="empty-state">조회된 반송 작업이 없습니다.</div>
  }

  return (
    <div className="table-wrap">
      <table className="ops-table">
        <thead>
          <tr>
            <th>작업ID</th>
            <th>출발</th>
            <th>도착</th>
            <th>우선순위</th>
            <th>상태</th>
            <th>OHT</th>
            <th>경과</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              className={`${row.demo ? 'demo-row' : ''} ${selectedRequestId === row.requestId ? 'selected-row' : ''}`}
              key={`${row.demo ? 'demo' : 'db'}-${row.requestId}`}
              onClick={() => onSelect(row)}
            >
              <td>#{row.requestId}</td>
              <td>{row.sourceNodeId}</td>
              <td>{row.destinationNodeId}</td>
              <td>
                <PriorityBadge priority={row.priority} />
              </td>
              <td>
                <StatusBadge status={row.status} />
              </td>
              <td>{row.assignedOhtId ?? '-'}</td>
              <td>{formatElapsed(row.requestedAt, row.completedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FabMapCanvas({
  events,
  map,
  ohts,
  selectedOhtId,
  onSelectOht,
}: {
  events: MonitoringEvent[]
  map: FabMapResponse
  ohts: OhtResponse[]
  selectedOhtId: string | null
  onSelectOht: (ohtId: string) => void
}) {
  const nodeById = new Map(map.nodes.map((node) => [node.nodeId, node]))
  const bounds = getMapBounds(map.nodes)
  const activeEdge = events.find((event) => typeof event.fromNodeId === 'string' && typeof event.toNodeId === 'string')

  if (map.nodes.length === 0) {
    return <div className="empty-state map-empty">FAB 지도를 불러오는 중입니다.</div>
  }

  return (
    <div className="fab-map">
      <svg viewBox="0 0 1040 610" role="img" aria-label="FAB 반송 지도">
        <defs>
          <pattern id="fab-grid" width="30" height="30" patternUnits="userSpaceOnUse">
            <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#18334a" strokeWidth="1" />
          </pattern>
        </defs>
        <rect className="map-bg" width="1040" height="610" />
        {map.edges.map((edge) => {
          const from = nodeById.get(edge.fromNodeId)
          const to = nodeById.get(edge.toNodeId)
          if (!from || !to) return null
          const fromPoint = toSvgPoint(from, bounds)
          const toPoint = toSvgPoint(to, bounds)
          const moving = activeEdge?.fromNodeId === edge.fromNodeId && activeEdge?.toNodeId === edge.toNodeId
          return (
            <g key={edge.edgeId}>
              <line
                className={`track-line ${edge.blocked ? 'blocked' : ''} ${moving ? 'moving' : ''}`}
                x1={fromPoint.x}
                x2={toPoint.x}
                y1={fromPoint.y}
                y2={toPoint.y}
              />
              {(edge.blocked || moving) && (
                <text className={edge.blocked ? 'edge-flag blocked' : 'edge-flag moving'} x={(fromPoint.x + toPoint.x) / 2} y={(fromPoint.y + toPoint.y) / 2 - 9}>
                  {edge.blocked ? '차단' : '이동'}
                </text>
              )}
            </g>
          )
        })}
        {map.nodes.map((node) => {
          const point = toSvgPoint(node, bounds)
          return (
            <g className={`node node-${node.nodeType.toLowerCase()}`} key={node.nodeId}>
              <circle cx={point.x} cy={point.y} r="7" />
              <rect x={point.x - 54} y={point.y - 41} width="108" height="28" rx="4" />
              <text x={point.x} y={point.y - 23}>{node.nodeId}</text>
            </g>
          )
        })}
        {ohts.map((oht, index) => {
          const node = nodeById.get(oht.currentNodeId) ?? map.nodes[index % map.nodes.length]
          if (!node) return null
          const point = toSvgPoint(node, bounds)
          const offset = (index % 3) * 16 - 16
          return (
            <g
              className={`oht-marker ${oht.status.toLowerCase()} ${selectedOhtId === oht.ohtId ? 'selected' : ''}`}
              key={oht.ohtId}
              onClick={() => onSelectOht(oht.ohtId)}
            >
              <rect x={point.x - 31 + offset} y={point.y + 13} width="62" height="26" rx="6" />
              <circle cx={point.x - 18 + offset} cy={point.y + 40} r="3" />
              <circle cx={point.x + 18 + offset} cy={point.y + 40} r="3" />
              <text x={point.x + offset} y={point.y + 30}>{oht.ohtId}</text>
            </g>
          )
        })}
      </svg>
      <div className="map-legend">
        <span><i className="blue" />이동 경로</span>
        <span><i className="orange" />병목 구간</span>
        <span><i className="red" />차단 구간</span>
        <span><i className="gray" />레일</span>
      </div>
    </div>
  )
}

function OhtDetail({ oht, transfer }: { oht: OhtResponse | null; transfer: LiveTransfer | null }) {
  if (!oht) return <div className="empty-state compact">OHT 정보가 없습니다.</div>

  return (
    <div className="oht-detail">
      <div>
        <strong>{oht.ohtId}</strong>
        <StatusBadge status={oht.status} />
      </div>
      <dl>
        <dt>현재 위치</dt>
        <dd>{oht.currentNodeId}</dd>
        <dt>작업</dt>
        <dd>{oht.currentRequestId ? `#${oht.currentRequestId}` : '-'}</dd>
        <dt>적재 FOUP</dt>
        <dd>{oht.carryingFoupId ?? '-'}</dd>
        <dt>도착지</dt>
        <dd>{transfer?.destinationNodeId ?? '-'}</dd>
        <dt>마지막 이동</dt>
        <dd>{formatTime(oht.lastMovedAt)}</dd>
      </dl>
    </div>
  )
}

function TransferDetail({ transfer, events }: { transfer: LiveTransfer | null; events: MonitoringEvent[] }) {
  if (!transfer) {
    return <div className="empty-state compact">선택된 반송 작업이 없습니다.</div>
  }

  return (
    <div className="transfer-detail">
      <div className="detail-summary">
        <strong>#{transfer.requestId}</strong>
        <StatusBadge status={transfer.status} />
        <PriorityBadge priority={transfer.priority} />
      </div>
      <dl>
        <dt>경로</dt>
        <dd>{transfer.sourceNodeId} → {transfer.destinationNodeId}</dd>
        <dt>담당 OHT</dt>
        <dd>{transfer.assignedOhtId ?? '-'}</dd>
        <dt>요청 시각</dt>
        <dd>{formatTime(transfer.requestedAt)}</dd>
        <dt>시작 시각</dt>
        <dd>{formatTime(transfer.startedAt)}</dd>
        <dt>완료 시각</dt>
        <dd>{formatTime(transfer.completedAt)}</dd>
        <dt>실패 사유</dt>
        <dd>{transfer.failedReason ?? '-'}</dd>
      </dl>
      <div className="detail-events">
        {events.length === 0 ? (
          <span>이 작업에 연결된 최근 이벤트가 없습니다.</span>
        ) : (
          events.map((event) => (
            <span key={event.eventId}>
              {formatTime(event.occurredAt)} · {event.eventType}
            </span>
          ))
        )}
      </div>
    </div>
  )
}

function OhtTable({ ohts, selectedOhtId, onSelect }: { ohts: OhtResponse[]; selectedOhtId: string | null; onSelect: (ohtId: string) => void }) {
  return (
    <table className="oht-table">
      <tbody>
        {ohts.map((oht) => (
          <tr className={selectedOhtId === oht.ohtId ? 'selected' : ''} key={oht.ohtId} onClick={() => onSelect(oht.ohtId)}>
            <td><span className={`dot ${oht.status.toLowerCase()}`} /></td>
            <td>{oht.ohtId}</td>
            <td><StatusBadge status={oht.status} /></td>
            <td>{oht.currentNodeId}</td>
            <td>{oht.currentRequestId ? `#${oht.currentRequestId}` : '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function EventFilterBar({ value, onChange }: { value: EventFilter; onChange: (value: EventFilter) => void }) {
  return (
    <div className="event-filter-bar">
      {eventFilters.map((filter) => (
        <button
          className={value === filter.value ? 'active' : ''}
          key={filter.value}
          type="button"
          onClick={() => onChange(filter.value)}
        >
          {filter.label}
        </button>
      ))}
    </div>
  )
}

function EventLog({ events }: { events: MonitoringEvent[] }) {
  if (events.length === 0) {
    return <div className="empty-state compact">조건에 맞는 이벤트가 없습니다.</div>
  }

  return (
    <div className="event-log">
      {events.map((event) => (
        <article className={`event-row ${severityClass(event.alertSeverity)}`} key={event.eventId}>
          <time>{formatTime(event.occurredAt)}</time>
          <strong>{event.eventType}</strong>
          <span>{event.alertMessage ?? event.alertTitle ?? '-'}</span>
        </article>
      ))}
    </div>
  )
}

function Metric({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function BottleneckTable({ rows }: { rows: BottleneckResponse[] }) {
  if (rows.length === 0) {
    return <div className="empty-state compact">병목 데이터가 없습니다.</div>
  }

  return (
    <table className="ops-table bottleneck-table">
      <thead>
        <tr>
          <th>순위</th>
          <th>구간</th>
          <th>평균</th>
          <th>P95</th>
          <th>지연</th>
          <th>상태</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={`${row.edgeId}-${row.fromNodeId}-${row.toNodeId}`}>
            <td>{index + 1}</td>
            <td>{row.fromNodeId} → {row.toNodeId}</td>
            <td>{row.averageTravelSeconds.toFixed(1)}초</td>
            <td>{row.p95TravelSeconds.toFixed(1)}초</td>
            <td>{row.delayedCount}</td>
            <td><span className={row.delayedCount > 0 ? 'risk high' : 'risk normal'}>{row.delayedCount > 0 ? '주의' : '정상'}</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function PriorityBadge({ priority }: { priority: TransferPriority }) {
  const labels: Record<TransferPriority, string> = {
    LOW: '낮음',
    NORMAL: '일반',
    HIGH: '높음',
    URGENT: '긴급',
  }
  return <span className={`priority ${priority.toLowerCase()}`}>{labels[priority]}</span>
}

function StatusBadge({ status }: { status: TransferStatus | OhtResponse['status'] }) {
  const labels: Record<string, string> = {
    WAITING: '대기',
    ASSIGNED: '배정',
    MOVING: '이동중',
    COMPLETED: '완료',
    FAILED: '실패',
    CANCELED: '취소',
    IDLE: '대기',
    RESERVED: '예약',
    ERROR: '오류',
  }
  return <span className={`state ${status.toLowerCase()}`}>{labels[status] ?? status}</span>
}

function applyOhtEvent(ohts: OhtResponse[], event: MonitoringEvent): OhtResponse[] {
  const ohtId = stringValue(event.ohtId)
  if (!ohtId) return ohts

  const currentNodeId = stringValue(event.currentNodeId) ?? stringValue(event.toNodeId)
  const currentRequestId = numberValue(event.requestId)
  const nextStatus = ohtStatusFromEvent(event.eventType)
  const next = ohts.map((oht) =>
    oht.ohtId === ohtId
      ? {
          ...oht,
          status: nextStatus ?? oht.status,
          currentNodeId: currentNodeId ?? oht.currentNodeId,
          currentRequestId: nextStatus === 'IDLE' ? null : currentRequestId ?? oht.currentRequestId,
          lastMovedAt: event.occurredAt ?? oht.lastMovedAt,
        }
      : oht,
  )

  if (next.some((oht) => oht.ohtId === ohtId)) return next

  return [
    ...next,
    {
      ohtId,
      status: nextStatus ?? 'IDLE',
      currentNodeId: currentNodeId ?? 'STOCKER-A',
      currentRequestId: currentRequestId ?? null,
      carryingFoupId: null,
      lastMovedAt: event.occurredAt ?? null,
    },
  ]
}

function applyTransferEvent(transfers: LiveTransfer[], event: MonitoringEvent): LiveTransfer[] {
  const requestId = numberValue(event.requestId)
  if (!requestId) return transfers

  const status = transferStatusFromEvent(event.eventType)
  const sourceNodeId = stringValue(event.sourceNodeId) ?? stringValue(event.fromNodeId)
  const destinationNodeId = stringValue(event.destinationNodeId) ?? stringValue(event.toNodeId)
  const ohtId = stringValue(event.ohtId)
  const occurredAt = event.occurredAt ?? new Date().toISOString()

  const existing = transfers.find((transfer) => transfer.requestId === requestId)
  const nextTransfer: LiveTransfer = {
    requestId,
    sourceNodeId: sourceNodeId ?? existing?.sourceNodeId ?? '-',
    destinationNodeId: destinationNodeId ?? existing?.destinationNodeId ?? '-',
    priority: event.alertSeverity === 'CRITICAL' ? 'URGENT' : event.alertSeverity === 'WARNING' ? 'HIGH' : existing?.priority ?? 'NORMAL',
    status: status ?? existing?.status ?? 'ASSIGNED',
    assignedOhtId: ohtId ?? existing?.assignedOhtId ?? null,
    requestedAt: existing?.requestedAt ?? occurredAt,
    assignedAt: existing?.assignedAt ?? (event.eventType === 'OHT_ASSIGNED' ? occurredAt : null),
    startedAt: existing?.startedAt ?? (event.eventType === 'OHT_MOVED' ? occurredAt : null),
    completedAt: event.eventType === 'TRANSFER_COMPLETED' || event.eventType === 'TRANSFER_FAILED' ? occurredAt : existing?.completedAt ?? null,
    failedReason: event.eventType === 'TRANSFER_FAILED' || event.eventType === 'ROUTE_NOT_FOUND' ? event.alertMessage ?? '데모 이벤트' : existing?.failedReason ?? null,
    demo: true,
    updatedAt: occurredAt,
  }

  return [nextTransfer, ...transfers.filter((transfer) => transfer.requestId !== requestId)].slice(0, 20)
}

function applyFabEvent(map: FabMapResponse, event: MonitoringEvent): FabMapResponse {
  if (map.edges.length === 0) return map
  if (event.eventType !== 'EDGE_BLOCKED' && event.eventType !== 'EDGE_UNBLOCKED') return map

  const edgeId = stringValue(event.edgeId)
  const blocked = event.eventType === 'EDGE_BLOCKED'
  return {
    ...map,
    edges: map.edges.map((edge) => (edge.edgeId === edgeId ? { ...edge, blocked } : edge)),
  }
}

function countLiveState(
  overview: OperationsOverviewResponse,
  transfers: LiveTransfer[],
  ohts: OhtResponse[],
  map: FabMapResponse,
) {
  return {
    activeTransfers:
      transfers.filter((transfer) => transfer.status === 'WAITING' || transfer.status === 'ASSIGNED' || transfer.status === 'MOVING').length ||
      overview.counts.waitingTransfers + overview.counts.assignedTransfers + overview.counts.movingTransfers,
    errorOhts: ohts.filter((oht) => oht.status === 'ERROR').length || overview.counts.errorOhts,
    blockedEdges: map.edges.filter((edge) => edge.blocked).length || overview.counts.blockedEdges,
  }
}

function matchesEventFilter(event: MonitoringEvent, filter: EventFilter) {
  if (filter === 'ALL') return true
  if (filter === 'WARNING') return event.alertSeverity === 'WARNING'
  if (filter === 'CRITICAL') return event.alertSeverity === 'CRITICAL'
  if (filter === 'OHT') return event.eventType.startsWith('OHT_')
  if (filter === 'TRANSFER') return event.eventType.startsWith('TRANSFER_')
  return event.eventType.includes('ROUTE') || event.eventType.includes('EDGE')
}

function ohtStatusFromEvent(eventType: string): OhtResponse['status'] | null {
  if (eventType === 'OHT_MOVED') return 'MOVING'
  if (eventType === 'OHT_ASSIGNED') return 'RESERVED'
  if (eventType === 'TRANSFER_COMPLETED' || eventType === 'OHT_RECOVERED') return 'IDLE'
  if (eventType === 'OHT_ERROR_OCCURRED') return 'ERROR'
  return null
}

function transferStatusFromEvent(eventType: string): TransferStatus | null {
  if (eventType === 'OHT_ASSIGNED') return 'ASSIGNED'
  if (eventType === 'OHT_MOVED' || eventType === 'TRANSFER_DELAYED') return 'MOVING'
  if (eventType === 'TRANSFER_COMPLETED') return 'COMPLETED'
  if (eventType === 'TRANSFER_FAILED' || eventType === 'ROUTE_NOT_FOUND') return 'FAILED'
  if (eventType === 'TRANSFER_CANCELED') return 'CANCELED'
  return null
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function numberValue(value: unknown) {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

function severityClass(severity?: AlertSeverity) {
  if (severity === 'CRITICAL') return 'critical'
  if (severity === 'WARNING') return 'warning'
  return 'info'
}

function formatTime(value?: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
}

function formatElapsed(start?: string | null, end?: string | null) {
  if (!start) return '-'
  const endTime = end ? new Date(end).getTime() : Date.now()
  const seconds = Math.max(0, Math.round((endTime - new Date(start).getTime()) / 1000))
  const minute = Math.floor(seconds / 60)
  const second = seconds % 60
  return minute > 0 ? `${minute}:${String(second).padStart(2, '0')}` : `0:${String(second).padStart(2, '0')}`
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function getMapBounds(nodes: FabNodeResponse[]) {
  const xs = nodes.map((node) => node.positionX)
  const ys = nodes.map((node) => node.positionY)
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  }
}

function toSvgPoint(
  node: FabNodeResponse,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
) {
  const width = Math.max(1, bounds.maxX - bounds.minX)
  const height = Math.max(1, bounds.maxY - bounds.minY)
  return {
    x: 95 + ((node.positionX - bounds.minX) / width) * 850,
    y: 115 + ((node.positionY - bounds.minY) / height) * 380,
  }
}

export default App
