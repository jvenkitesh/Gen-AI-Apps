---
name: test-contract-app
description: Verify UI changes to the contract review web apps in a real browser with Playwright, with the n8n webhooks stubbed. Use after editing index.html, index1.html, script.js, or the CSS, or when asked to test, screenshot, or check that the app works.
---

# Testing the contract review apps in a browser

Both apps are static pages with no build step and no package.json. Test them by opening the HTML file in headless Chromium and **stubbing the n8n webhooks** with `page.route`. Don't hit the live n8n URLs from tests; they are shared and stateful.

Chromium is at `/opt/pw-browsers` (`PLAYWRIGHT_BROWSERS_PATH` is already set). Don't run `playwright install`. If the Python package is missing, run `pip install playwright`.

## Template (Python)

Write this to the scratchpad, not the repo:

```python
import json, pathlib
from playwright.sync_api import sync_playwright

APP = pathlib.Path("contract_review_application/index.html").resolve()
PDF = pathlib.Path("contract_review_application/evaluation/Intuit_MSA_contract.pdf").resolve()

def fake_n8n(route):
    body = {"output": json.dumps({"response": "Arvato Services Inc.",
                                  "citation": ["page 1"], "reasoning": "stub"})}
    route.fulfill(status=200, content_type="application/json", body=json.dumps(body))

with sync_playwright() as p:
    page = p.chromium.launch().new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route("**/webhook/**", fake_n8n)
    page.goto(APP.as_uri())
    page.set_input_files("#file-input", str(PDF))
    page.wait_for_function("!document.getElementById('chat-input').disabled")
    page.fill("#chat-input", "What is the Service Provider Name?")
    page.click("#send-btn")
    page.wait_for_selector("text=Arvato Services Inc.")
    page.screenshot(path="/tmp/app.png", full_page=True)
    assert not errors, errors
```

Change the stub body to cover the path you touched:

- plain text (`content_type="text/plain"`) → normal chat bubble
- array of objects / `{ "clauses": [...] }` / fenced ```` ```json ```` string → table with JSON + CSV download buttons
- `status=500` → red error bubble reading "Could not reach the workflow: …"
- after a successful reply, `localStorage.contractReviewResponses` should hold the entry and the Download responses button should show

For `contract-review-app/index1.html`, one webhook receives both the message and the PDF. Check that the request is multipart and includes `data` (use `route.request.post_data_buffer`).

## Finish

Check for uncaught page errors, look at the screenshot, and tell the user what you verified. Say plainly that the webhooks were stubbed, so the live n8n workflow was not exercised.
