# AMHS/OHT Frontend

AMHS/OHT 반송 관제 시스템의 프론트엔드입니다. FAB 반송 지도, OHT 상태, 반송 작업 현황, 실시간 이벤트, 운영 지표, 병목 구간, 운영 조치, 감사 로그를 한 화면에서 확인할 수 있는 관제 UI입니다.

## 기술 스택

- React 19
- TypeScript
- Vite
- SSE EventSource
- lucide-react
- ESLint

## 주요 기능

- FAB 반송 지도 시각화
- OHT 위치/상태 표시
- 반송 작업 목록 및 상태 필터
- SSE 기반 실시간 이벤트 로그
- 데모 모니터링 시작/중지/단일 이벤트 발생
- 작업 취소, 구간 차단/해제, OHT 오류/복구
- 운영자 선택 및 `X-Operator-Id` 헤더 전달
- 감사 로그 조회, 필터링, CSV 내보내기
- 운영 지표와 병목 구간 표시

## 실행 방법

### 1. 의존성 설치

```bash
npm install
```

### 2. 개발 서버 실행

```bash
npm run dev
```

기본 주소는 `http://localhost:5173`입니다.

개발 서버에서는 Vite proxy가 `/api` 요청을 `http://localhost:8080`으로 전달합니다. 따라서 백엔드를 먼저 `localhost:8080`에서 실행해야 합니다.

### 3. 백엔드 주소 직접 지정

프록시를 사용하지 않는 환경에서는 `VITE_API_BASE_URL`을 지정할 수 있습니다.

```bash
VITE_API_BASE_URL=http://localhost:8080 npm run dev
```

Windows PowerShell:

```powershell
$env:VITE_API_BASE_URL='http://localhost:8080'
npm run dev
```

## 검증 명령어

```bash
npm run lint
npm run build
```

## 화면 구성

| 영역 | 내용 |
| --- | --- |
| 상단 상태 바 | FAB 선택, 시뮬레이션 상태, SSE 연결 상태, 마지막 수신 시각, 운영자 |
| 반송작업 현황 | 작업 ID, 출발, 도착, 우선순위, 상태, OHT, 경과 시간 |
| FAB 반송 지도 | 노드, 구간, OHT 위치, 활성/차단/병목 구간 |
| OHT 장비 상태 | 현재 위치, 할당 작업, 목적지, 진행률, 장비 목록 |
| 실시간 이벤트 | 이벤트 시각, 유형, 설명 |
| 운영 지표 | 총 작업, 완료율, 평균 반송, P95, 지연, 실패 |
| 병목 구간 | 구간별 평균 시간, P95, 지연 건수, 영향 작업 |
| 감사 로그 | 운영자, 조치 유형, 대상 ID 필터 및 CSV 내보내기 |

## 데모 흐름

1. 백엔드를 `http://localhost:8080`에서 실행합니다.
2. 프론트를 `npm run dev`로 실행합니다.
3. 화면 상단에서 시뮬레이션을 시작합니다.
4. SSE 연결 상태가 정상인지 확인합니다.
5. 반송 작업, OHT 위치, 이벤트 로그가 갱신되는지 확인합니다.
6. 운영자 선택 후 작업 취소, 구간 차단, OHT 오류/복구를 수행합니다.
7. 감사 로그 탭에서 조치 이력이 남는지 확인합니다.
8. 필요한 경우 현재 필터 결과를 CSV로 내보냅니다.

## 백엔드 연동 API

프론트는 다음 API를 사용합니다.

- `GET /api/operations/overview`
- `GET /api/fab-map`
- `GET /api/ohts`
- `GET /api/analytics/summary`
- `GET /api/analytics/bottlenecks`
- `GET /api/transfer-requests`
- `GET /api/demo-monitoring/status`
- `GET /api/operations/action-logs`
- `GET /api/monitoring/stream`
- `POST /api/demo-monitoring/start`
- `POST /api/demo-monitoring/stop`
- `POST /api/demo-monitoring/tick`
- `POST /api/transfer-requests/{requestId}/cancel`
- `POST /api/fab-edges/{edgeId}/block`
- `POST /api/fab-edges/{edgeId}/unblock`
- `POST /api/ohts/{ohtId}/error`
- `POST /api/ohts/{ohtId}/recover`

## 프로젝트 방향

이 화면은 마케팅용 대시보드가 아니라 운영자가 장시간 켜두고 보는 관제 화면을 목표로 만들었습니다. 의미 없는 카드와 장식보다 표, 상태, 지도, 로그, 조치 흐름의 정보 밀도를 우선했습니다.

