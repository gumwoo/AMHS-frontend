import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Bell,
  Blocks,
  Ban,
  CheckCircle2,
  CircleGauge,
  Clock3,
  Play,
  RefreshCw,
  Route,
  Send,
  ShieldCheck,
  Truck,
  Wifi,
  WifiOff,
  X,
  XCircle,
} from 'lucide-react'
import {
  assignTransferRequest,
  blockFabEdge,
  cancelTransferRequest,
  createTransferRequest,
  getFabMap,
  getOperationsOverview,
  getTransferRequests,
  openMonitoringStream,
  startTransferRequest,
  unblockFabEdge,
  type AlertSeverity,
  type FabEdgeResponse,
  type FabMapResponse,
  type FabNodeResponse,
  type MonitoringEvent,
  type OperationsOverviewResponse,
  type PageResponse,
  type TransferPriority,
  type TransferRequestResponse,
  type TransferStatus,
} from './api'
import './App.css'

type ViewMode = 'dashboard' | 'transfers' | 'fab'

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

const emptyFabMap: FabMapResponse = {
  nodes: [],
  edges: [],
}

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
  const [fabMap, setFabMap] = useState<FabMapResponse>(emptyFabMap)
  const [fabError, setFabError] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [edgeReason, setEdgeReason] = useState('운영자 차단')
  const [workingEdgeId, setWorkingEdgeId] = useState<string | null>(null)

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

  const loadFabMap = useCallback(async () => {
    setFabError(null)
    try {
      const data = await getFabMap()
      setFabMap(data)
      setSelectedEdgeId((current) => current ?? data.edges[0]?.edgeId ?? null)
    } catch (exception) {
      setFabError(exception instanceof Error ? exception.message : 'FAB 맵을 불러오지 못했습니다.')
    }
  }, [])

  const refreshAll = useCallback(async () => {
    await Promise.all([loadOverview(), loadTransfers(), loadFabMap()])
  }, [loadFabMap, loadOverview, loadTransfers])

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void refreshAll()
    }, 0)
    return () => window.clearTimeout(timerId)
  }, [refreshAll])

  useEffect(() => {
    const source = openMonitoringStream((event) => {
      setEvents((current) => [event, ...current].slice(0, 8))
      if (
        event.eventType.startsWith('TRANSFER_') ||
        event.eventType === 'OHT_ASSIGNED' ||
        event.eventType === 'EDGE_BLOCKED' ||
        event.eventType === 'EDGE_UNBLOCKED'
      ) {
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

  async function runEdgeAction(edgeId: string, action: () => Promise<unknown>) {
    setWorkingEdgeId(edgeId)
    setFabError(null)
    try {
      await action()
      await refreshAll()
    } catch (exception) {
      setFabError(exception instanceof Error ? exception.message : 'FAB edge 처리에 실패했습니다.')
    } finally {
      setWorkingEdgeId(null)
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
        <button className={viewMode === 'fab' ? 'active' : ''} type="button" onClick={() => setViewMode('fab')}>
          FAB 맵
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
      ) : viewMode === 'transfers' ? (
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
      ) : (
        <FabMapView
          edgeReason={edgeReason}
          error={fabError}
          fabMap={fabMap}
          selectedEdgeId={selectedEdgeId}
          workingEdgeId={workingEdgeId}
          onBlockEdge={(edgeId) => runEdgeAction(edgeId, () => blockFabEdge(edgeId, edgeReason))}
          onRefresh={loadFabMap}
          onSelectEdge={setSelectedEdgeId}
          onSetReason={setEdgeReason}
          onUnblockEdge={(edgeId) => runEdgeAction(edgeId, () => unblockFabEdge(edgeId))}
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

function FabMapView({
  edgeReason,
  error,
  fabMap,
  selectedEdgeId,
  workingEdgeId,
  onBlockEdge,
  onRefresh,
  onSelectEdge,
  onSetReason,
  onUnblockEdge,
}: {
  edgeReason: string
  error: string | null
  fabMap: FabMapResponse
  selectedEdgeId: string | null
  workingEdgeId: string | null
  onBlockEdge: (edgeId: string) => void
  onRefresh: () => void
  onSelectEdge: (edgeId: string) => void
  onSetReason: (reason: string) => void
  onUnblockEdge: (edgeId: string) => void
}) {
  const selectedEdge = fabMap.edges.find((edge) => edge.edgeId === selectedEdgeId) ?? fabMap.edges[0] ?? null
  const nodeById = new Map(fabMap.nodes.map((node) => [node.nodeId, node]))
  const blockedEdges = fabMap.edges.filter((edge) => edge.blocked)
  const activeNodes = fabMap.nodes.filter((node) => node.active).length

  return (
    <section className="fab-layout">
      <Panel title="FAB Map" action={`${fabMap.nodes.length} nodes · ${fabMap.edges.length} edges`}>
        {error && (
          <div className="inline-error">
            <XCircle size={16} />
            <span>{error}</span>
          </div>
        )}
        <FabMapCanvas
          edges={fabMap.edges}
          nodes={fabMap.nodes}
          selectedEdgeId={selectedEdge?.edgeId ?? null}
          onSelectEdge={onSelectEdge}
        />
      </Panel>

      <aside className="fab-side">
        <Panel title="FAB 상태" action={<Route size={17} />}>
          <div className="state-grid compact">
            <StateCell label="ACTIVE NODE" value={activeNodes} />
            <StateCell label="EDGE" value={fabMap.edges.length} />
            <StateCell label="BLOCKED" value={blockedEdges.length} danger />
            <StateCell label="NORMAL" value={fabMap.edges.length - blockedEdges.length} />
          </div>
        </Panel>

        <Panel title="Edge 제어">
          {selectedEdge ? (
            <div className="edge-control">
              <div className="edge-summary">
                <strong>{selectedEdge.edgeId}</strong>
                <span>
                  {selectedEdge.fromNodeId} → {selectedEdge.toNodeId}
                </span>
                <StatusBadge active={!selectedEdge.blocked} />
              </div>
              <label>
                차단 사유
                <input value={edgeReason} onChange={(event) => onSetReason(event.target.value)} />
              </label>
              <div className="edge-actions">
                <button
                  className="secondary-button danger-text"
                  disabled={selectedEdge.blocked || workingEdgeId === selectedEdge.edgeId}
                  type="button"
                  onClick={() => onBlockEdge(selectedEdge.edgeId)}
                >
                  <Ban size={16} />
                  차단
                </button>
                <button
                  className="secondary-button"
                  disabled={!selectedEdge.blocked || workingEdgeId === selectedEdge.edgeId}
                  type="button"
                  onClick={() => onUnblockEdge(selectedEdge.edgeId)}
                >
                  <ShieldCheck size={16} />
                  해제
                </button>
                <button className="icon-button" type="button" onClick={onRefresh} aria-label="FAB 맵 새로고침">
                  <RefreshCw size={17} />
                </button>
              </div>
            </div>
          ) : (
            <EmptyLine text="선택된 edge 없음" />
          )}
        </Panel>

        <Panel title="Edge 목록" action={`${blockedEdges.length} blocked`}>
          <div className="edge-list">
            {fabMap.edges.length === 0 ? (
              <EmptyLine text="FAB edge 없음" />
            ) : (
              fabMap.edges.map((edge) => {
                const fromNode = nodeById.get(edge.fromNodeId)
                const toNode = nodeById.get(edge.toNodeId)
                return (
                  <button
                    className={`edge-list-row ${edge.edgeId === selectedEdge?.edgeId ? 'selected' : ''}`}
                    key={edge.edgeId}
                    type="button"
                    onClick={() => onSelectEdge(edge.edgeId)}
                  >
                    <span className={edge.blocked ? 'edge-led blocked' : 'edge-led'} />
                    <strong>{edge.edgeId}</strong>
                    <span>
                      {fromNode?.name ?? edge.fromNodeId} → {toNode?.name ?? edge.toNodeId}
                    </span>
                    <small>{edge.estimatedTravelSeconds}s</small>
                  </button>
                )
              })
            )}
          </div>
        </Panel>
      </aside>
    </section>
  )
}

function FabMapCanvas({
  edges,
  nodes,
  selectedEdgeId,
  onSelectEdge,
}: {
  edges: FabEdgeResponse[]
  nodes: FabNodeResponse[]
  selectedEdgeId: string | null
  onSelectEdge: (edgeId: string) => void
}) {
  const nodeById = new Map(nodes.map((node) => [node.nodeId, node]))
  const bounds = getMapBounds(nodes)

  if (nodes.length === 0) {
    return <EmptyLine text="FAB 맵 데이터 없음" />
  }

  return (
    <div className="fab-canvas">
      <svg aria-label="FAB map" role="img" viewBox="0 0 1000 560">
        <defs>
          <pattern id="fab-grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#1d3347" strokeWidth="1" />
          </pattern>
          <filter id="route-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect className="fab-grid-bg" width="1000" height="560" />
        {edges.map((edge) => {
          const fromNode = nodeById.get(edge.fromNodeId)
          const toNode = nodeById.get(edge.toNodeId)
          if (!fromNode || !toNode) {
            return null
          }
          const from = toSvgPoint(fromNode, bounds)
          const to = toSvgPoint(toNode, bounds)
          return (
            <g className="map-edge-hit" key={edge.edgeId} onClick={() => onSelectEdge(edge.edgeId)}>
              <line className="map-edge-hit-line" x1={from.x} x2={to.x} y1={from.y} y2={to.y} />
              <line
                className={`map-edge ${edge.blocked ? 'blocked' : ''} ${edge.edgeId === selectedEdgeId ? 'selected' : ''}`}
                x1={from.x}
                x2={to.x}
                y1={from.y}
                y2={to.y}
              />
              <text className="edge-label" x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 8}>
                {edge.edgeId}
              </text>
            </g>
          )
        })}
        {nodes.map((node) => {
          const point = toSvgPoint(node, bounds)
          return (
            <g className={`map-node ${node.nodeType.toLowerCase()} ${node.active ? '' : 'inactive'}`} key={node.nodeId}>
              <circle cx={point.x} cy={point.y} r="8" />
              <rect height="28" rx="5" width="112" x={point.x - 56} y={point.y - 48} />
              <text x={point.x} y={point.y - 30}>
                {node.nodeId}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
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

function StatusBadge({ active }: { active: boolean }) {
  return <span className={active ? 'status-badge normal' : 'status-badge blocked'}>{active ? 'NORMAL' : 'BLOCKED'}</span>
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
    x: 90 + ((node.positionX - bounds.minX) / width) * 820,
    y: 90 + ((node.positionY - bounds.minY) / height) * 380,
  }
}

export default App
