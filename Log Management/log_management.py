"""
Log Parser Management Application

Parses sample log entries to compute:
- Total number of log entries
- Log counts by category (INFO, ERROR, WARNING, DEBUG, ...)
- Date with the highest number of ERROR entries
"""

from collections import Counter
import re
import csv
import json
import os
import urllib.request
from pathlib import Path
import ssl

try:
    import certifi  # type: ignore[import]
except ImportError:  # certifi is optional but recommended
    certifi = None

# Sample log entries provided for analysis
sample_logs = [
    "2025-10-09 10:15:23 INFO User login successful - user_id: 12345",
    "2025-10-09 10:16:45 ERROR Database connection failed - error: timeout",
    "2025-10-09 10:17:02 WARNING High memory usage detected - 85%",
    "2025-10-09 10:18:30 INFO API request completed - endpoint: /api/users",
    "2025-10-09 10:20:01 DEBUG Starting background job - job_id: 42",
    "2025-10-09 10:21:15 ERROR Failed to send email - recipient: user@example.com",
    "2025-10-09 10:22:40 INFO User logout successful - user_id: 12345",
    "2025-10-01 10:15:23 INFO User login successful - user_id: 67890",
    "2025-10-10 10:16:45 ERROR Database connection failed - error: timeout",
    "2025-10-11 10:17:02 WARNING High memory usage detected - 75%",
    "2025-10-10 10:18:30 INFO API request completed - endpoint: /api/search",
    "2025-10-05 09:00:01 ERROR Failed to connect to Redis - error: connection refused",
    "2025-10-05 09:05:45 ERROR Database timeout error - query took too long",
    "2025-10-05 09:10:30 ERROR File not found - config.yaml missing",
    "2025-10-05 09:15:12 ERROR User authentication failed - invalid password",
    "2025-10-05 09:20:55 ERROR Email service down - unable to send notifications",
]

# Part 1: Initialize counters for log categories and error dates
category_count = Counter()  # Counts number of logs per category (INFO, ERROR, etc.)
error_dates = Counter()  # Counts number of ERROR logs grouped by date

# Regex pattern to extract date and category from each log entry.
# It expects the log line to start with a date (YYYY-MM-DD),
# followed by a time HH:MM:SS, and then the category word
pattern = r"^(\d{4}-\d{2}-\d{2}) \d{2}:\d{2}:\d{2} (\w+)"

# Loop through each log entry to parse and categorize
for log in sample_logs:
    match = re.match(pattern, log)  # Apply regex to extract date and category

    if match:  # Only proceed if log format matches expected pattern
        date, category = match.groups()  # Unpack the extracted date and category

        category_count[category] += 1  # Increment count for this category

        # If the category is ERROR, count the error occurrence by date
        if category == "ERROR":
            error_dates[date] += 1

# Identify the date that has the maximum number of errors
most_errors_date, max_error_count = (
    error_dates.most_common(1)[0] if error_dates else (None, 0)
)

# Print out total number of logs processed
print(f"Total log entries: {len(sample_logs)}\n")

# Print how many logs fall under each category
print("Log entries by category:")
for cat, count in category_count.items():
    print(f"  {cat}: {count}")

# Print the date with the highest number of errors and the count
print(
    f"\nDate with maximum errors: {most_errors_date} ({max_error_count} errors)"
)

# ---------------------------
# Gemini Pro (optional insights)
# ---------------------------
user_id_mentions = sum("user_id" in log for log in sample_logs)


def call_gemini_pro(prompt: str) -> str | None:
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        # Fallback to local secret file (keep secrets out of code and commits).
        # Expected path: <project_root>/.environment/GOOGLE_API_KEY
        secret_path = (
            Path(__file__).resolve().parent.parent / ".environment" / "GOOGLE_API_KEY"
        )
        if secret_path.exists():
            api_key = secret_path.read_text(encoding="utf-8").strip()

    if not api_key:
        return None

    # Default Gemini model (override with GEMINI_MODEL).
    # This matches the model used in your working curl example.
    model = os.getenv("GEMINI_MODEL", "gemini-flash-latest")
    url = (
        "https://generativelanguage.googleapis.com/v1beta/"
        f"models/{model}:generateContent"
    )

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-goog-api-key": api_key,
        },
        method="POST",
    )

    try:
        # Use certifi CA bundle when available to avoid SSL errors on macOS.
        if certifi is not None:
            context = ssl.create_default_context(cafile=certifi.where())
            opener = urllib.request.build_opener(
                urllib.request.HTTPSHandler(context=context)
            )
            with opener.open(req, timeout=30) as resp:
                body = json.loads(resp.read().decode("utf-8"))
        else:
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        # Don't crash the whole script if the LLM call fails (SSL, network, etc.).
        print(f"\nGemini Pro call failed: {e}\n")
        return None

    # Expected shape: { candidates: [ { content: { parts: [ { text: "..." } ] } } ] }
    try:
        return body["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError):
        return json.dumps(body, indent=2)  # Fallback: show raw response


prompt = (
    "You are a senior SRE/log analysis assistant. "
    "Given these parsed log statistics, provide:\n"
    "1) A short plain-English summary\n"
    "2) Likely causes of the ERROR spike\n"
    "3) 3 concrete next monitoring/diagnostic steps\n\n"
    f"Total log entries: {len(sample_logs)}\n"
    f"Category counts: {dict(category_count)}\n"
    f"Date with maximum errors: {most_errors_date} ({max_error_count} errors)\n"
    f"Log entries mentioning 'user_id': {user_id_mentions}\n"
    "Keep the response concise (max ~150 words)."
)

llm_text = call_gemini_pro(prompt)
if llm_text:
    print("\nGemini Pro insights:\n")
    print(llm_text)
else:
    print('\nGemini Pro insights skipped: set GOOGLE_API_KEY to enable LLM analysis.')