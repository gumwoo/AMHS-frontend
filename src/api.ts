export type TransferStatus =
  | 'WAITING'
  | 'ASSIGNED'
  | 'MOVING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELED'

export type OhtStatus = 'IDLE' | 'RESERVED' | 'MOVING' | 'ERROR'

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL'

export interface ApiResponse<T> {
  success: boolean
  data: T
  timestamp: string
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
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
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

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

export async function getOperationsOverview(limit = 10): Promise<OperationsOverviewResponse> {
  const response = await fetch(`${API_BASE_URL}/api/operations/overview?limit=${limit}`)
  if (!response.ok) {
    throw new Error(`운영 현황 조회 실패: ${response.status}`)
  }
  const body = (await response.json()) as ApiResponse<OperationsOverviewResponse>
  return body.data
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
