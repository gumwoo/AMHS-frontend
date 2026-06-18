import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Bell,
  Blocks,
  CheckCircle2,
  CircleGauge,
  Clock3,
  RefreshCw,
  Route,
  Truck,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react'
import {
  getOperationsOverview,
  openMonitoringStream,
  type AlertSeverity,
  type MonitoringEvent,
  type OperationsOverviewResponse,
} from './api'
import './App.css'

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

function App() {
  const [overview, setOverview] = useState<OperationsOverviewResponse>(emptyOverview)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [events, setEvents] = useState<MonitoringEvent[]>([])
  const [streamConnected, setStreamConnected] = useState(false)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null)

  const loadOverview = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getOperationsOverview(10)
      setOverview(data)
      setLastUpdatedAt(new Date().toISOString())
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : '운영 현황을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadOverview()
    }, 0)
    return () => window.clearTimeout(timerId)
  }, [loadOverview])

  useEffect(() => {
    const source = openMonitoringStream((event) => {
      setEvents((current) => [event, ...current].slice(0, 8))
      if (event.eventType === 'TRANSFER_FAILED' || event.eventType === 'TRANSFER_DELAYED') {
        loadOverview()
      }
    })

    source.onopen = () => setStreamConnected(true)
    source.onerror = () => setStreamConnected(false)

    return () => source.close()
  }, [loadOverview])

  const activeTransfers = useMemo(
    () =>
      overview.counts.waitingTransfers +
      overview.counts.assignedTransfers +
      overview.counts.movingTransfers,
    [overview],
  )

  const criticalCount = overview.counts.failedTransfers + overview.counts.errorOhts + overview.counts.blockedEdges

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">AMHS Operations</p>
          <h1>운영 대시보드</h1>
        </div>
        <div className="topbar-actions">
          <span className={`stream-state ${streamConnected ? 'online' : 'offline'}`}>
            {streamConnected ? <Wifi size={16} /> : <WifiOff size={16} />}
            {streamConnected ? 'SSE 연결됨' : 'SSE 대기'}
          </span>
          <button className="icon-button" type="button" onClick={loadOverview} aria-label="운영 현황 새로고침">
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      <section className="status-strip" aria-label="운영 요약">
        <Metric icon={<Truck size={20} />} label="진행 반송" value={activeTransfers} tone="neutral" />
        <Metric icon={<Clock3 size={20} />} label="대기" value={overview.counts.waitingTransfers} tone="neutral" />
        <Metric icon={<CircleGauge size={20} />} label="이동 중 OHT" value={overview.counts.movingOhts} tone="good" />
        <Metric icon={<AlertTriangle size={20} />} label="운영 이슈" value={criticalCount} tone="danger" />
      </section>

      {error && (
        <section className="notice" role="alert">
          <XCircle size={18} />
          <span>{error}</span>
        </section>
      )}

      <section className="dashboard-grid">
        <Panel title="반송 상태" action={loading ? '갱신 중' : formatTime(lastUpdatedAt)}>
          <div className="state-grid">
            <StateCell label="WAITING" value={overview.counts.waitingTransfers} />
            <StateCell label="ASSIGNED" value={overview.counts.assignedTransfers} />
            <StateCell label="MOVING" value={overview.counts.movingTransfers} />
            <StateCell label="COMPLETED" value={overview.counts.completedTransfers} />
            <StateCell label="FAILED" value={overview.counts.failedTransfers} danger />
            <StateCell label="CANCELED" value={overview.counts.canceledTransfers} />
          </div>
        </Panel>

        <Panel title="OHT 상태">
          <div className="state-grid compact">
            <StateCell label="IDLE" value={overview.counts.idleOhts} />
            <StateCell label="RESERVED" value={overview.counts.reservedOhts} />
            <StateCell label="MOVING" value={overview.counts.movingOhts} />
            <StateCell label="ERROR" value={overview.counts.errorOhts} danger />
          </div>
          <IssueList
            emptyText="오류 상태 OHT 없음"
            items={overview.abnormalOhts.map((oht) => ({
              key: oht.ohtId,
              title: oht.ohtId,
              meta: `${oht.status} · ${oht.currentNodeId}`,
              badge: oht.currentRequestId ? `REQ-${oht.currentRequestId}` : '대기',
            }))}
          />
        </Panel>

        <Panel title="차단 경로" action={`${overview.counts.blockedEdges}건`}>
          <IssueList
            emptyText="차단된 경로 없음"
            items={overview.blockedEdges.map((edge) => ({
              key: edge.edgeId,
              title: edge.edgeId,
              meta: `${edge.fromNodeId} → ${edge.toNodeId}`,
              badge: `${edge.estimatedTravelSeconds}s`,
            }))}
            icon={<Route size={17} />}
          />
        </Panel>

        <Panel title="최근 문제 반송">
          <IssueList
            emptyText="최근 실패/취소 반송 없음"
            items={overview.recentProblemTransfers.map((transfer) => ({
              key: `${transfer.requestId}-${transfer.completedAt}`,
              title: `REQ-${transfer.requestId}`,
              meta: `${transfer.sourceNodeId} → ${transfer.destinationNodeId}`,
              badge: transfer.status,
              detail: transfer.reason ?? '-',
            }))}
            icon={<Blocks size={17} />}
          />
        </Panel>

        <Panel title="실시간 알림" action={<Bell size={17} />}>
          <div className="event-list">
            {events.length === 0 ? (
              <EmptyLine text="수신된 알림 없음" />
            ) : (
              events.map((event) => (
                <article className={`event-row ${severityClass(event.alertSeverity)}`} key={event.eventId}>
                  <span className="event-dot" />
                  <div>
                    <strong>{event.alertTitle ?? event.eventType}</strong>
                    <p>{event.alertMessage ?? '이벤트가 발생했습니다.'}</p>
                  </div>
                  <time>{formatTime(event.occurredAt)}</time>
                </article>
              ))
            )}
          </div>
        </Panel>
      </section>
    </main>
  )
}

function Metric({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: number
  tone: 'neutral' | 'good' | 'danger'
}) {
  return (
    <article className={`metric ${tone}`}>
      <div className="metric-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value.toLocaleString()}</strong>
      </div>
    </article>
  )
}

function Panel({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="panel">
      <header className="panel-header">
        <h2>{title}</h2>
        {action && <span>{action}</span>}
      </header>
      {children}
    </section>
  )
}

function StateCell({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className={`state-cell ${danger ? 'danger' : ''}`}>
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
    </div>
  )
}

function IssueList({
  items,
  emptyText,
  icon = <AlertTriangle size={17} />,
}: {
  items: Array<{ key: string; title: string; meta: string; badge: string; detail?: string }>
  emptyText: string
  icon?: React.ReactNode
}) {
  if (items.length === 0) {
    return <EmptyLine text={emptyText} />
  }

  return (
    <div className="issue-list">
      {items.map((item) => (
        <article className="issue-row" key={item.key}>
          <div className="issue-icon">{icon}</div>
          <div>
            <strong>{item.title}</strong>
            <p>{item.meta}</p>
            {item.detail && <small>{item.detail}</small>}
          </div>
          <span className="badge">{item.badge}</span>
        </article>
      ))}
    </div>
  )
}

function EmptyLine({ text }: { text: string }) {
  return (
    <div className="empty-line">
      <CheckCircle2 size={17} />
      <span>{text}</span>
    </div>
  )
}

function severityClass(severity?: AlertSeverity) {
  if (severity === 'CRITICAL') return 'critical'
  if (severity === 'WARNING') return 'warning'
  return 'info'
}

function formatTime(value: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
}

export default App
