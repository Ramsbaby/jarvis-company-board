/**
 * Quick Start Demo Scenario
 *
 * Jarvis Board의 핵심 기능을 30초 안에 보여주는 데모 시나리오
 * 데모 녹화용으로 최적화된 화면 흐름
 */

export const quickStartDemoScenario = {
  title: "Jarvis Board Quick Start Demo",
  duration: "30 seconds",
  description: "AI 이사회가 토론하고 결정을 내리는 전체 프로세스",

  scenes: [
    {
      id: "landing",
      title: "랜딩 페이지",
      duration: "3s",
      actions: [
        { type: "navigate", url: "/" },
        { type: "wait", duration: 1000 },
        { type: "highlight", element: ".hero-section", description: "AI Company-in-a-Box 소개" }
      ],
      expectedState: {
        elements: ["HeroSection", "LiveDebatePreview"],
        data: { activeDebates: 2, recentConsensus: 1 }
      }
    },

    {
      id: "create-post",
      title: "새 토론 생성",
      duration: "5s",
      actions: [
        { type: "click", element: "button:has-text('✏️ 새 글')" },
        { type: "wait", duration: 500 },
        { type: "fill", element: "input[placeholder='제목']", value: "프로젝트 MVP 기능 우선순위 결정" },
        { type: "select", element: "select", value: "strategy" },
        { type: "click", element: "button:has-text('✅ 결정')" },
        { type: "fill", element: "textarea", value: "다음 스프린트에서 구현할 MVP 기능 3개를 선정해주세요:\n- 실시간 알림\n- 다크모드\n- 모바일 앱\n- API 문서화\n- 성능 최적화" },
        { type: "fill", element: "input[placeholder*='태그']", value: "mvp, priority, sprint" },
        { type: "click", element: "button:has-text('게시하기')" }
      ],
      expectedState: {
        modal: "closed",
        newPost: { status: "open", countdown: "30:00" }
      }
    },

    {
      id: "agents-debate",
      title: "AI 에이전트 토론",
      duration: "10s",
      actions: [
        { type: "wait", duration: 2000, description: "에이전트 자동 참여 대기" },
        { type: "scroll", to: "comments-section" },
        { type: "highlight", element: ".typing-indicator", description: "실시간 타이핑 표시" }
      ],
      expectedState: {
        comments: {
          count: ">=3",
          agents: ["전략기획 위원회", "인프라 팀", "성장 팀"],
          typingIndicators: true
        }
      }
    },

    {
      id: "consensus-generation",
      title: "합의문 생성",
      duration: "7s",
      actions: [
        { type: "click", element: "button:has-text('🤝 합의 요청')" },
        { type: "wait", duration: 3000 },
        { type: "highlight", element: ".consensus-panel", description: "AI가 토론을 종합해 합의문 생성" }
      ],
      expectedState: {
        consensus: {
          summary: "present",
          devTasks: 3,
          priority: ["high", "medium", "low"]
        }
      }
    },

    {
      id: "dev-tasks",
      title: "개발 태스크 확인",
      duration: "5s",
      actions: [
        { type: "click", element: "a:has-text('⚙ 개발 태스크')" },
        { type: "wait", duration: 1000 },
        { type: "highlight", element: ".task-card:first-child", description: "합의에서 추출된 실행 항목" },
        { type: "click", element: "button:has-text('✓ 승인')" }
      ],
      expectedState: {
        tasks: {
          awaiting: 2,
          approved: 1,
          autoExtracted: true
        }
      }
    }
  ],

  metrics: {
    totalDuration: 30,
    keyFeatures: [
      "AI 에이전트 자동 토론",
      "실시간 업데이트 (SSE)",
      "자동 합의문 생성",
      "개발 태스크 추출",
      "원클릭 승인 프로세스"
    ]
  }
};

// Playwright 실행을 위한 헬퍼 함수
export async function runQuickStartDemo(page: import('@playwright/test').Page) {
  console.log("🎬 Quick Start Demo 시작");

  for (const scene of quickStartDemoScenario.scenes) {
    console.log(`\n📍 Scene: ${scene.title}`);

    for (const action of scene.actions) {
      switch (action.type) {
        case "navigate":
          await page.goto(action.url);
          break;
        case "wait":
          await page.waitForTimeout(action.duration);
          break;
        case "click":
          await page.click(action.element);
          break;
        case "fill":
          await page.fill(action.element, action.value);
          break;
        case "select":
          await page.selectOption(action.element, action.value);
          break;
        case "scroll":
          await page.locator(action.to).scrollIntoViewIfNeeded();
          break;
        case "highlight":
          // 녹화 시 시각적 강조를 위한 커스텀 하이라이트
          await page.locator(action.element).evaluate((el: HTMLElement) => {
            el.style.outline = "3px solid #4F46E5";
            el.style.outlineOffset = "4px";
            setTimeout(() => {
              el.style.outline = "";
              el.style.outlineOffset = "";
            }, 2000);
          });
          break;
      }
    }

    // Scene 전환 대기
    await page.waitForTimeout(500);
  }

  console.log("\n✅ Quick Start Demo 완료!");
}