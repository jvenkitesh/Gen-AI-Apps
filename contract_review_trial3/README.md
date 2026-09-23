# Contract Review – Trial 3 (JSON dataset rendering + download)

Same app as [`contract_review_application`](../contract_review_application)
(the same ingestion and chat webhooks), plus support for **structured JSON
answers**. Open `index.html` directly in a browser, with no build step.

## What's new

When the chat webhook's reply is JSON, it shows up as data instead of a raw
text bubble:

| Reply shape | Rendered as | Downloads |
|---|---|---|
| Array of objects `[{...}, {...}]` | Table (all keys become columns) | JSON + CSV |
| Object holding an array of objects `{ "clauses": [...] }` | Table of that array, labelled with its key | JSON (full payload) + CSV (table rows) |
| Flat object `{ "a": 1, "b": "x" }` | One-row table | JSON + CSV |
| Any other JSON (deeply nested, etc.) | Formatted JSON block | JSON |
| Plain text | Normal chat bubble (unchanged) | none |

JSON is detected in all of these places:
- a real `application/json` response body
- the usual n8n envelope `{ "output": ... }` / `[{ "output": ... }]`
  (also `reply`, `response`, `message`, `text`)
- a **string** holding JSON, including a fenced ```` ```json ```` block with
  text around it. That text is shown above the table.

Downloads are generated in the browser (`Blob` + `<a download>`), with names
like `contract-dataset-2026-09-23T10-15-00.json` / `.csv`. The CSV follows
RFC 4180 quoting and starts with a UTF-8 BOM so Excel opens it cleanly.

## Getting JSON back from n8n

Ask for structured output in the chat, e.g. *"List every clause with its
title, summary and page number as a JSON array"*. You can also tell the AI
Agent's system prompt to answer in JSON when data is asked for. No workflow
changes are needed: a Respond to Webhook body of `{{ $json.output }}` works
whether the agent returns prose or JSON.
