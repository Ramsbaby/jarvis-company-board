# 자비스맵 아키텍처 — 심볼 직접 참조 가이드

이 메모리가 있으면 get_symbols_overview 호출 불필요.
바로 find_symbol(name, include_body=true)로 해당 함수만 읽을 것.

## VirtualOffice.tsx (2,780줄) — 핵심 함수 맵

| 함수 | 줄 | 역할 |
|---|---:|---|
| `findNearbyRoom` | 602 | 플레이어 위치에서 가장 가까운 방 탐색 |
| `drawRoom` | 612 | 방 렌더링 (바닥 텍스처, 벽, 러그, 가구) — 가장 큰 함수 |
| `drawDoorNameplate` | 1141 | 방 입구 이름표 |
| `drawNPC` | 1156 | NPC 캐릭터 렌더링 (팀장 아바타 + 상태 LED) |
| `drawPlayer` | 1521 | 플레이어 캐릭터 렌더링 (방향키 이동 + 애니메이션) |
| `drawInteractPrompt` | 1618 | "Enter로 대화" 프롬프트 표시 |
| `drawMinimap` | 1643 | 우하단 미니맵 |
| `gameLoop` | 1806 | 메인 렌더링 루프 (requestAnimationFrame) |
| `openBriefing` | 220 | 방 클릭 → 브리핑 API 호출 → 팝업 열기 |
| `loadStatuses` | 160 | /api/agent-live + /api/crons → NPC 상태 갱신 |
| `closePopup` | 113 | 팝업 닫기 |

## components/map/*.tsx — 컴포넌트 맵

| 컴포넌트 | 줄 수 | 역할 | 주요 Props |
|---|---:|---|---|
| `TeamBriefingPopup` | 1,413 | 팀장 클릭 시 상세 팝업 (가장 복잡) | briefing, cronData, activeRoom, chat* |
| `CronDetailPopup` | 774 | 크론 상세 (ActionBar + RetryResultCard) | cron, onClose |
| `MetricDetailModal` | 387 | 디스크/메모리/CPU 드릴다운 | metric, briefingSummary |
| `CronGridPopup` | 344 | 크론센터 전체 그리드 | cronData, onSelect |
| `RightInfoPanels` | 294 | 우상단 오늘예정/최근커밋 | onClick |
| `CronToastStack` | 177 | 실시간 크론 이벤트 토스트 | events |
| `BoardBanner` | 163 | 상단 보드 배너 | title |
| `Statusline` | 159 | 하단 상태바 (Claude/CPU/디스크/크론) | — |
| `MobileControls` | 10 | 모바일 조작 (D-pad) | onDirection |

## lib/map/ — 데이터 + 렌더링

| 파일 | 줄 | 역할 |
|---|---:|---|
| `rooms.ts` | 293 | ROOMS 배열(13방), 타입(RoomDef/BriefingData/CronItem), 충돌맵, A* 경로 |
| `canvas-draw.ts` | 911 | 가구 모듈(drawChair/Monitor/Plant/Executive/Standard/Pod) + 데코레이션 |
| `cron-encyclopedia.ts` | 283 | 크론 백과사전 (각 크론의 한국어 설명 + CEO 액션 가이드) |
| `cron-human.ts` | — | cron expression → 사람 친화 한국어 변환 |

## API 라우트 (맵 관련)

| 라우트 | 역할 |
|---|---|
| `/api/entity/[id]/briefing` | 팀장/시스템 브리핑 데이터 (buildTeamLeadBriefing + buildRichBase) |
| `/api/game/chat` | 팀장 채팅 (Groq SSE, gatherTeamContext + gatherFailureDetails) |
| `/api/crons` | 크론 목록 (status, schedule, recentRuns) |
| `/api/crons/retry` | 크론 재실행 (script + LLM detached spawn) |
| `/api/agent-live` | NPC 실시간 상태 |

## 렌더링 파이프라인

```
gameLoop(time)
  ↓ 복도/외벽 그리기
  ↓ for(room) drawRoom(room)
  │   ↓ 바닥 텍스처 (floorStyle: executive/metal/stage/open)
  │   ↓ 러그 + 팀컬러
  │   ↓ drawRoomFurniture() [canvas-draw.ts]
  │   ↓ 벽 + 유리창 + 문
  ↓ drawDecorations() [canvas-draw.ts] — 아트/커피/프린터/시계/조명
  ↓ Y-sort: drawNPC + drawPlayer
  ↓ drawInteractPrompt()
  ↓ drawMinimap()
  ↓ HUD: Statusline, RightInfoPanels, BoardBanner, CronToastStack
```

## 자주 수정되는 패턴

- "팝업 수정" → TeamBriefingPopup.tsx (find_symbol: TeamBriefingPopup)
- "크론 상세" → CronDetailPopup.tsx (find_symbol: ActionBar, RetryResultCard)
- "바닥/벽 변경" → VirtualOffice.tsx의 drawRoom (line 612)
- "가구 추가" → canvas-draw.ts의 drawRoomFurniture
- "방 추가/이동" → rooms.ts의 ROOMS 배열
- "팀장 데이터" → briefing/route.ts의 buildTeamLeadBriefing
- "팀장 채팅" → game/chat/route.ts의 gatherTeamContext + buildRichBase
