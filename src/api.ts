export type TransferStatus =
  | 'WAITING'
  | 'ASSIGNED'
  | 'MOVING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELED'

export type TransferPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
export type OhtStatus = 'IDLE' | 'RESERVED' | 'MOVING' | 'ERROR'
export type NodeType = 'STOCKER' | 'EQP' | 'CHARGER' | 'JUNCTION'
export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL'

export interface ApiResponse<T> {
  success: boolean
  data: T
  timestamp: string
}

export interface ErrorResponse {
  success: false
  error: {
    code: string
    message: string
    details: Record<string, unknown>
    traceId: string | null
  }
  timestamp: string
}

export interface PageResponse<T> {
  content: T[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  first: boolean
  last: boolean
}

export interface TransferRequestResponse {
  requestId: number
  sourceNodeId: string
  destinationNodeId: string
  priority: TransferPriority
  status: TransferStatus
  assignedOhtId: string | null
  requestedAt: string
  assignedAt: string | null
  startedAt: string | null
  completedAt: string | null
  failedReason: string | null
}

export interface OperationsStatusCountResponse {
  waitingTransfers: number
  assignedTransfers: number
  movingTransfers: number
  completedTransfers: number
  failedTransfers: number
  canceledTransfers: number
  idleOhts: number
  reservedOhts: number
  movingOhts: number
  errorOhts: number
  blockedEdges: number
}

export interface OperationsProblemTransferResponse {
  requestId: number
  status: TransferStatus
  priority: TransferPriority
  sourceNodeId: string
  destinationNodeId: string
  assignedOhtId: string | null
  reason: string | null
  requestedAt: string
  completedAt: string | null
}

export interface OperationsOhtIssueResponse {
  ohtId: string
  status: OhtStatus
  currentNodeId: string
  currentRequestId: number | null
  lastMovedAt: string | null
}

export interface OperationsBlockedEdgeResponse {
  edgeId: string
  fromNodeId: string
  toNodeId: string
  distanceMeters: number
  estimatedTravelSeconds: number
}

export interface OperationsOverviewResponse {
  counts: OperationsStatusCountResponse
  recentProblemTransfers: OperationsProblemTransferResponse[]
  abnormalOhts: OperationsOhtIssueResponse[]
  blockedEdges: OperationsBlockedEdgeResponse[]
}

export interface MonitoringEvent {
  eventId: string
  eventType: string
  occurredAt: string
  alertSeverity?: AlertSeverity
  alertTitle?: string
  alertMessage?: string
  [key: string]: unknown
}

export interface FabNodeResponse {
  nodeId: string
  nodeType: NodeType
  name: string
  positionX: number
  positionY: number
  active: boolean
}

export interface FabEdgeResponse {
  edgeId: string
  fromNodeId: string
  toNodeId: string
  distanceMeters: number
  estimatedTravelSeconds: number
  blocked: boolean
}

export interface FabMapResponse {
  nodes: FabNodeResponse[]
  edges: FabEdgeResponse[]
}

export interface OhtResponse {
  ohtId: string
  status: OhtStatus
  currentNodeId: string
  currentRequestId: number | null
  carryingFoupId: string | null
  lastMovedAt: string | null
}

export interface AnalyticsSummaryResponse {
  totalRequests: number
  completedRequests: number
  failedRequests: number
  canceledRequests: number
  completionRate: number
  failureRate: number
  averageTransferSeconds: number
  p95TransferSeconds: number
  delayedRequests: number
}

export interface BottleneckResponse {
  edgeId: string
  fromNodeId: string
  toNodeId: string
  passCount: number
  averageTravelSeconds: number
  p95TravelSeconds: number
  delayedCount: number
}

export interface DemoMonitoringStatusResponse {
  running: boolean
  startedAt: string | null
  lastEventAt: string | null
  emittedEvents: number
  tickIntervalMs: number
  sseConnections: number
}

export interface DemoMonitoringActionResponse {
  running: boolean
  message: string
  occurredAt: string
  emittedEvents: number
}

export interface TransferSearchParams {
  status?: TransferStatus | ''
  priority?: TransferPriority | ''
  page?: number
  size?: number
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

export async function getOperationsOverview(limit = 10): Promise<OperationsOverviewResponse> {
  return getJson<OperationsOverviewResponse>(`/operations/overview?limit=${limit}`)
}

export async function getFabMap(): Promise<FabMapResponse> {
  return getJson<FabMapResponse>('/fab-map')
}

export async function getOhts(): Promise<OhtResponse[]> {
  return getJson<OhtResponse[]>('/ohts')
}

export async function getAnalyticsSummary(): Promise<AnalyticsSummaryResponse> {
  return getJson<AnalyticsSummaryResponse>('/analytics/summary')
}

export async function getBottlenecks(limit = 5): Promise<BottleneckResponse[]> {
  return getJson<BottleneckResponse[]>(`/analytics/bottlenecks?limit=${limit}`)
}

export async function getTransferRequests(
  params: TransferSearchParams,
): Promise<PageResponse<TransferRequestResponse>> {
  const query = toQueryString({
    ...params,
    page: params.page ?? 0,
    size: params.size ?? 20,
  })
  return getJson<PageResponse<TransferRequestResponse>>(`/transfer-requests?${query}`)
}

export async function getDemoMonitoringStatus(): Promise<DemoMonitoringStatusResponse> {
  return getJson<DemoMonitoringStatusResponse>('/demo-monitoring/status')
}

export async function startDemoMonitoring(): Promise<DemoMonitoringStatusResponse> {
  return sendJson<DemoMonitoringStatusResponse>('/demo-monitoring/start', { method: 'POST' })
}

export async function stopDemoMonitoring(): Promise<DemoMonitoringStatusResponse> {
  return sendJson<DemoMonitoringStatusResponse>('/demo-monitoring/stop', { method: 'POST' })
}

export async function tickDemoMonitoring(): Promise<DemoMonitoringActionResponse> {
  return sendJson<DemoMonitoringActionResponse>('/demo-monitoring/tick', { method: 'POST' })
}

export function openMonitoringStream(onEvent: (event: MonitoringEvent) => void): EventSource {
  const source = new EventSource(`${API_BASE_URL}/api/monitoring/stream`)
  const eventTypes = [
    'TRANSFER_CREATED',
    'OHT_ASSIGNED',
    'TRANSFER_STARTED',
    'OHT_MOVED',
    'TRANSFER_COMPLETED',
    'TRANSFER_DELAYED',
    'TRANSFER_FAILED',
    'TRANSFER_CANCELED',
    'OHT_ERROR_OCCURRED',
    'OHT_RECOVERED',
    'EDGE_BLOCKED',
    'EDGE_UNBLOCKED',
    'ROUTE_NOT_FOUND',
  ]

  eventTypes.forEach((eventType) => {
    source.addEventListener(eventType, (message) => {
      onEvent(JSON.parse(message.data) as MonitoringEvent)
    })
  })

  return source
}

async function getJson<T>(path: string): Promise<T> {
  return sendJson<T>(path, { method: 'GET' })
}

async function sendJson<T>(path: string, init: RequestInit): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body) {
    headers.set('Content-Type', 'application/json')
  }

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/api${path}`, {
      ...init,
      headers,
    })
  } catch {
    throw new Error('백엔드 API에 연결할 수 없습니다.')
  }

  let body: ApiResponse<T> | ErrorResponse
  try {
    body = (await response.json()) as ApiResponse<T> | ErrorResponse
  } catch {
    if (!response.ok) {
      throw new Error('백엔드 API 응답을 읽을 수 없습니다.')
    }
    throw new Error('응답 형식이 올바르지 않습니다.')
  }

  if (!response.ok || !body.success) {
    throw new Error('error' in body ? body.error.message : `요청 실패: ${response.status}`)
  }

  return body.data
}

function toQueryString(params: Record<string, string | number | undefined>): string {
  const searchParams = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      searchParams.set(key, String(value))
    }
  })
  return searchParams.toString()
}
