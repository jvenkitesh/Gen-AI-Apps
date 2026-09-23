---
name: n8n-webhook-debug
description: Diagnose and fix failures between the contract review web apps and their n8n webhooks. Use when a chat/upload request fails (404 "webhook is not registered", HTTP 500, CORS errors, Send does nothing, empty or raw-JSON replies), when changing a webhook URL, or when rebuilding the n8n workflow.
---

# Debugging the n8n webhook integration

This repo has two browser-only apps that talk to n8n Cloud webhooks:

| App | Entry file | Webhooks |
|---|---|---|
| `contract-review-app/` | `index1.html` (inline JS) | one: `N8N_WEBHOOK_URL`, receives `message` + the PDF (`data`) on every turn |
| `contract_review_application/` | `index.html` + `script.js` | two: `INGEST_WEBHOOK_URL` (PDF once, on upload) and `CHAT_WEBHOOK_URL` (only `message`, per turn) |

`contract-review-app/index.html` + `script.js` is a legacy mock, not wired to n8n. Don't debug it.

## Step 1: reproduce outside the browser

Call the webhook directly so browser problems (CORS, iframe sandbox) are out of the picture:

```bash
# chat turn (no file)
curl -sS -i -X POST -F "message=What is the effective date?" "$CHAT_WEBHOOK_URL"
# ingestion / single-webhook app (with the PDF)
curl -sS -i -X POST -F "message=Summarise" -F "data=@contract_review_application/evaluation/Intuit_MSA_contract.pdf;type=application/pdf" "$WEBHOOK_URL"
```

Read the URL constants from the source file; don't guess them.

## Step 2: match the symptom

| Symptom | Cause | Fix |
|---|---|---|
| `404 webhook is not registered` | Using a `/webhook-test/` URL, or the workflow is not Active/Published | Use the `/webhook/` production URL and activate the workflow |
| `500` + `No Respond to Webhook node found` | Missing Respond to Webhook node, or Webhook "Respond" is not "Using Respond to Webhook Node" | Add the node after the AI Agent, body `{{ $json.output }}` |
| `500` with the node present | PDF sent as a filename/JSON string instead of binary | Send `FormData` with the real `File` under the field name set in "Field Name for Binary Data" (`data`) |
| Works with curl, fails in browser | CORS | Webhook node → Options → Allowed Origins `*` |
| Send button does nothing | Relying on native form submit inside a sandboxed iframe | Keep Send as `type="button"` with a click listener plus an Enter keydown handler |
| Reply shows raw JSON | Agent's reply is under a key the app doesn't check | Check the `REPLY_KEYS` / `extractReplyText()` lookup order (`reply`, `response`, `message`, `output`, `text`) and add the key |
| Chat answers about the wrong contract (two-webhook app) | Ingestion replaces one shared in-memory vector store; the last uploaded PDF wins | Expected behaviour; re-upload the right PDF |

## Rules when editing request code

- Never set a `Content-Type` header on a `FormData` body; the browser has to add the multipart boundary itself.
- The binary field name must match between the app (`formData.append('data', ...)`) and the n8n Webhook/Extract from File nodes.
- If you add a symptom not listed above, add it to the Troubleshooting table in `contract-review-app/README.md`.
