# Ask-Chirp — Trial 2 AI Chatbox

Ask Chirp / Contract Review App — a chatbox trial for grounded Q&A over an
uploaded loan (or other) contract PDF, powered by an n8n AI Agent workflow.

## Contract Review App (n8n-powered)

A single-page contract review tool: upload a PDF, ask questions about it in
a chat panel, and get grounded answers (with cited evidence from the
document) via an n8n workflow with an AI Agent behind it.

**Status: ✅ Working end-to-end (pipeline).** PDF upload → chat → n8n
webhook → PDF text extraction → AI Agent → Respond to Webhook → back to the
browser. See [Verified working](#verified-working) below.

**Launch readiness:** Subject to Trial 2 eval. A **random / ungrounded
output** on the EVAL PDF is a **NO-GO** for launch — see
[Trial 2 — AI Chatbox](#trial-2--ai-chatbox) and
[Random output — NO-GO launch scenario](#random-output--no-go-launch-scenario).

- **App file:** [`index1.html`](./index1.html) — plain HTML/CSS/JS, no
  build step, no dependencies. Open it directly in a browser.
- **Older 3-file version:** [`index.html`](./index.html) /
  [`styles.css`](./styles.css) / [`script.js`](./script.js) — same UI, but
  only simulates a response and is not wired to n8n. `index1.html` is the
  current, supported version.

---

## Trial 2 — AI Chatbox

### Purpose

Trial 2 validates whether the chatbox answers **only from the uploaded
contract**, with clear citations, on a fixed EVAL loan PDF and three fixed
prompts. Pipeline “works” is not enough: answers must be accurate and
grounded, or launch is blocked.

### EVAL PDF (required)

| | |
|---|---|
| **Document** | Loan agreement PDF used for Trial 2 evaluation |
| **Source (SharePoint)** | [EVAL loan PDF](https://pragyaallc-my.sharepoint.com/:b:/g/personal/sachin_parmar_legalgraph_ai/IQD6lbbrDHV5ToSGrWurVlejAZ9kRJYW40iwWLtE5fzC54M) |
| **How to obtain** | Open the SharePoint link while signed in → **Download** / **Open in browser** → save as a local `.pdf` (the app cannot load SharePoint URLs directly; upload the file from disk) |

### Fixed prompts (use exactly)

Run these **in order** after uploading the EVAL PDF. One prompt per Send;
do not combine them into a single message.

1. `What is the interest rate on this loan?`
2. `Can the borrower repay the loan early, and is there a penalty?`
3. `What happens if the borrower misses a payment?`

### Trial 2 — step-by-step runbook

1. **Open the app**  
   Open [`index1.html`](./index1.html) in a desktop browser (Chrome/Safari/Edge). Prefer a normal browser tab over VS Code Live Preview.

   ```bash
   # from this folder:
   open index1.html
   ```

2. **Confirm n8n is live**  
   In n8n, ensure the workflow behind `N8N_WEBHOOK_URL` in `index1.html` is
   **Active/Published** (production `/webhook/...`, not `/webhook-test/...`
   unless you are deliberately listening for a single test event).

3. **Download the EVAL PDF**  
   Use the SharePoint link above → download the PDF to your machine.

4. **Upload the PDF**  
   Drag the file onto the drop zone, or click **Browse Files** and select it.
   Confirm the filename appears and the PDF preview loads.

5. **Ask prompt 1**  
   Paste: `What is the interest rate on this loan?` → **Send**.  
   Wait for the assistant reply before continuing.

6. **Ask prompt 2**  
   Paste: `Can the borrower repay the loan early, and is there a penalty?` → **Send**.

7. **Ask prompt 3**  
   Paste: `What happens if the borrower misses a payment?` → **Send**.

8. **Score each answer** (pass / fail per prompt)

   | Criterion | Pass | Fail |
   |---|---|---|
   | **Grounded** | Answer is supported by the EVAL PDF (clause/section cited or quoted) | Invented numbers, parties, or remedies not in the PDF |
   | **On-topic** | Directly addresses the question | Vague filler, wrong topic, or “random” generic loan advice |
   | **Honest miss** | If not in the PDF: clearly says it is not in the contract | Guesses anyway |
   | **Stable** | Same question → same substance on a re-run | Wildly different “random” answers across runs |

9. **Record the trial**  
   Note date/time, n8n execution IDs (if available), pass/fail per prompt,
   and screenshots of the three Q&A turns. Tag the run **GO** or **NO-GO**.

### Pass / fail for Trial 2

- **GO (trial pass):** All three prompts pass the scoring table (grounded +
  on-topic + honest miss when applicable). Minor wording differences OK.
- **NO-GO (trial fail):** Any prompt fails for hallucination, random/generic
  output, missing citations when a clause exists, or unstable nonsense
  answers. Treat as the scenario below.

---

## Random output — NO-GO launch scenario

### What “random output” means

The chatbox returns answers that look fluent but are **not tied to the
EVAL PDF**: made-up interest rates, generic “typical loan” language,
wrong default/penalty rules, or contradictory replies on repeat asks.
That is a **launch blocker**, even if the UI and n8n pipeline return HTTP 200.

### When to declare NO-GO

Declare **NO-GO for launch** if any of the following happen on the EVAL PDF
with the fixed prompts:

1. Interest rate (or “not stated”) does not match the document.
2. Prepayment / early repayment rights or penalties are invented or wrong.
3. Missed-payment / default consequences are invented or wrong.
4. Replies cite “the contract” but quote text that is not in the PDF.
5. Two runs of the same prompt give materially different factual claims.
6. The model ignores the upload and answers as a general chatbot.

### Full steps — execute and document a NO-GO

Follow this sequence so a NO-GO is reproducible and reviewable.

#### A. Reproduce

1. Open a **fresh** browser tab of `index1.html` (or click **Clear** and
   re-upload so state is clean).
2. Download and upload the **EVAL PDF** from SharePoint (link above).
3. Run the **three fixed prompts** exactly, one at a time.
4. If a reply looks random/ungrounded, **re-ask the same prompt once** to
   check stability (step 5 in the scoring table).

#### B. Capture evidence

1. Screenshot each failing Q&A turn in the chat panel.
2. In n8n → Executions: open the matching run(s); screenshot the node
   chain and the AI Agent output.
3. Note the production webhook URL in use (from `index1.html`
   `N8N_WEBHOOK_URL`) and whether the workflow was Active.
4. Save the local PDF filename + SharePoint link + date/time of the run.

#### C. Classify the failure

Use one primary label:

| Label | Meaning |
|---|---|
| `HALLUCINATION` | Facts not present in the PDF |
| `GENERIC_RANDOM` | Generic loan advice, not document-specific |
| `WRONG_CLAUSE` | Real-looking citation that does not match the PDF |
| `UNSTABLE` | Same prompt, conflicting answers across runs |
| `PIPELINE_OK_CONTENT_BAD` | n8n 200 / green nodes, but answer still wrong |

#### D. Decision

1. Mark Trial 2: **NO-GO — random / ungrounded output**.
2. **Do not launch** (or do not promote this chatbox build) until fixed.
3. File follow-ups before re-trial:
   - Tighten AI Agent system prompt: answer **only** from extracted PDF
     text; if absent, say so; always quote evidence.
   - Confirm Extract from File is receiving the full PDF (`data` binary).
   - Prefer production webhook; avoid stale test webhooks.
   - Optionally lower temperature / disable unrelated tools.
4. After fixes, re-run the full [Trial 2 runbook](#trial-2--step-by-step-runbook)
   from a clean upload; require **GO** on all three prompts before launch.

#### E. NO-GO checklist (copy into notes)

```
Trial: Trial 2 AI Chatbox
Date:
Operator:
EVAL PDF: SharePoint link + local filename
App: index1.html
Webhook: (paste N8N_WEBHOOK_URL)
n8n Active: yes/no
Prompt 1 result: PASS / FAIL — notes:
Prompt 2 result: PASS / FAIL — notes:
Prompt 3 result: PASS / FAIL — notes:
Primary failure label: HALLUCINATION | GENERIC_RANDOM | WRONG_CLAUSE | UNSTABLE | PIPELINE_OK_CONTENT_BAD
Screenshots attached: yes/no
n8n execution IDs:
Launch decision: NO-GO
Blockers before re-trial:
```

---

### How it works

```
Browser (index1.html)
   │  upload PDF, type a question, click Send
   ▼
POST multipart/form-data  { message, data: <PDF file> }
   ▼
n8n Webhook node  (production URL, CORS "*", binary field name "data")
   ▼
Extract from File node  (Extract From PDF → text)
   ▼
AI Agent node  (Chat Model + Memory + Tool)
   ▼
Respond to Webhook node  (sends the AI Agent's answer back)
   ▼
Browser renders the reply as a chat bubble
```

The n8n workflow used here is `simple_workflow-1_1_webhook`, with this node
chain: **Webhook → Extract from File → AI Agent → Respond to Webhook**.

---

### Running the app locally

No install, no server required:

1. Clone the repo / pull `main`.
2. Open `index1.html` directly in a browser (double-click it, or drag it
   into a browser tab).
3. Drag a PDF into the drop zone (or click **Browse Files**).
4. Type a question in the chat box and click **Send** (or press Enter).

> **Note:** if you're viewing the page inside an embedded preview pane
> (e.g. VS Code's Live Preview / Simple Browser), make sure you're on a
> version of `index1.html` from `main` — an earlier bug meant the Send
> button silently did nothing in sandboxed iframes. This is fixed; Send now
> uses a plain button click handler instead of relying on native HTML form
> submission.

---

### Setting up the n8n workflow from scratch

If you need to rebuild or fork the workflow, here's the full node-by-node
setup:

#### 1. Webhook node (trigger)

1. Add a **Webhook** node as the workflow's trigger.
2. **HTTP Method:** `POST`.
3. **Path:** any unique path (this becomes part of the webhook URL).
4. Open **Options** → **+ Add option**:
   - **Allowed Origins (CORS):** `*` (so a page opened from `file://` or
     any static host can call it without a CORS rejection)
   - **Field Name for Binary Data:** `data` — this must match the
     multipart field name the app sends the PDF under
     (`formData.append("data", selectedFile, ...)` in `index1.html`)
5. **Respond:** set this to **"Using Respond to Webhook Node"** (not
   "Immediately") — the workflow needs to build a real answer before
   responding, and this makes it wait for the node in step 4.

The Webhook node gives you two URLs:
   - **Test URL** (`/webhook-test/<id>`) — only answers **one** request,
     and only after you click "Execute workflow" / "Listen for test event"
     on the canvas immediately beforehand. Good for manual testing inside
     the n8n editor, useless for a real app.
   - **Production URL** (`/webhook/<id>`) — always live, but only once the
     workflow's **Active/Publish** toggle (top-right of the editor) is on.
     This is the one `index1.html` uses.

#### 2. Extract from File node

1. Add an **Extract from File** node after the Webhook node.
2. **Operation:** `Extract From PDF`.
3. **Binary Property:** `data` (matches the Webhook node's binary field
   name from step 1).

This turns the uploaded PDF into plain text for the AI Agent to read.

#### 3. AI Agent node

1. Add an **AI Agent** node after Extract from File.
2. Attach a **Chat Model** (e.g. OpenAI Chat Model) with valid credentials.
3. Optionally attach **Memory** (for follow-up questions) and any **Tools**
   the agent should have access to.
4. In the Agent's prompt/instructions, reference the extracted PDF text
   (from the previous node) and the incoming question (from the Webhook
   node's `message` field) so it answers grounded in the actual document —
   e.g. instruct it to say "This information is not mentioned in the
   contract" when the answer isn't in the text, and to cite the exact
   clause/evidence it used. This is what makes it correctly refuse
   irrelevant questions instead of hallucinating an answer.

#### 4. Respond to Webhook node

This is the node that's easy to forget — without it, the Webhook node has
nothing to send back and every request fails with an **HTTP 500** and the
error `No Respond to Webhook node found in the workflow`.

1. Add a **Respond to Webhook** node, connected after the AI Agent node's
   output.
2. **Respond With:** `JSON` (or `Text`).
3. **Response Body:** reference the AI Agent's actual output field via the
   expression picker (`{{ }}`) — commonly `{{ $json.output }}`, but confirm
   the exact field name from the node's own output in a test execution.
4. Save the workflow, confirm it's still **Active/Published**.

#### 5. Point the app at the workflow

In `index1.html`, set the constant to your workflow's **production**
webhook URL:

```js
const N8N_WEBHOOK_URL = "https://<your-instance>.app.n8n.cloud/webhook/<your-webhook-id>";
```

---

### Request/response format

**Request** (sent by `index1.html` on every chat message):

- `Content-Type: multipart/form-data` (set automatically by the browser —
  never set this header manually when the body is a `FormData` instance,
  or the multipart boundary will be missing and the parse will fail)
- Fields:
  - `message` — the text the user typed
  - `data` — the uploaded PDF file (only present once a file has been
    selected/dropped)

**Response** (expected back from the Respond to Webhook node):

- Either a JSON body with the reply under one of `reply`, `response`,
  `message`, `output`, or `text`, or a plain text body.
  `extractReplyText()` in `index1.html` checks those fields in that order
  and falls back to showing the raw JSON if none match — update that
  function if your workflow uses a different field name.

---

### Troubleshooting

Issues actually hit while building this, in case they recur:

| Symptom | Cause | Fix |
|---|---|---|
| Clicking Send does nothing at all (no user bubble appears) | The Send button relied on the `<form>`'s native `submit` event; embedded preview panes (VS Code Live Preview, Simple Browser, etc.) render pages inside a sandboxed iframe without `allow-forms`, which silently blocks form submission before it reaches JS | Send button is `type="button"` with a direct `click` listener, plus an `Enter` keydown listener on the input — neither depends on native form submission |
| `404 "webhook is not registered"` | Using the **Test URL** (`/webhook-test/...`) without clicking "Execute workflow" in the n8n editor immediately before the request; test webhooks only answer one call | Use the **Production URL** (`/webhook/...`) and make sure the workflow is Active/Published |
| `Could not reach the workflow: Workflow returned 500` + n8n error `No Respond to Webhook node found in the workflow` | No **Respond to Webhook** node in the workflow, or the Webhook node's "Respond" option isn't set to "Using Respond to Webhook Node" | Add the node (see [step 4](#4-respond-to-webhook-node) above) and connect it after the AI Agent |
| `500` even with a Respond to Webhook node present | The workflow expected the actual PDF bytes (binary field `data`) but the app was only sending the filename as a JSON string | Send the request as `multipart/form-data` via `FormData`, with the real `File` object appended under the field name configured in the Webhook node's "Field Name for Binary Data" option |
| Browser blocks the response / silent network failure | CORS not allowed on the Webhook node | Set **Allowed Origins (CORS)** to `*` (or your specific origin) in the Webhook node's options |

---

### Verified working

> **Note:** The checks below prove the **pipeline** (upload → n8n → reply).
> They do **not** replace [Trial 2](#trial-2--ai-chatbox) on the EVAL loan
> PDF. Launch still requires Trial 2 **GO**; see
> [Random output — NO-GO](#random-output--no-go-launch-scenario).

Confirmed end-to-end on a real n8n workflow and a real PDF:

- **n8n execution succeeded** (`ID#63`, 7.021s) through the full chain —
  Webhook → Extract from File → AI Agent → Respond to Webhook, all green:

  ![n8n execution succeeded](./docs/screenshots/n8n-execution-success.webp)

- **The app in the browser**, asking real questions about an uploaded NDA:
  it correctly refused to answer a nonsense question ("Horraaaaaaay" — not
  mentioned anywhere in the contract) instead of hallucinating, and
  correctly pulled the real effective date ("12 February 2024") with the
  exact quoted evidence from the document:

  ![App working end-to-end](./docs/screenshots/app-chat-working.webp)

The whole pipeline — upload → chat → n8n webhook → PDF extraction → AI
Agent → Respond to Webhook → back to the browser — is live and answering
correctly, grounded in the actual uploaded document.
