// ---------- відео ----------
// 33 точки BlazePose: 0 nose, 11/12 shoulders, 13/14 elbows, 15/16 wrists, 23/24 hips, 25/26 knees, 27/28 ankles. Ліва = непарні.
export interface Landmark { x: number; y: number; z: number; visibility: number }  // x,y нормалізовані 0..1
export interface Frame { t: number; landmarks: Landmark[] | null }                 // null = людина не знайдена
export interface Landmarks {
  version: 1; source: 'mediapipe-pose-full' | 'mediapipe-pose-heavy' | 'yolo-pose' | 'synthetic';
  videoHash: string; width: number; height: number; durationSec: number; fps: number; frames: Frame[];
}

// ---------- таблиці (годинники, застосунки) ----------
export interface Series { t: number[]; v: number[]; unit?: string }   // t у секундах від старту
export interface Session {
  version: 1; source: string;                 // formatId парсера: 'garmin-dive-csv' | 'strava-gpx' | 'synthetic-dive' ...
  activityHint?: string; durationSec: number;
  series: Record<string, Series>;             // канонічні імена: depth_m, heart_rate_bpm, speed_mps, cadence_rpm, elevation_m, power_w, temp_c
  events?: { t: number; name: string }[];
  meta: Record<string, string | number>;
}

// ---------- інструменти ----------
export type ToolKind = 'parser' | 'analyzer';
export type ToolInputType = 'landmarks' | 'session' | `raw:${string}`;   // raw:<formatId>, напр. raw:garmin-dive-csv
export interface ToolManifest {
  name: string;                 // kebab-case == назва папки
  kind: ToolKind;
  activity: string;             // канонічний спорт з activities.json; '*' = загальний fallback (pose-metrics/series-core). registry.find(exact) НІКОЛИ не повертає '*': лише findFallback
  inputType: ToolInputType;
  outputType: 'session' | 'result';
  description: string;
  permissions: ('compute')[];   // ТІЛЬКИ 'compute'
  createdBy: 'human' | 'agent';
  createdAt: string;            // ISO
  model?: string; costUsd?: number; attempts?: number;
  basedOn?: string[];           // які наявні інструменти імпортує / з якого взято приклад (доказ перевикористання)
  uses: number; testStatus: 'pass' | 'fail';
}
export interface ToolResult {
  metrics: Record<string, number | number[]>;
  series?: Record<string, Series>;                                   // для графіків у UI (будь-який спорт без змін UI)
  highlights?: { frame: number; joints: number[]; note: string }[];  // підсвітка на оверлеї (тільки landmarks)
  warnings?: string[];
  usable: boolean;                                                   // false = шаблон спорту/формату не знайдено
}
// parser:   export default function parse(raw: string, meta: { filename: string }): Session
// analyzer: export default function analyze(input: Landmarks | Session): ToolResult

// ---------- запит ----------
export type AnalyzeInput =
  | { kind: 'landmarks'; landmarks: Landmarks; frames?: string[] }         // frames: ≤3 dataURL jpeg 256px
  | { kind: 'file'; filename: string; mime: string; text: string }          // ≤ 1 MB, тільки текстові формати
  | { kind: 'none' };
export interface AnalyzeRequest { sessionId: string; message: string; sportHint?: string; input: AnalyzeInput; confirmGrow?: boolean }

// ---------- події ----------
export interface ChainStep { step: 'parse' | 'analyze'; inputType: ToolInputType; activity: string; tool?: string; missing: boolean }
export type AgentEvent =
  | { type: 'thinking'; text: string }
  | { type: 'rejected'; reason: 'no_human' | 'no_motion' | 'not_a_sport' | 'mismatch' | 'low_confidence' | 'bad_table'; text: string; tips: string[] }   // unstable/multiple_people/too_long → low_confidence з текстом
  | { type: 'clarify'; text: string }
  | { type: 'identified'; activity: string; formatId?: string; confidence: number; text: string }
  | { type: 'plan'; chain: ChainStep[] }
  | { type: 'reused'; tool: string; how: 'exact' | 'synonym' | 'fallback' | 'cache'; savedUsd: number; text: string; stepIndex?: number }   // savedUsd = manifest.costUsd інструмента (реальна ціна його росту), не оцінка
  | { type: 'missing_capability'; kind: ToolKind; activity: string; inputType: ToolInputType; estimateUsd: number; basedOn?: string[]; text: string; stepIndex: number }   // одне підтвердження на ВЕСЬ ланцюг: estimateUsd = сума по всіх missing-ланках; після confirmGrow loop росте всі ланки підряд
  | { type: 'growing'; name: string; attempt: number; text: string; stepIndex?: number }
  | { type: 'test_result'; name: string; attempt: number; pass: boolean; summary: string; stepIndex?: number }
  | { type: 'authority_check'; name: string; pass: boolean; text: string; stepIndex?: number }
  | { type: 'tool_installed'; manifest: ToolManifest; stepIndex?: number }
  | { type: 'parsed'; tool: string; session: Session; summary: { durationSec: number; series: string[] }; stepIndex?: number }
  | { type: 'tool_used'; name: string; result: ToolResult; stepIndex?: number }
  | { type: 'answer'; text: string }
  | { type: 'refused'; text: string }
  | { type: 'cost'; step: 'classify' | 'sniff' | 'reuse_check' | 'grow' | 'feedback' | 'total'; model?: string; inputTokens: number; outputTokens: number; usd: number; sessionUsd: number; cached?: boolean }
  | { type: 'error'; text: string };

// ---------- клієнтський стан (web/src/core/state.ts реалізує reducer; ui/ і dev/ ЛИШЕ рендерять і dispatch-ять) ----------
export type Status = 'idle' | 'extracting' | 'ready' | 'analyzing' | 'awaiting_confirm' | 'done' | 'error';
export interface ChatMessage { role: 'user' | 'coach'; text: string; ts: number }
export interface AppState {
  status: Status;
  input?: AnalyzeInput; inputName?: string; frames?: string[];   // frames кешуються тут і НЕ ресемплюються при повторі з confirmGrow (R7 cache hit)
  extractProgress?: number;                                      // 0..1
  messages: ChatMessage[];
  events: AgentEvent[];                                          // усі події поточного запиту, по порядку
  chain?: ChainStep[];
  tools: ToolManifest[];
  pending?: Extract<AgentEvent, { type: 'missing_capability' }>;
  lastRequest?: AnalyzeRequest;                                  // для повтору з confirmGrow: true
  result?: ToolResult; session?: Session;
  sessionUsd: number; lastRequestUsd: number; savedUsd: number;
  error?: string;
}
export type Action =
  | { type: 'inputReady'; input: AnalyzeInput; inputName: string; frames?: string[] }
  | { type: 'extractProgress'; value: number }
  | { type: 'send'; request: AnalyzeRequest }          // status → analyzing; messages += user
  | { type: 'event'; event: AgentEvent }               // ЄДИНЕ місце, де події міняють стан
  | { type: 'requestDone' }
  | { type: 'requestFailed'; error: string }
  | { type: 'toolsLoaded'; tools: ToolManifest[] }
  | { type: 'reset' };
