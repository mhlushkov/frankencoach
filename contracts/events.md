# SSE (`contracts/events.md`)

`POST /analyze` → `text/event-stream`, кожна подія `data: <JSON>\n\n`, heartbeat `: ping\n\n`/10 с. Типовий порядок: `thinking` → (`refused`|`rejected`|`clarify` → кінець) → `identified` → `cost` → `plan` → для кожної ланки: `reused` | (`missing_capability` → кінець, чекаємо `confirmGrow`) | `growing`…`test_result`…`authority_check` → `tool_installed` → `cost(grow)` → `parsed`/`tool_used` → `answer` → `cost(feedback)` → `cost(total)`.

## HTTP

| Метод | Шлях | Що |
|---|---|---|
| POST | `/analyze` | AnalyzeRequest → SSE |
| GET | `/tools` | `ToolManifest[]` |
| GET | `/log?limit=200` | останні рядки JSONL |
| POST | `/forget` `{name}` | тільки `DEMO_MODE=1`; переносить у `tools/.forgotten/` і чистить `cache/llm` для цього імені |
| GET | `/health` | `{ ok, demoMode, budgetLeftUsd, toolsCount, startedAt }` |
