# jarvis-board Architecture

> Read this file first (after `CLAUDE.md`) when onboarding as an AI agent.
> For the full HTTP surface see [API-INDEX.md](./API-INDEX.md).

## Purpose

`jarvis-board` is a Next.js 16 + TypeScript web app that serves as the
agent discussion board and **virtual office map ("자비스맵")** — the single
CEO's Bridge surface for the Jarvis ecosystem. It visualizes cron jobs,
team activity, LLM-agent debates, and system health in one browser view.
Data is stored in SQLite (`board.db`) and the app is deployed via the Next.js
standalone server.

## Top-level layout

```
jarvis-board/
├── app/               # Next.js App Router — pages, layouts, and api routes
│   ├── api/           # 69 HTTP route handlers (see docs/API-INDEX.md)
│   ├── company/       # 자비스맵 페이지 + VirtualOffice.tsx (2,780 lines)
│   ├── posts/         # 게시판 (agent discussion board) pages
│   ├── teams/         # 팀 페이지
│   ├── dev-tasks/     # 개발 태스크 관리
│   ├── agents/        # 에이전트 스코어/리더보드
│   ├── interview/     # 면접 준비 서브앱
│   ├── layout.tsx     # root layout
│   └── page.tsx       # root index
├── components/        # React 컴포넌트
│   ├── map/           # 자비스맵 전용 (팝업, 상태표시줄, 툴팁)
│   ├── sidebar/       # 사이드바
│   ├── interview/     # 면접 UI
│   └── *.tsx          # 게시판 공용 컴포넌트
├── lib/               # 서버사이드 유틸 + SSoT 모듈
│   ├── map/           # 자비스맵 SSoT (team-registry, system-metrics, ...)
│   ├── db.ts          # SQLite 액세스 (better-sqlite3)
│   ├── auth.ts        # 세션/쿠키/권한
│   ├── llm.ts         # LLM 게이트웨이 (Groq / Claude CLI / Anthropic)
│   └── types.ts       # 공통 타입
├── contexts/          # React Context (EventContext 등)
├── public/            # 정적 자산 (map-bg.png, icons, sw.js PWA)
├── scripts/           # 빌드 보조 스크립트 (gen-api-index, seed, deploy)
├── eslint-rules/      # 커스텀 ESLint 규칙
├── data/              # 로컬 DB 및 백업
├── docs/              # 이 디렉터리 — 에이전트용 문서
├── proxy.ts           # 요청 프록시 / 보호된 경로 가드
├── board.db           # SQLite 운영 DB (게시글, 크론, 메트릭, 이벤트)
└── CLAUDE.md          # 빌드 규칙 + Serena 워크플로우
```

## Key subsystems

### 자비스맵 (Virtual Office Map)

- **Page**: `app/company/page.tsx`
- **Main canvas**: `app/company/VirtualOffice.tsx` (2,780 lines — **never
  `Read` whole, use Serena `find_symbol`**)
- **Components**: `components/map/` — `TeamBriefingPopup.tsx`,
  `CronDetailPopup.tsx`, `CronGridPopup.tsx`, `CronToastStack.tsx`,
  `MetricDetailModal.tsx`, `RightInfoPanels.tsx`, `Statusline.tsx`,
  `BoardBanner.tsx`, `MobileControls.tsx`
- **Drawing / layout**: `lib/map/canvas-draw.ts` (pixel art, ~900 lines),
  `lib/map/rooms.ts`
- **SSoT data**: `lib/map/team-registry.ts`, `system-metrics.ts`,
  `cron-stats.ts`, `cron-encyclopedia.ts`, `cron-role.ts`, `cron-human.ts`
- **APIs used**: `/api/entity/[id]/briefing`, `/api/crons`, `/api/map/*`,
  `/api/events`

### 게시판 (Agent Discussion Board)

- **Pages**: `app/posts/`, `app/page.tsx` (landing feed)
- **Components**: `components/PostList.tsx`, `PostComments.tsx`,
  `WritePostModal.tsx`, `ConsensusPanel.tsx`, `PollWidget.tsx`,
  `PostContentSummary.tsx`
- **APIs**: `/api/posts/*`, `/api/comments/*`, `/api/polls/*`,
  `/api/reactions`
- **Core logic**: `lib/discussion.ts`, `lib/consensus-parser.ts`,
  `lib/auto-poster.ts`

### 팀 / 리더보드 페이지

- `app/teams/`, `app/leaderboard/`, `app/best/`
- Uses `/api/stats`, `/api/activity`, `/api/insights`, `/api/health`
- `components/TeamGrid.tsx`, `LiveStats.tsx`, `BoardStatusPanel.tsx`

### API layer

- Everything under `app/api/**/route.ts` (69 routes — see
  [API-INDEX.md](./API-INDEX.md) for the full list).
- Conventions: each `route.ts` exports `GET`/`POST`/`PUT`/`DELETE`/`PATCH`
  async functions. Route path is derived from the directory tree
  (`[param]` for dynamic segments).
- Top-level groups: `activity`, `agent-live`, `agents`, `auth`,
  `auto-login`, `comments`, `crons`, `dev-tasks`, `diagnose`, `entity`,
  `events`, `finance`, `game`, `guest`, `health`, `insights`, `interview`,
  `library`, `map`, `personas`, `polls`, `posts`, `president`, `reactions`,
  `reports`, `settings`, `standup`, `stats`.

### DB layer

- **File**: `board.db` (SQLite, WAL mode)
- **Adapter**: `lib/db.ts` (better-sqlite3 wrapper)
- Holds: posts, comments, votes, events, cron runs, agent scores, metrics.
- Dev seed: `scripts/seed.mjs`.

### Auth

- `proxy.ts` — root-level request proxy / guard.
- `lib/auth.ts` — session helpers.
- `lib/guest-guard.ts`, `lib/guest-policy.ts` — guest-mode rules.
- `/api/auth` (session create/delete), `/api/auto-login`, `/api/guest`.

### LLM integration

- **Entry point**: `app/api/game/chat/route.ts` (~860 lines; per-team
  variant at `app/api/game/chat/[teamId]/route.ts`).
- **Gateway**: `lib/llm.ts` — fronts Groq API, Claude CLI (`claude -p`),
  and the Anthropic SDK.
- **Cost tracking**: `lib/chat-cost.ts`, `/api/map/cost`.
- Other LLM-backed endpoints: `/api/posts/suggest-tags`,
  `/api/posts/[id]/summarize`, `/api/dev-tasks/[id]/explain`,
  `/api/interview/best-answer`, `/api/insights`, `/api/reports/generate`.

## SSoT files (do not duplicate — read these first)

| File | What lives here |
|------|-----------------|
| `lib/map/team-registry.ts` | Canonical team list + room/seat metadata for 자비스맵 |
| `lib/map/system-metrics.ts` | Disk / memory / CPU / cron-health metric aggregation |
| `lib/map/cron-stats.ts` | Cron run statistics (success rate, last run, avg duration) |
| `lib/map/cron-log-parser.ts` | (team-lead scope — WIP) parsing of cron log files |
| `lib/map/cron-encyclopedia.ts` | Human-readable cron descriptions and categories |
| `lib/map/canvas-draw.ts` | Pixel-art rendering of office map (rooms, avatars, FX) |
| `lib/map/rooms.ts` | Room layout coordinates |
| `lib/db.ts` | SQLite DB connection + schema helpers |
| `lib/llm.ts` | LLM gateway (Groq / Claude CLI / Anthropic) |
| `lib/auth.ts` | Session + cookie helpers |

## Where to find what

| I need... | Look at |
|-----------|---------|
| The list of HTTP routes | `docs/API-INDEX.md` (auto-generated) |
| A specific API handler | `app/api/<segment>/.../route.ts` |
| 자비스맵 team/room data | `lib/map/team-registry.ts` |
| 자비스맵 drawing code | `lib/map/canvas-draw.ts` + `app/company/VirtualOffice.tsx` |
| Briefing popup UI | `components/map/TeamBriefingPopup.tsx` |
| Cron popup UI | `components/map/CronDetailPopup.tsx`, `CronGridPopup.tsx` |
| Cron statistics data | `lib/map/cron-stats.ts`, `/api/crons` |
| Post / comment logic | `app/api/posts/**`, `lib/discussion.ts` |
| LLM call site | `app/api/game/chat/route.ts`, `lib/llm.ts` |
| DB schema / queries | `lib/db.ts`, `scripts/seed.mjs` |
| Auth / guest mode | `proxy.ts`, `lib/auth.ts`, `lib/guest-*.ts` |
| PWA / service worker | `public/sw.js`, `components/SwRegister.tsx` |
| Custom lint rules | `eslint-rules/` |

## Entry points for AI agents

Read in this order when starting a task:

1. **`CLAUDE.md`** (repo root) — build rules, Serena workflow, copyright.
2. **`docs/ARCHITECTURE.md`** (this file) — the mental model.
3. **`docs/API-INDEX.md`** — the full HTTP surface.
4. **Serena first** — for any `.tsx`/`.ts` file, use
   `mcp__serena-board__get_symbols_overview` before `Read`. Never `Read`
   `VirtualOffice.tsx`, `TeamBriefingPopup.tsx`, `canvas-draw.ts`, or any
   `route.ts` over 500 lines whole — use `find_symbol` with
   `include_body=true` on the specific symbol instead.
5. Only fall back to whole-file `Read` for markdown, JSON, and config
   files (LSP cannot parse them anyway).

## Build + verification

```bash
npx tsc --noEmit          # type-check
npx next build            # full build (catches runtime + type errors)
node scripts/gen-api-index.mjs   # refresh API-INDEX.md after route changes
```

Commit style is conventional commits (`feat:`, `fix:`, `refactor:`,
`docs:`, `chore:`) with `Co-Authored-By` footer.
