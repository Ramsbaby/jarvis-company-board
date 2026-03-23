/**
 * Consensus Parser — Extracts DEV tasks from board consensus markdown
 *
 * Parses markdown sections with priority headers (🔴 HIGH / 🟡 MEDIUM / 🟢 LOW)
 * and extracts checkbox items as ParsedTask objects for database insertion.
 */

export interface ParsedTask {
  /** Task title extracted from **title** markdown */
  title: string;
  /** Detailed description including files, code hints, completion criteria */
  detail: string;
  /** Priority level: 'high', 'medium', or 'low' */
  priority: 'high' | 'medium' | 'low';
}

/**
 * Parses consensus markdown and extracts dev tasks from priority sections
 *
 * Expected format:
 * ### 🔴 HIGH — 지금 바로 시작
 * - [ ] **Task Title**
 *   - 파일: `path/file.ts`
 *   - 할 일: Description of work
 *   - 코드 힌트:
 *     ```
 *     code example
 *     ```
 *   - 완료 기준: Completion criteria
 *
 * @param consensusMarkdown - The full consensus markdown content
 * @returns Array of parsed tasks ready for database insertion
 */
export function parseConsensusTasks(consensusMarkdown: string): ParsedTask[] {
  const tasks: ParsedTask[] = [];

  // Split content into lines for processing
  const lines = consensusMarkdown.split('\n');
  let currentPriority: 'high' | 'medium' | 'low' | null = null;
  let currentTask: Partial<ParsedTask> | null = null;
  let detailLines: string[] = [];
  let inTaskDetails = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check for priority section headers
    if (line.includes('### 🔴 HIGH')) {
      // Finalize any pending task before switching sections
      if (currentTask && currentTask.title) {
        finalizeCurrentTask(tasks, currentTask, detailLines);
      }
      currentPriority = 'high';
      currentTask = null;
      detailLines = [];
      inTaskDetails = false;
      continue;
    }

    if (line.includes('### 🟡 MEDIUM')) {
      // Finalize any pending task before switching sections
      if (currentTask && currentTask.title) {
        finalizeCurrentTask(tasks, currentTask, detailLines);
      }
      currentPriority = 'medium';
      currentTask = null;
      detailLines = [];
      inTaskDetails = false;
      continue;
    }

    if (line.includes('### 🟢 LOW')) {
      // Finalize any pending task before switching sections
      if (currentTask && currentTask.title) {
        finalizeCurrentTask(tasks, currentTask, detailLines);
      }
      currentPriority = 'low';
      currentTask = null;
      detailLines = [];
      inTaskDetails = false;
      continue;
    }

    // Reset priority when hitting other sections or section breaks
    if (line.startsWith('###') && !line.includes('🔴') && !line.includes('🟡') && !line.includes('🟢')) {
      // Finalize any pending task before exiting priority sections
      if (currentTask && currentTask.title) {
        finalizeCurrentTask(tasks, currentTask, detailLines);
      }
      currentPriority = null;
      currentTask = null;
      detailLines = [];
      inTaskDetails = false;
      continue;
    }

    if (line.startsWith('---')) {
      // Section divider - finalize current task
      if (currentTask && currentTask.title) {
        finalizeCurrentTask(tasks, currentTask, detailLines);
      }
      currentPriority = null;
      currentTask = null;
      detailLines = [];
      inTaskDetails = false;
      continue;
    }

    // Only process task items if we're in a priority section
    if (!currentPriority) continue;

    // Check for task checkbox item: - [ ] **Task Name**
    const taskMatch = line.match(/^-\s+\[\s*\]\s+\*\*(.+?)\*\*/);
    if (taskMatch) {
      // Finalize previous task if exists
      if (currentTask && currentTask.title) {
        finalizeCurrentTask(tasks, currentTask, detailLines);
      }

      // Start new task
      currentTask = {
        title: taskMatch[1].trim(),
        priority: currentPriority
      };
      detailLines = [];
      inTaskDetails = true;
      continue;
    }

    // Collect detail lines for current task
    if (inTaskDetails && currentTask) {
      // Include indented content and continuation lines
      if (line.startsWith('  ') || line.startsWith('\t') || line === '') {
        detailLines.push(line);
      } else if (line.startsWith('-') && !line.match(/^-\s+\[\s*\]/)) {
        // Non-checkbox list item, could be part of details
        detailLines.push(line);
      } else if (!line.startsWith('#') && !line.startsWith('---')) {
        // Other non-header content could be part of task details
        detailLines.push(line);
      }
    }
  }

  // Don't forget the last task
  if (currentTask && currentTask.title) {
    finalizeCurrentTask(tasks, currentTask, detailLines);
  }

  return tasks;
}

/**
 * Helper function to finalize current task and add it to the tasks array
 */
function finalizeCurrentTask(
  tasks: ParsedTask[],
  currentTask: Partial<ParsedTask>,
  detailLines: string[]
): void {
  if (!currentTask.title || !currentTask.priority) return;

  // Clean up and join detail lines
  const detail = detailLines
    .join('\n')
    .trim()
    // Remove excessive newlines
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .replace(/^\s+/, '')
    .replace(/\s+$/, '');

  tasks.push({
    title: currentTask.title,
    detail: detail || '(세부사항 없음)',
    priority: currentTask.priority
  });
}