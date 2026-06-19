# AMHS/OHT 반송 관제 시스템 Frontend

AMHS/OHT 반송 관제 시스템의 프론트엔드입니다. 실제 OHT 장비가 없는 환경에서도 반송 작업, OHT 위치, FAB 구간 상태, 실시간 이벤트, 운영 조치, 감사 로그를 한 화면에서 확인할 수 있도록 만든 관제 UI입니다.

이 화면은 단순한 관리자 대시보드가 아니라 **운영자가 장시간 켜두고 상태를 관찰하며 즉시 조치하는 관제 화면**을 목표로 했습니다. 그래서 장식적인 카드나 의미 없는 아이콘보다 표, 상태, 지도, 이벤트 로그, 조치 흐름의 정보 밀도를 우선했습니다.

## 프로젝트 목표

- 반송 작업 현황, OHT 상태, FAB 지도를 한 화면에서 파악
- SSE 기반 실시간 이벤트를 화면 상태에 즉시 반영
- 운영자가 직접 작업 취소, 구간 차단, OHT 오류/복구 조치 수행
- 조치 이력을 감사 로그로 확인하고 CSV로 내보내기
- AI가 만든 듯한 장식형 UI가 아니라 실무형 관제 화면에 가까운 밀도 구현
- 백엔드 시뮬레이션 이벤트를 통해 실제 장비 없이도 시연 가능

## 화면 구성

| 영역 | 내용 |
| --- | --- |
| 상단 상태 바 | 시뮬레이션 상태, SSE 연결 상태, 마지막 수신 시각, 운영자 선택 |
| 반송작업 현황 | 작업 ID, 출발지, 도착지, 우선순위, 상태, OHT, 경과 시간 |
| FAB 반송 지도 | FAB 노드, 구간, OHT 위치, 활성/차단/병목 구간 |
| OHT 장비 상태 | 현재 위치, 연결 작업, 목적지, 진행률, 장비 목록 |
| 실시간 이벤트 | 이벤트 시각, 유형, 설명 |
| 운영 지표 | 활성 작업, 완료율, 평균 반송, P95 반송, 차단 구간, 장비 오류 |
| 병목 구간 | 구간별 평균 시간, P95, 지연 건수, 영향 작업 |
| 운영 조치 이력 | 운영자, 조치 유형, 대상 ID 필터 및 CSV 내보내기 |

## 주요 기능

### 1. 실시간 이벤트 반영

프론트는 `EventSource`로 `/api/monitoring/stream`에 연결합니다. 백엔드에서 OHT 이동, 반송 배정, 반송 완료, 구간 차단, OHT 오류/복구 이벤트가 발생하면 화면의 작업 목록, OHT 상태, FAB 지도, 이벤트 로그에 반영합니다.

### 2. 실무형 운영 지표

운영 지표 영역은 백엔드의 `/api/operations/overview`와 `/api/analytics/summary` 값을 함께 사용합니다.

| 지표 | 데이터 출처 | 의미 |
| --- | --- | --- |
| 활성 작업 | 운영 현황 count + 화면 수신 상태 | 대기/배정/이동 중인 작업 수 |
| 완료율 | 분석 요약 API | 전체 요청 대비 완료 비율 |
| 평균 반송 | 분석 요약 API | 완료 작업의 평균 반송 시간 |
| P95 반송 | 분석 요약 API | 느린 작업까지 고려한 P95 반송 시간 |
| 차단 구간 | FAB 지도 상태 + 운영 현황 count | 현재 차단된 FAB 구간 수 |
| 장비 오류 | OHT 상태 + 운영 현황 count | 오류 상태 OHT 수 |

SSE로 들어온 최신 상태가 있으면 화면 상태를 우선 사용하고, 아직 실시간 상태가 없는 경우에는 백엔드 운영 현황 count를 사용합니다. 따라서 초기 로딩과 실시간 갱신 상황 모두에서 운영 지표가 표시됩니다.

### 3. 운영 조치

운영자는 화면에서 다음 조치를 수행할 수 있습니다.

- 선택한 반송 작업 취소
- 선택한 FAB 구간 차단
- 차단된 FAB 구간 해제
- 선택한 OHT 오류 처리
- 오류 상태 OHT 복구

선택된 운영자 ID는 `X-Operator-Id` 헤더로 백엔드에 전달됩니다. 조치 후에는 감사 로그를 다시 조회해 운영 조치 이력이 화면에 반영됩니다.

### 4. 감사 로그와 CSV 내보내기

운영 조치 이력은 운영자, 조치 유형, 대상 ID로 필터링할 수 있습니다. 현재 조회된 감사 로그는 CSV로 내보낼 수 있어 장애 대응 기록이나 발표 증빙 자료로 활용할 수 있습니다.

CSV 컬럼은 다음과 같습니다.

- 시각
- 조치
- 대상유형
- 대상ID
- 운영자
- 사유

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

## 기술 스택

- React 19
- TypeScript
- Vite
- SSE EventSource
- lucide-react
- ESLint

## 실행 방법

백엔드를 먼저 `http://localhost:8080`에서 실행한 뒤 프론트를 실행합니다.

```bash
npm install
npm run dev
```

기본 주소는 `http://localhost:5173`입니다. 개발 서버에서는 Vite proxy가 `/api` 요청을 `http://localhost:8080`으로 전달합니다.

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

## 시연 흐름

1. 백엔드를 실행합니다.
2. 프론트를 실행합니다.
3. 화면 상단에서 시뮬레이션을 시작합니다.
4. SSE 연결 상태가 정상인지 확인합니다.
5. 반송 작업, OHT 위치, 이벤트 로그가 실시간으로 갱신되는지 확인합니다.
6. 운영자를 선택하고 작업 취소, 구간 차단, OHT 오류/복구를 수행합니다.
7. 운영 조치 이력에 감사 로그가 남는지 확인합니다.
8. 감사 로그를 CSV로 내보냅니다.

