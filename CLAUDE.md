@AGENTS.md

## 🔍 Serena 토큰 절약 — 자비스맵 필수 워크플로우

### 원칙
코드 탐색 시 **Serena 심볼 도구를 먼저** 시도. Read로 통째 파일 읽기는 최후 수단.

### 5단계 (자비스맵 편집 시 반드시)

| 단계 | 도구 | 설명 |
|:---:|---|---|
| 1 | `get_symbols_overview` | 대상 파일의 함수/컴포넌트 목록 (Read 대비 90% 절약) |
| 2 | `find_symbol` + `include_body=true` | 수정할 함수만 정확히 읽기 |
| 3 | `find_referencing_symbols` | 호출하는 곳 파악 (blast radius) |
| 4 | Read (offset+limit) | 마크다운/설정 파일만 |
| 5 | `find_referencing_symbols` | 수정 후 영향 범위 재확인 |

### 절대 금지
- `Read VirtualOffice.tsx` 통째 (2,780줄 = ~20K 토큰)
- `Read TeamBriefingPopup.tsx` 통째 (1,413줄 = ~10K 토큰)
- 500줄+ 파일을 Serena 도구 시도 없이 Read

### 토큰 비교 (자비스맵 핵심 파일)

| 파일 | 줄 수 | Read 비용 | Serena 비용 | 절약 |
|---|---:|---:|---:|---:|
| `VirtualOffice.tsx` | 2,780 | ~20K | ~2K | 90% |
| `TeamBriefingPopup.tsx` | 1,413 | ~10K | ~1.5K | 85% |
| `canvas-draw.ts` | 911 | ~7K | ~1K | 86% |
| `briefing/route.ts` | 874 | ~6K | ~0.8K | 87% |
| `game/chat/route.ts` | 860 | ~6K | ~0.8K | 87% |
| `CronDetailPopup.tsx` | 774 | ~5.5K | ~0.7K | 87% |

### Serena가 못하는 것 (이건 Read 사용)
- CSS-in-JS style 객체 내부값 (인라인 → LSP 미인식)
- canvas-draw.ts 픽셀 좌표 (숫자 리터럴)
- 마크다운/JSON 설정 파일

### 예외
CLAUDE.md, README.md, package.json 같은 문서/설정은 Read OK.
