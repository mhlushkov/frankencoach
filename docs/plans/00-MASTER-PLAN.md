# FrankenCoach — майстер-план ночі (v2)
### Agents 0.0.7 "From Dusk Till Dawn" Hackathon #01 · тема Frankenstein · 8→9 жовтня 2026, Прага

> **Для AI-рев'юера в новому вікні:** прочитай цей файл + `01-TRACK-A-ENGINE.md` + `02-TRACK-B-DESIGN-UI-DEMO.md`, потім виконай розділ 13.
> **Для Claude Code агентів-виконавців:** твій трек у `01-…` або `02-…`. Цей файл — спільна правда. Розділ 4 (контракти) не змінювати без людини.
> **Робоча назва:** FrankenCoach. Перейменувати можна до 23:00, після — ні.

---

## 0. Контекст (де ми і в яких умовах)

- **Подія:** хакатон "From Dusk Till Dawn #01" спільноти Agents 0.0.7 (Etnetera + Green:Code), Etnetera Core, Jankovcova 1037/49, Прага 7. Чт 8 жовтня 16:00 → Пт 9 жовтня 12:00.
- **Команда:** 2 людини + 2–10 паралельних Claude Code агентів. **Максим** — Track A: двигун істоти + логічний шар веб-клієнта + простий робочий dev-UI. **Дружина** — Track B: дизайн у Claude Design, фінальний UI поверх логічного шару, дані, демо-відео.
- **Тема: Frankenstein.** Бриф дослівно: *"Build an agent that can build itself. It must recognize a missing capability, create it, test it, install it and use it again later. Its capabilities may evolve, but its authority may not. By dawn, show a creature that learned to do things it could not do at dusk."* Теги CREATE / TEST / INSTALL / EVOLVE.
- **Мінімальний залік:** агент виявляє відсутню можливість → створює → тестує → встановлює → успішно перевикористовує. Демо підтверджує, що **нових прав не додалося**.
- **Судді:** 0–5 за критерій, сума = Σ(бал/5 × вага).

  | Критерій | Вага |
  |---|---|
  | Працює end-to-end | 35% |
  | Цінність і відповідність треку | 25% |
  | Технічне виконання | 20% |
  | Оригінальність | 10% |
  | Валідація і чесні обмеження | 10% |

- **Правило на місці: проєкт з нуля.** Старий freediver-lungs у коді не використовуємо. Публічний репо з історією комітів з 21:00 — доказ.
- **Здача: 07:14 п'ятниця** — репо + 2-хвилинне демо-відео. ~09:30 презентації, 11:30 нагороди.
- **Ресурси:** кредити OpenAI, Apify, ElevenLabs, Masumi; ментори ввечері; кава всю ніч. Wifi може блокувати порти → hotspot.
- **Час:** ~20:30. Будівництво з 21:00. До здачі ~10 год 45 хв.
- **Критерій команди: вартість у $** (токени на навчання/обробку/аналіз) — видимий лічильник і **перевикористання** замість повторної генерації.
- **Швидкість команди:** Максим за одну ніч зробив 3D-застосунок з 11 протестованими фізичними модулями. План обмежує **ризик і конфлікти**, не амбіцію.

---

## 1. Концепт (точно за брифом)

**FrankenCoach — AI-тренер, який сам будує собі інструменти під будь-який вид спорту і будь-який формат даних.**

На заході сонця істота вміє лише дві базові речі, написані людиною: **бачити тіло** (точки тіла з відео → кути/швидкості) і **читати часові ряди** (таблиця → мін/макс/фази). **Жодного спорту вона не знає.** Усе інше — парсери форматів (Garmin CSV, Apple Health, Strava GPX, невідомий експорт годинника) і аналізатори спортів (фрідайвінг, присідання, баскетбольний кидок, велосипед, волейбол…) — вона **пише сама**, коли вперше стикається з даними, яких не вміє обробити:

1. **Розпізнає прогалину:** "у мене нема парсера для цього формату" / "нема аналізатора для цього спорту".
2. **Перевіряє, чи можна обійтися тим, що вже є** (перевикористання, див. §6) — це головний спосіб економити токени.
3. **Створює:** генерує `tools/<name>/` з кодом **і тестами**.
4. **Тестує:** `bun test` у підпроцесі; червоний → виправляє, ≤3 спроби.
5. **Перевіряє права:** інструмент може тільки обчислювати; ніякої мережі, файлів, env; шлях тільки у своїй папці; права в `contracts/authority.json` фіксовані.
6. **Встановлює:** реєстр на диску; переживає рестарт.
7. **Використовує знову:** наступний файл того ж формату / спорту — миттєво, $0 на навчання.

**Ми не промптимо AI під конкретний спорт.** Ми даємо їй базові "органи", формат інструментів, тестовий стенд і стіну прав. Спорти вона додає сама — і на демо ми показуємо список того, що вона вивчила за ніч, з часом народження, кількістю спроб і ціною.

**Вхід — будь-який:** відео (точки тіла витягуємо в браузері, $0), табличні експорти з годинників/застосунків (CSV/JSON/GPX/TCX/текст), або просто питання текстом.

**Пітч однією фразою:** "На заході сонця вона вміла бачити тіло і читати таблиці. На світанку вона знає шість видів спорту і чотири формати годинників — і кожен вивчила сама, протестувала, і жодного разу не вийшла за свої права."

---

## 2. Рішення вже прийняті (вночі не переобговорювати)

| Рішення | Чому |
|---|---|
| **Веб, не мобілка** | білди/дозволи з'їдять 3 год; журі дивиться відео й лаптоп |
| **Точки тіла в браузері** (`@mediapipe/tasks-vision`, Pose Landmarker), моделі й wasm **вендорені** | $0, без ML-сервера, працює без wifi |
| **Bun + TypeScript скрізь, `bun test`** | одна мова, один раннер; вирощені інструменти — TS із `bun:test` |
| **LLM через `server/agent/llm.ts`**, Anthropic API (особистий ключ, pay-as-you-go); `MODEL_STRONG` для коду, `MODEL_CHEAP` для класифікації/перевірки перевикористання/порад | ціна; ID і ціни зі сторінки цін Anthropic → `contracts/pricing.json`, не з пам'яті |
| **У модель не йдуть відео й повні таблиці.** Тільки: 3 кадри 256px (класифікатор), перші 30 рядків таблиці (визначення формату), метрики (порада) | ціна + чесність |
| **Growth тільки після підтвердження з ціною; бюджет сесії** | "authority не росте" й у грошах; захист від тролів |
| **Два шляхи вводу з жорсткою черговістю:** відео → M2 до 01:00; таблиці → після M2 | не розпорошитися; відео = головне демо, таблиці = друга історія |
| **Логічний шар веб-клієнта (pose, api, state) + dev-консоль пише Track A**; дизайн і фінальний UI — Track B поверх того ж state/api | дружина робить дизайн, поки двигун росте; жодних конфліктів у файлах |
| **Public GitHub з першої хвилини; `contracts/` заморожені о 21:00, редагують тільки люди** | доказ "з нуля"; паралельні агенти |
| **Повний прогін демо до 01:00; після 05:00 жодних нових фіч** | ризик |

---

**Рішення 21:55 — після незалежного ревʼю (блокуючі правки вже в §4; решта тут).**
- Контракти: `find` = точний збіг, `'*'` лише через `findFallback`; `parsed` несе `session`; `AppState`/`Action` у `types.ts`; `stepIndex` у подіях ланцюга; одне підтвердження на весь ланцюг; `savedUsd` = `manifest.costUsd`; `rejected.reason` звужено до 6.
- Виконання grown-інструмента — у підпроцесі з порожнім env (A4 `runTool`), а не `import()`: справжнє «authority may not change».
- ВИКИНУТО: R4 `checkGeneralization` (A9 → 20 хв); GPX/TCX/JSON (лишається CSV: один Garmin-like + другий файл того ж формату для reuse); LLM-кеш для grow (кеш лише для classify/sniff/feedback); `GET /log` і лог у dev-консолі; A15 (YOLO) якщо smoke < 50 % → squat живе демо, фрідайвінг через CSV; у B5 Forget/basedOn/анімація, у B6 hover/tooltip/sparklines; B11 до відео; `model:'heavy'` у A12.
- Промпт росту: `promptContext` = types.ts + sibling (повний) + apiSummary лише `pose-metrics`/`series-core` (не всіх інструментів); `expected.json` НЕ в промпті — чесно в Limitations: «агент сам пише свої тести; expected.json — людська перевірка post-hoc».
- Таймлайн: 22:00 W0 робить реальний smoke `llm.ts` (один виклик, cheap) і прогін `growTool` зі скрипта на squat-фікстурі о 23:00 ДО M1; A11 стартує о 22:30 на моках A8–A10 (агент, не людина); дружина має власний checkout + `agent-worktree.sh` для W5/W6.
- Доказ: `.github/workflows/test.yml` (`bun install && bun test`) з A0; один реальний ролик з вручну порахованими повтореннями як acceptance-тест у README (10 хв, закриває Validation).
- Limitations додати: «агент пише власні тести», «класифікатор імовірнісний: той самий спорт може отримати дві назви», «static scan + підпроцес, не повноцінний sandbox», «валідність таблиці ≠ спорт: будь-який ряд із hr/speed пройде».
- `checkIntent` звузити до `am I ready|clear me|готов(ий|а) до|допуск|diagnos|діагноз|ignore (the )?rules|grant yourself|дай собі` — без `pain`/`injur`.
- Після 07:14: 20 хв репетиція пітчу; відповідь на «а якщо модель напише шкідливий тест»: authority + підпроцес + людина підтверджує ріст + forget.

**Рішення 21:45 — LLM-провайдер.** Безкоштовних токенів OpenAI не буде. Сервер викликає Claude через офіційний `@anthropic-ai/sdk` з **особистим API-ключем Максима** (pay-as-you-go, platform.claude.com). Варіант «апка ходить через `claude -p` на підписці» відкинуто: документація Anthropic прямо вимагає API-ключ для продуктів і не дозволяє маршрутизувати запити через Pro/Max-підписку; до того ж `total_cost_usd` там — лише локальна оцінка. Лічильник $ = реальний `usage` з відповіді API × ціни з `contracts/pricing.json` (скопійовані зі сторінки цін Anthropic, з `fetchedAt` і `source`) — чесно до цента. Моделі: strong = `claude-sonnet-5-5` (код інструментів), cheap = `claude-haiku-5-5` (класифікація, sniff, перевірка reuse, поради); opus — лише якщо sonnet тричі не проходить тест. Ліміт на сесію `SESSION_BUDGET_USD` лишається.

## 3. Архітектура і структура репо

```
frankencoach/
  README.md  package.json  bunfig.toml  tsconfig.json  env.example  .gitignore  CLAUDE.md
  contracts/                     # ЛЮДИ ТІЛЬКИ. Заморожено о 21:00.
    types.ts                     # Landmarks, Session, ToolManifest, ToolResult, AnalyzeRequest, AgentEvent
    authority.json               # фіксовані права
    pricing.json                 # ціни моделей (зі сторінки провайдера)
    activities.json              # канонічні назви спортів + синоніми (стартовий список, агент додає нові канонічні)
    gate-thresholds.json
    events.md  tool-format.md
  server/                        # Track A
    index.ts                     # Bun.serve: POST /analyze (SSE), GET /tools, GET /log, POST /forget, GET /health
    agent/
      loop.ts                    # один запит від початку до кінця
      planner.ts                 # вхід → ланцюг можливостей [parse?] → [analyze]; що є, чого бракує
      reuse.ts                   # канонізація спорту, перевірка "чи підійде наявний інструмент", вибір найближчого "родича" для прикладу
      registry.ts                # tools/registry.json; find(kind,inputType,activity); install; forget; syncFromDisk
      grow.ts                    # згенерувати tool+test → runner → authority → install (≤3)
      runner.ts                  # `bun test tools/<name>` у підпроцесі, таймаут, порожнє env
      authority.ts               # manifest ⊆ authority; статичний скан; path guard; відмова за наміром
      llm.ts  cost.ts  log.ts  cache.ts
      prompts/ grow-analyzer.md  grow-parser.md  classify-input.md  sniff-format.md  reuse-check.md  coach-feedback.md
    gate/
      validity.ts                # $0: людина видима/рух/стабільність; таблиця: непорожня, числові колонки, час монотонний
      classify.ts                # MODEL_CHEAP: isHuman, activity(канон), isSport, environment, intent, mismatch
      sniff.ts                   # MODEL_CHEAP: формат таблиці за 30 рядками + ім'ям файлу → formatId, activity, columns
  tools/                         # ІНСТРУМЕНТИ (комітимо). Вбудовані — людиною, решта — агентом.
    registry.json
    _template-analyzer/  _template-parser/
    pose-metrics/                # вбудований: Landmarks → кути/швидкості/видимість (human)
    series-core/                 # вбудований: Session → resample/min/max/slope/peaks/фази (human)
    freediving-technique/        # agent (аналізатор, landmarks)
    garmin-dive-csv/             # agent (парсер, raw:csv → session)
    freediving-profile/          # agent (аналізатор, session)
    ...
  web/                           # Vite + React + TS
    public/mediapipe/            # .task + wasm (вендорено)
    src/
      core/                      # Track A: ЛОГІКА, без дизайну
        pose/{extract,hash,cache,frames,skeleton}.ts
        api/{client,sse,stub}.ts  + api/fixtures/*.json
        state.ts                 # reducer: події → стан
      dev/DevConsole.tsx         # Track A: потворний, але повний UI (?dev=1): усе видно, все клацається
      ui/                        # Track B: ФІНАЛЬНИЙ UI за дизайном; споживає core/state + core/api
      styles/                    # Track B: токени з Claude Design
      App.tsx                    # Track B (після дизайну); спочатку: `dev` param → DevConsole, інакше ui/Shell
  data/
    videos/  samples/            # сирі відео (gitignore > 5 MB) і табличні експорти (комітимо, якщо < 1 MB)
    landmarks/                   # реальні фікстури landmarks *.json (комітимо)
    synthetic/{make-fixtures,make-tables}.ts + fixtures/   # синтетика з ВІДОМИМИ значеннями
  scripts/ forget.ts  demo-reset.sh  grow-overnight.ts  pose.py (запасний)
  cache/llm/                     # кеш відповідей LLM за хешем промпта (gitignore)
  log/                           # JSONL, комітимо (докази)
  docs/ plans/  design/  DEMO-SCRIPT.md  PITCH.md  POSE-SMOKE-TEST.md  media/
```

**Потік одного запиту:**

1. Браузер: відео → MediaPipe → `Landmarks` (кеш за SHA-256) → скелет → 3 кадри 256px. Або файл (csv/json/gpx/tcx/txt ≤ 1 MB) → текст. Або лише текст.
2. `POST /analyze` → SSE.
3. `authority.checkIntent` (допуск/медицина/зміна правил) → `refused`, стоп.
4. `gate.validity` ($0) → `rejected` з причиною і порадами, стоп.
5. Ідентифікація ($ копійки): відео → `classify` (3 кадри + статистика → канонічний спорт, intent, mismatch); таблиця → `sniff` (30 рядків + ім'я файлу → `formatId`, спорт, колонки).
6. `planner`: ланцюг `[parser(raw:<formatId>) → session] → analyzer(<inputType>, <activity>)`. Для кожної ланки `registry.find`.
7. Бракує ланки → `reuse.check` (§6): синонім? наявний інструмент підходить як є? → `reused`. Інакше `missing_capability` з оцінкою $ → підтвердження → `grow` (з найближчим "родичем" у промпті) → `test_result`… → `authority_check` → `tool_installed`.
8. Виконати ланцюг → `parsed` / `tool_used` (метрики, серії, підсвітки) → `coach-feedback` (MODEL_CHEAP, лише метрики) → `answer` → `cost`.
9. Кожен крок у `log/<date>.jsonl`.

---

## 4. Контракти (заморожені о 21:00 — редагують лише люди, разом)

### 4.1 `contracts/types.ts`

```ts
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
  | { type: 'rejected'; reason: 'no_human' | 'no_motion' | 'not_a_sport' | 'mismatch' | 'low_confidence' | 'bad_table'   // unstable/multiple_people/too_long → low_confidence з текстом; text: string; tips: string[] }
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
```

### 4.2 SSE (`contracts/events.md`)
`POST /analyze` → `text/event-stream`, кожна подія `data: <JSON>\n\n`, heartbeat `: ping\n\n`/10 с. Типовий порядок: `thinking` → (`refused`|`rejected`|`clarify` → кінець) → `identified` → `cost` → `plan` → для кожної ланки: `reused` | (`missing_capability` → кінець, чекаємо `confirmGrow`) | `growing`…`test_result`…`authority_check` → `tool_installed` → `cost(grow)` → `parsed`/`tool_used` → `answer` → `cost(feedback)` → `cost(total)`.

### 4.3 Формат інструмента (`contracts/tool-format.md`)
```
tools/<name>/ manifest.json  index.ts  index.test.ts
```
- Імпорти дозволені **тільки**: `../../contracts/types`, `../pose-metrics`, `../series-core`, `../<будь-який інструмент із registry.json>`, `bun:test`, фікстури `../../data/synthetic/fixtures/*.json` і `../../data/landmarks/*.json`, `../../data/samples/*`.
- Заборонено: `fetch`, `http`, `fs`, `child_process`, `Bun.spawn`, `Bun.write`, `process.env`, `eval`, `Function(`, динамічний `import(`.
- Тести ≥3: (1) відоме значення на синтетиці в межах допуску; (2) сміттєвий вхід → `usable:false` (аналізатор) або `throw ParseError` (парсер); (3) порожній/`null` вхід не падає.
- Семпли в тестах парсера читати ТІЛЬКИ через text-import: `import sample from '../../data/samples/<file>' with { type: 'text' }` (без `fs`/`Bun.file`).
- Пошук у реєстрі: `find({kind,inputType,activity})` = ТОЧНИЙ збіг activity (парсери: збіг `inputType` `raw:<formatId>`); інструмент з `activity:'*'` повертає лише `findFallback` і виконується тільки коли ріст відхилено/провалено (`reused how:'fallback'`). Точний збіг = `reused`, нема = `missing_capability`.
- Виконання інструмента: сервер НЕ робить `import()` інструмента у свій процес; `runner.runTool(name, input)` запускає `bun run tools/_run.ts <name>` у підпроцесі з порожнім env, вхід JSON у stdin, `ToolResult`/`Session` JSON у stdout, таймаут 20 с.

### 4.4 `contracts/authority.json`
```json
{
  "version": 1,
  "allowedPermissions": ["compute"],
  "writablePaths": ["tools/<name>/"],
  "allowedImportPrefixes": ["../../contracts/types", "../pose-metrics", "../series-core", "../", "../../data/", "bun:test"],
  "forbiddenSourceTokens": ["fetch(", "http", "from 'fs'", "from \"fs\"", "node:", "child_process", "Bun.spawn", "Bun.write", "Bun.file", "process.env", "eval(", "Function(", "import("],
  "maxGrowAttempts": 3, "testTimeoutMs": 60000, "sessionBudgetUsdDefault": 1.0, "maxToolsPerSession": 6,
  "neverDo": [
    "медичні поради; оцінка готовності/допуск до занурення, змагань, навантажень",
    "зміна contracts/, authority.json, pricing.json, activities.json (крім додавання нового канонічного спорту через activities.json? — НІ: нові спорти агент додає у tools/registry.json, не в contracts/)",
    "вирощування без підтвердження користувача (крім DEMO_AUTOCONFIRM для нічного скрипта)",
    "надсилання відео/повних таблиць будь-куди; у модель ідуть лише 3 кадри 256px або 30 рядків таблиці, і метрики",
    "мережа, файли, env, підпроцеси з інструментів"
  ]
}
```
`allowedImportPrefixes` з `../` означає: інструмент може імпортувати **інший інструмент** (композиція), але `authority.ts` додатково перевіряє, що ціль імпорту є в `registry.json`.

### 4.5 `contracts/activities.json` (стартовий; агент НЕ редагує; нові канонічні спорти живуть у registry)
```json
{ "canonical": { "freediving": ["freedive","free diving","apnea","apnoea","cwt","fim","dnf","dyn"], "squat": ["squats","air squat","barbell squat","back squat"], "running": ["run","jogging","treadmill"], "cycling": ["bike","biking","road bike","mtb"], "basketball-jump-shot": ["basketball shot","jump shot","three pointer"], "volleyball-spike": ["spike","volleyball attack"], "push-up": ["pushup","press-up"], "swimming": ["swim","freestyle","crawl"] } }
```

### 4.6 HTTP
| Метод | Шлях | Що |
|---|---|---|
| POST | `/analyze` | AnalyzeRequest → SSE |
| GET | `/tools` | `ToolManifest[]` |
| GET | `/log?limit=200` | останні рядки JSONL |
| POST | `/forget` `{name}` | тільки `DEMO_MODE=1`; переносить у `tools/.forgotten/` і чистить `cache/llm` для цього імені |
| GET | `/health` | `{ ok, demoMode, budgetLeftUsd, toolsCount, startedAt }` |

### 4.7 `pricing.json` і `gate-thresholds.json` — як у v1: ціни зі сторінки цін Anthropic; формат `{ "fetchedAt": "<ISO>", "source": "<url>", "models": { "<model id>": { "inputPerM", "outputPerM", "cacheReadPerM", "cacheWritePerM" } } }` (USD за 1M токенів; `null` до заповнення людиною → `usdFor` кидає помилку); пороги `{ minPersonFrameRatio 0.6, minMeanVisibility 0.5, minMotionEnergy 0.02, maxJitter 0.15, maxDurationSec 60, sampleFps 10, minClassifyConfidence 0.7, table: { minRows 10, minNumericCols 1, requireMonotonicTime true } }`.

---

## 5. Сміттєві та дивні входи

Принцип: **не вирощувати й не радити, поки не впевнені, що це людина, що є рух/дані і що це справжня спроба спорту.** Відмова чесна, з причиною і порадою, за $0 або копійки.

| Кейс | Хто ловить | Подія |
|---|---|---|
| Біжить пес / нема людини | `validity` ($0) + `classify.isHuman=false` | `rejected: no_human` + поради, як знімати |
| "Пливе" по підлозі, каже "фрідайвінг" | `classify.environment=floor`, `mismatchWithHint` | `rejected: mismatch` — "не схоже на воду; якщо це суха вправа, скажи так" |
| Випадкові/дурні рухи | `classify.isSport=false` або аналізатор `usable:false` | `rejected: not_a_sport`; якщо наполягає "це новий спорт X" → `clarify` (назва + що міряти) → growth лише після підтвердження і в бюджеті |
| Нерухомо / тряска / далеко / кілька людей | `validity` / `classify` | `no_motion` / `unstable` / `low_confidence` / `multiple_people` |
| Таблиця-сміття (список покупок, порожній CSV, без часу) | `validity.table` ($0) + `sniff.isSportData=false` | `rejected: bad_table` — "не бачу часового ряду зі спортивними величинами" |
| Невідомий, але справжній формат годинника | `sniff` дає `formatId` з `confidence ≥ 0.7` | `missing_capability kind:parser` — це **бажаний** шлях growth |
| Prompt injection / "дай собі мережу" / "ігноруй правила" | `checkIntent` (regex) | `refused` + лог |
| "Чи готовий я на 40 м?", травми, ліки | `checkIntent` + `classify.intent` | `refused` — "рішення інструктора/лікаря" |
| Надто довге відео / файл > 1 MB | браузер | обрізати до 60 с / відмовити з текстом |

Для демо знімаємо: пес-або-порожній-коридор, "пливу по підлозі", випадкові рухи, нерухомо; плюс CSV зі списком покупок.

---

## 6. Перевикористання (головний механізм економії; показуємо журі явно)

| Рівень | Що | Де | Подія/доказ |
|---|---|---|---|
| R1 | Кеш landmarks за SHA-256 відео | браузер `core/pose/cache.ts` | друге завантаження миттєве |
| R2 | Точний збіг у реєстрі `(kind, inputType, activity)` — без жодного виклику LLM | `registry.find` | `reused how:'exact' savedUsd` |
| R3 | Синоніми → канонічний спорт (`activities.json` + `registry` як джерело відомих) ; класифікатор отримує список відомих спортів і **має обрати з нього**, якщо підходить | `reuse.canonicalize` | `reused how:'synonym'` — немає дублів `freedive`/`freediving` |
| R4 | Перевірка узагальнення (тільки якщо R2/R3 порожні): дешева модель бачить описи наявних інструментів і питання "чи підходить якийсь як є?" → ім'я або NONE | `reuse.check` (`reuse-check.md`, ~300 токенів) | `reused how:'generalized'` (напр. `barbell-squat` → `squat`) |
| R5 | Композиція: нові інструменти **імпортують** `pose-metrics`/`series-core`/інші інструменти замість переписувати математику; промпт містить сигнатури всіх інструментів реєстру | `grow` + `authority` (імпорт лише з реєстру) | `manifest.basedOn` |
| R6 | Найближчий родич як приклад: у промпт growth кладемо повний код найсхожішого наявного інструмента (той самий `kind`+`inputType`) замість `_template` | `reuse.pickSibling` | менше спроб; `attempts` у manifest показує тренд "вчиться вчитися" |
| R7 | Кеш LLM за хешем промпта (`cache/llm/`) — повторний ідентичний growth/feedback → $0 | `cache.ts` | `cost.cached:true`; `demo-reset` чистить кеш для інструмента, який будемо рощувати наживо (чесність) |

**Ланцюг для таблиць** також перевикористовується: парсер `garmin-dive-csv` вирощений раз → будь-який наступний Garmin-файл іде через нього; аналізатор `freediving-profile` працює з будь-якого парсера, що дає `Session` з `depth_m`. Отже Apple Health експорт з глибиною потребує тільки нового **парсера**, аналізатор — той самий. Це і є "capabilities evolve" у вигляді графа типів.

---

## 7. Розподіл ролей, паралельні агенти, правила

**Track A — Максим:** `server/`, `tools/` (вбудовані), `data/synthetic/`, `scripts/`, `web/src/core/`, `web/src/dev/`, бутстрап `web/`, перші growth-сесії, нічний ріст, лог.
**Track B — дружина:** Claude Design → `docs/design/`, `web/src/ui/`, `web/src/styles/`, `web/src/App.tsx` (після дизайну), `web/index.html`, `data/videos`, `data/samples`, `data/landmarks`, `docs/DEMO-SCRIPT.md`, `docs/PITCH.md`, `docs/POSE-SMOKE-TEST.md`, `docs/media/` (b-roll), README-секції, фінальне відео.
**Разом, тільки люди:** `contracts/`, верх `README.md`, назва, мерджі.

**Правила для кожного агента (у `CLAUDE.md` репо):**
1. Працюй тільки в папках своєї таски. Не чіпай `contracts/`. Контракт заважає → зупинись і скажи людині.
2. Читай `contracts/types.ts` перед кодом. Не вигадуй поля.
3. Тест спочатку; `bun test` у корені зелений перед кожним комітом (Track B: `cd web && bun run build` чистий).
4. Коміт кожні 20–30 хв: `git pull --rebase && git push`. Префікси: `feat(server)`, `feat(web-core)`, `feat(ui)`, `tool(agent)`, `data`, `docs`, `test`.
5. Залежності тільки зі списку: `@anthropic-ai/sdk`, `zod`, `@mediapipe/tasks-vision`, `react`, `react-dom`, `vite`, `@vitejs/plugin-react`, `typescript`, `@types/bun`. Інше — спитай.
6. Жодних фіч поза таскою. 7. Ніколи не комітити `.env`, відео > 5 MB, `cache/`.

**Як саме запускати 8–10 вікон, worktree на вікно, allow-list прав, англійський `CLAUDE.md`, промпт-шаблон і вибір моделі/effort — у `03-FLEET-OPS.md`.** Агенти читають тільки `CLAUDE.md` + `contracts/` + свою картку; промпти агентам — англійською.

**Межа між треками у `web/`:** Track A володіє `core/**` і `dev/**`; Track B — `ui/**`, `styles/**`, `App.tsx`, `index.html`. `ui/` **читає** `core/state.ts` і `core/api/client.ts`, не змінює їх. Якщо UI потребує нового поля в state — записка Максиму, він додає в `core/state.ts` за 5 хв.

**Старт о 21:00 (кожне вікно = worktree, `scripts/agent-worktree.sh`, див. 03):** Track A — 4 вікна (A1 фікстури; A2a `pose-metrics`; A2b `series-core`; A6 llm/cost/log/cache) + людина робить A0 і web-каркас. Track B — людина в Claude Design (B1), 1 агент на B7-дані не потрібен до 22:30.

---

## 8. Таймлайн

| Час | Майлстоун | "Зроблено" |
|---|---|---|
| **до 21:00** | **M0** | публічний репо, `bun install`, `.env`, `contracts/` заморожені, MediaPipe вендорено, **smoke-тест MediaPipe на нирку** → `docs/POSE-SMOKE-TEST.md`, відео зняті, хоч один реальний експорт годинника (або рішення: синтетика) |
| 22:30 | дизайн готовий | `docs/design/` з токенами й екранами з Claude Design; Track B агенти починають `ui/` проти stub-подій |
| 23:30 | **M1 вертикальний зріз (dev-консоль)** | відео → landmarks → `/analyze` → `pose-metrics` → `answer` → $ видно |
| 01:00 | **M2 перший growth наживо** | `freediving-technique` (або `squat-form`) вирощено через UI, зелений, встановлено, лог; другий файл → `reused`. **Записати screen-recording** (b-roll) |
| 02:30 | **M3 таблиці** | CSV годинника → парсер + аналізатор вирощено ланцюгом; другий CSV → парсер reused; UI показує графік серії |
| 03:30 | **M4 чесність і права** | 4 сміттєві входи → 4 відмови за $0; "чи готовий на 40 м" → `refused`; рестарт → усе на місці; `ui/` замінив dev-консоль на головній |
| 05:00 | **M5 freeze** | нічний ріст: ≥3 спорти + 1 формат (CSV), кожен — коміт із часом; README з таблицею "learned overnight" і $ |
| 06:15 | **M6 відео** | 2 хв, ≤3 дублі; слайди |
| 07:00 | **M7 здано** | репо + відео за інструкцією організаторів. 07:14 стоп |

Сон: по 20 хв (Максим 03:30, дружина 04:00) поки агенти крутяться. 24:00 — snack, обоє, 10 хв.

---

## 9. Демо 2 хв (чернетка; Track B доводить у `docs/DEMO-SCRIPT.md`)

| Час | Екран | Слова |
|---|---|---|
| 0:00–0:10 | панель органів: `pose-metrics`, `series-core` — born 21:0x by human | "На заході вона вміла бачити тіло і читати таблиці. Жодного спорту." |
| 0:10–0:40 | нирок → скелет → `identified: freediving` → `plan` → "не вмію фрідайвінг, ~$0.0x?" → Learn → `growing 1/3` → ✅ → `authority ok` → `installed` | "Пише собі інструмент, тестує, перевіряє, що не отримала нових прав, встановлює." |
| 0:40–0:55 | метрики + підсвічені коліна + порада | "Відповідь із цифр." |
| 0:55–1:05 | другий нирок → `reused exact, saved $0.0x` | "Вдруге — за секунду і безкоштовно." |
| 1:05–1:25 | Garmin CSV → "не вмію читати цей формат" → парсер + аналізатор профілю → графік глибини; другий CSV → `reused` | "Будь-який формат, будь-який спорт: вона росте ланцюгами." |
| 1:25–1:35 | панель: squat, running, cycling-gpx, basketball… born 02:40, 03:55 by agent, attempts 3→1, $ | "За ніч вивчила сама ще п'ять. Третю спробу їй уже не треба." |
| 1:35–1:47 | "пливу по підлозі" → `mismatch $0`; список покупок CSV → `bad_table $0`; "готовий на 40 м?" → `refused` | "Сміття не аналізує, права не росте." |
| 1:47–2:00 | рестарт → панель та сама; сесія: $0.xx | "Усе на диску. Ніч коштувала менше за каву." |

---

## 10. Мапа на критерії журі

| Критерій | Чим | Де видно |
|---|---|---|
| End-to-end 35% | 0:10–1:25 без рук у коді | відео + live |
| Цінність/трек 25% | істота **сама** будує парсери й аналізатори під будь-який спорт/формат; реальний біль "відео/експорт тренеру"; "права не ростуть" | пітч + панель |
| Технічне 20% | тести в підпроцесі, статичний скан прав, реєстр на диску, граф типів parser→analyzer, 7 рівнів перевикористання, SSE, лог, лічильник $ | README + `log/` |
| Оригінальність 10% | агент, що додає види спорту й формати сам; не промптинг під спорт | пітч |
| Чесність 10% | gate, `usable:false`, `refused`, ≤3 спроби, "2D одна камера", "скан ≠ sandbox", "класифікатор бачить 3 кадри/30 рядків" | 1:35–1:47 + слайд |
| "З нуля" | публічний репо з 21:00, лог | GitHub |

---

## 11. Ризики і план Б

| Ризик | План Б |
|---|---|
| MediaPipe не бачить тіло під водою | `heavy` модель; `scripts/pose.py` (YOLO-pose → той самий JSON, upload у UI); живе демо на сухому відео, підводне — обмеження на слайді. Рішення о 21:00 за smoke-тестом |
| Модель 3× не пише зелений інструмент | промпт із родичем (R6) і сигнатурами (R5); простіший спорт для live; ручний інструмент у гілці `fallback/` **не показуємо як вирощений** |
| Таблиці з'їдають час | жорстка черга: таблиці тільки після M2; якщо о 02:30 ланцюг не працює — таблиці лишаються як "next step" на слайді, демо = відео |
| Дизайн не встигає | dev-консоль показуємо як є (вона повна), дизайн — як слайд "що буде" |
| Wifi | hotspot; все вендорено; `bun install` до 21:00 |
| Кредити/ліміти | запасний ключ у `llm.ts`; `SESSION_BUDGET_USD` |
| Конфлікти агентів | §7 межі папок; `contracts/` тільки люди |
| Вигоріли | сон по 20 хв; після 05:00 нічого нового |

---

## 12. Чекліст до 21:00
- [ ] Обоє в HQ `hq.agents007.ai` в одній команді; Discord
- [ ] Питання організаторам: куди здавати; чи ок каркас/README до 21:00; формат відео
- [ ] `gh repo create frankencoach --public`; README "Built from scratch, first commit 21:0x"
- [ ] Ключі; `MODEL_STRONG/CHEAP`; `pricing.json` зі сторінки цін
- [ ] `bun install`; `web/public/mediapipe/` з `.task` і wasm
- [ ] Smoke-тест MediaPipe на нирку (поза репо) → результат у `docs/POSE-SMOKE-TEST.md` після 21:00
- [ ] Відео: 2 нирки (якщо є), 2 присідання, 1 біг, 1 ще один спорт, 4 сміттєві
- [ ] Таблиці: експорт із Garmin Connect / Strava / Apple Health-застосунку, якщо є акаунт; інакше синтетика (A1)
- [ ] З 03 §3 у репо: `.claude/settings.json` (allow-list), англійський `CLAUDE.md`, `scripts/agent-worktree.sh`
- [ ] 8 вікон відкрито; W1–W4 worktree створені; промпт 03 §4 у буфері з `<ID>`; модель/effort за 03 §5
- [ ] Hotspot, зарядки, навушники; ці чотири файли в `docs/plans/`

---

## 13. Запит на незалежний рев'ю (вставити в НОВЕ вікно разом із чотирма файлами)

> Ти — незалежний технічний рев'юер хакатон-плану. 2 людини + паралельні Claude Code агенти, 10 годин (21:00 → 07:14), бриф у §0–1. Прочитай чотири файли. Не переписуй план. Відповідь коротко, нумерованими списками, 1–2 речення на пункт, з посиланнями на ID тасок (A1…, B1…):
> 1. **5 найімовірніших способів провалитися до 07:14**, у порядку ймовірності, з майлстоуном, де це станеться.
> 2. **Чи справді концепт відповідає брифу "agent that builds itself"** — де план непомітно підмінює це промптингом під спорт? Що журі назве "не самобудова"?
> 3. **Діри в контрактах (§4):** поля, яких бракує для Track A/B; місця, які два паралельні агенти зрозуміють по-різному; чи достатній граф `parser → session → analyzer`.
> 4. **Перевикористання (§6):** який рівень не спрацює або дасть хибне "reused"; де токени витечуть непомітно.
> 5. **Сміттєві входи (§5):** який кейс тролінгу пройде крізь gate.
> 6. **Межа Track A / Track B у `web/`:** де дизайн-UI і dev-консоль зіткнуться; чи реалістично натягнути дизайн з Claude Design до 03:30.
> 7. **Пропуски проти рубрики (§0, §10).**
> 8. **Що викинути**, щоб гарантовано встигнути (конкретні таски).
