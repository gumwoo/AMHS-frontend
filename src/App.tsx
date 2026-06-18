import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Bell,
  Blocks,
  CheckCircle2,
  CircleGauge,
  Clock3,
  Play,
  RefreshCw,
  Route,
  Send,
  Truck,
  Wifi,
  WifiOff,
  X,
  XCircle,
} from 'lucide-react'
import {
  assignTransferRequest,
  cancelTransferRequest,
  createTransferRequest,
  getOperationsOverview,
  getTransferRequests,
  openMonitoringStream,
  startTransferRequest,
  type AlertSeverity,
  type MonitoringEvent,
  type OperationsOverviewResponse,
  type PageResponse,
  type TransferPriority,
  type TransferRequestResponse,
  type TransferStatus,
} from './api'
import './App.css'

type ViewMode = 'dashboard' | 'transfers'

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

const emptyTransferPage: PageResponse<TransferRequestResponse> = {
  content: [],
  page: 0,
  size: 20,
  totalElements: 0,
  totalPages: 0,
  first: true,
  last: true,
}

const transferStatuses: Array<TransferStatus | ''> = ['', 'WAITING', 'ASSIGNED', 'MOVING', 'COMPLETED', 'FAILED', 'CANCELED']
const priorities: TransferPriority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT']

function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('dashboard')
  const [overview, setOverview] = useState<OperationsOverviewResponse>(emptyOverview)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [events, setEvents] = useState<MonitoringEvent[]>([])
  const [streamConnected, setStreamConnected] = useState(false)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null)

  const [transferPage, setTransferPage] = useState<PageResponse<TransferRequestResponse>>(emptyTransferPage)
  const [transferLoading, setTransferLoading] = useState(false)
  const [transferError, setTransferError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<TransferStatus | ''>('')
  const [priorityFilter, setPriorityFilter] = useState<TransferPriority | ''>('')
  const [createForm, setCreateForm] = useState({
    sourceNodeId: '',
    destinationNodeId: '',
    priority: 'NORMAL' as TransferPriority,
  })
  const [ohtInputs, setOhtInputs] = useState<Record<number, string>>({})
  const [workingRequestId, setWorkingRequestId] = useState<number | null>(null)

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

  const loadTransfers = useCallback(async () => {
    setTransferLoading(true)
    setTransferError(null)
    try {
      const data = await getTransferRequests({
        status: statusFilter,
        priority: priorityFilter,
        page: 0,
        size: 20,
      })
      setTransferPage(data)
    } catch (exception) {
      setTransferError(exception instanceof Error ? exception.message : '반송 요청 목록을 불러오지 못했습니다.')
    } finally {
      setTransferLoading(false)
    }
  }, [priorityFilter, statusFilter])

  const refreshAll = useCallback(async () => {
    await Promise.all([loadOverview(), loadTransfers()])
  }, [loadOverview, loadTransfers])

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void refreshAll()
    }, 0)
    return () => window.clearTimeout(timerId)
  }, [refreshAll])

  useEffect(() => {
    const source = openMonitoringStream((event) => {
      setEvents((current) => [event, ...current].slice(0, 8))
      if (event.eventType.startsWith('TRANSFER_') || event.eventType === 'OHT_ASSIGNED') {
        void refreshAll()
      }
    })

    source.onopen = () => setStreamConnected(true)
    source.onerror = () => setStreamConnected(false)

    return () => source.close()
  }, [refreshAll])

  const activeTransfers = useMemo(
    () =>
      overview.counts.waitingTransfers +
      overview.counts.assignedTransfers +
      overview.counts.movingTransfers,
    [overview],
  )

  const criticalCount = overview.counts.failedTransfers + overview.counts.errorOhts + overview.counts.blockedEdges

  async function handleCreateTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setTransferError(null)
    try {
      await createTransferRequest(createForm)
      setCreateForm({ sourceNodeId: '', destinationNodeId: '', priority: 'NORMAL' })
      await refreshAll()
    } catch (exception) {
      setTransferError(exception instanceof Error ? exception.message : '반송 요청 생성에 실패했습니다.')
    }
  }

  async function runTransferAction(requestId: number, action: () => Promise<unknown>) {
    setWorkingRequestId(requestId)
    setTransferError(null)
    try {
      await action()
      await refreshAll()
    } catch (exception) {
      setTransferError(exception instanceof Error ? exception.message : '반송 요청 처리에 실패했습니다.')
    } finally {
      setWorkingRequestId(null)
    }
  }

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
          <button className="icon-button" type="button" onClick={() => void refreshAll()} aria-label="운영 현황 새로고침">
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      <nav className="view-tabs" aria-label="운영 화면">
        <button className={viewMode === 'dashboard' ? 'active' : ''} type="button" onClick={() => setViewMode('dashboard')}>
          대시보드
        </button>
        <button className={viewMode === 'transfers' ? 'active' : ''} type="button" onClick={() => setViewMode('transfers')}>
          반송 요청
        </button>
      </nav>

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

      {viewMode === 'dashboard' ? (
        <DashboardView
          events={events}
          loading={loading}
          lastUpdatedAt={lastUpdatedAt}
          overview={overview}
        />
      ) : (
        <TransferView
          createForm={createForm}
          ohtInputs={ohtInputs}
          page={transferPage}
          priorityFilter={priorityFilter}
          statusFilter={statusFilter}
          transferError={transferError}
          transferLoading={transferLoading}
          workingRequestId={workingRequestId}
          onAssign={(requestId) =>
            runTransferAction(requestId, () => assignTransferRequest(requestId, ohtInputs[requestId]))
          }
          onCancel={(requestId) =>
            runTransferAction(requestId, () => cancelTransferRequest(requestId, '운영자 취소'))
          }
          onCreate={handleCreateTransfer}
          onOhtInputChange={(requestId, value) => setOhtInputs((current) => ({ ...current, [requestId]: value }))}
          onPriorityFilterChange={setPriorityFilter}
          onRefresh={loadTransfers}
          onStart={(requestId) => runTransferAction(requestId, () => startTransferRequest(requestId))}
          onStatusFilterChange={setStatusFilter}
          onUpdateCreateForm={setCreateForm}
        />
      )}
    </main>
  )
}

function DashboardView({
  events,
  loading,
  lastUpdatedAt,
  overview,
}: {
  events: MonitoringEvent[]
  loading: boolean
  lastUpdatedAt: string | null
  overview: OperationsOverviewResponse
}) {
  return (
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
  )
}

function TransferView({
  createForm,
  ohtInputs,
  page,
  priorityFilter,
  statusFilter,
  transferError,
  transferLoading,
  workingRequestId,
  onAssign,
  onCancel,
  onCreate,
  onOhtInputChange,
  onPriorityFilterChange,
  onRefresh,
  onStart,
  onStatusFilterChange,
  onUpdateCreateForm,
}: {
  createForm: { sourceNodeId: string; destinationNodeId: string; priority: TransferPriority }
  ohtInputs: Record<number, string>
  page: PageResponse<TransferRequestResponse>
  priorityFilter: TransferPriority | ''
  statusFilter: TransferStatus | ''
  transferError: string | null
  transferLoading: boolean
  workingRequestId: number | null
  onAssign: (requestId: number) => void
  onCancel: (requestId: number) => void
  onCreate: (event: FormEvent<HTMLFormElement>) => void
  onOhtInputChange: (requestId: number, value: string) => void
  onPriorityFilterChange: (priority: TransferPriority | '') => void
  onRefresh: () => void
  onStart: (requestId: number) => void
  onStatusFilterChange: (status: TransferStatus | '') => void
  onUpdateCreateForm: (form: { sourceNodeId: string; destinationNodeId: string; priority: TransferPriority }) => void
}) {
  return (
    <section className="transfer-layout">
      <Panel title="반송 요청 생성">
        <form className="transfer-form" onSubmit={onCreate}>
          <label>
            출발 노드
            <input
              required
              placeholder="STOCKER-A"
              value={createForm.sourceNodeId}
              onChange={(event) => onUpdateCreateForm({ ...createForm, sourceNodeId: event.target.value })}
            />
          </label>
          <label>
            도착 노드
            <input
              required
              placeholder="EQP-01"
              value={createForm.destinationNodeId}
              onChange={(event) => onUpdateCreateForm({ ...createForm, destinationNodeId: event.target.value })}
            />
          </label>
          <label>
            우선순위
            <select
              value={createForm.priority}
              onChange={(event) =>
                onUpdateCreateForm({ ...createForm, priority: event.target.value as TransferPriority })
              }
            >
              {priorities.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          </label>
          <button className="primary-button" type="submit">
            <Send size={16} />
            요청 생성
          </button>
        </form>
      </Panel>

      <Panel title="반송 요청 목록" action={`${page.totalElements.toLocaleString()}건`}>
        <div className="filter-bar">
          <select value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value as TransferStatus | '')}>
            {transferStatuses.map((status) => (
              <option key={status || 'ALL'} value={status}>
                {status || '전체 상태'}
              </option>
            ))}
          </select>
          <select
            value={priorityFilter}
            onChange={(event) => onPriorityFilterChange(event.target.value as TransferPriority | '')}
          >
            <option value="">전체 우선순위</option>
            {priorities.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>
          <button className="secondary-button" type="button" onClick={onRefresh}>
            <RefreshCw size={16} />
            조회
          </button>
        </div>

        {transferError && (
          <div className="inline-error">
            <XCircle size={16} />
            <span>{transferError}</span>
          </div>
        )}

        <div className="transfer-table-wrap">
          <table className="transfer-table">
            <thead>
              <tr>
                <th>요청</th>
                <th>경로</th>
                <th>상태</th>
                <th>우선순위</th>
                <th>OHT</th>
                <th>요청 시각</th>
                <th>작업</th>
              </tr>
            </thead>
            <tbody>
              {page.content.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyLine text={transferLoading ? '반송 요청 조회 중' : '반송 요청 없음'} />
                  </td>
                </tr>
              ) : (
                page.content.map((transfer) => (
                  <tr key={transfer.requestId}>
                    <td>REQ-{transfer.requestId}</td>
                    <td>
                      <strong>{transfer.sourceNodeId}</strong>
                      <span> → {transfer.destinationNodeId}</span>
                    </td>
                    <td>
                      <StatusPill status={transfer.status} />
                    </td>
                    <td>{transfer.priority}</td>
                    <td>
                      {transfer.status === 'WAITING' ? (
                        <input
                          className="oht-input"
                          placeholder="자동"
                          value={ohtInputs[transfer.requestId] ?? ''}
                          onChange={(event) => onOhtInputChange(transfer.requestId, event.target.value)}
                        />
                      ) : (
                        transfer.assignedOhtId ?? '-'
                      )}
                    </td>
                    <td>{formatTime(transfer.requestedAt)}</td>
                    <td>
                      <div className="row-actions">
                        {transfer.status === 'WAITING' && (
                          <button
                            className="icon-button small"
                            disabled={workingRequestId === transfer.requestId}
                            type="button"
                            onClick={() => onAssign(transfer.requestId)}
                            aria-label={`REQ-${transfer.requestId} 배정`}
                          >
                            <Truck size={15} />
                          </button>
                        )}
                        {transfer.status === 'ASSIGNED' && (
                          <button
                            className="icon-button small"
                            disabled={workingRequestId === transfer.requestId}
                            type="button"
                            onClick={() => onStart(transfer.requestId)}
                            aria-label={`REQ-${transfer.requestId} 시작`}
                          >
                            <Play size={15} />
                          </button>
                        )}
                        {(transfer.status === 'WAITING' || transfer.status === 'ASSIGNED') && (
                          <button
                            className="icon-button small danger"
                            disabled={workingRequestId === transfer.requestId}
                            type="button"
                            onClick={() => onCancel(transfer.requestId)}
                            aria-label={`REQ-${transfer.requestId} 취소`}
                          >
                            <X size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </section>
  )
}

function Metric({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode
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

function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
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

function StatusPill({ status }: { status: TransferStatus }) {
  return <span className={`status-pill ${status.toLowerCase()}`}>{status}</span>
}

function IssueList({
  items,
  emptyText,
  icon = <AlertTriangle size={17} />,
}: {
  items: Array<{ key: string; title: string; meta: string; badge: string; detail?: string }>
  emptyText: string
  icon?: ReactNode
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
