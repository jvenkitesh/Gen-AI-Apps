(() => {
  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("fileInput");
  const browseBtn = document.getElementById("browseBtn");
  const pdfViewer = document.getElementById("pdfViewer");
  const pdfEmbed = document.getElementById("pdfEmbed");
  const fileName = document.getElementById("fileName");
  const clearBtn = document.getElementById("clearBtn");

  const chatForm = document.getElementById("chatForm");
  const chatInput = document.getElementById("chatInput");
  const chatMessages = document.getElementById("chatMessages");
  const sendBtn = document.getElementById("sendBtn");
  const downloadResponsesBtn = document.getElementById("downloadResponsesBtn");

  // Ingestion webhook: takes the PDF once, right after upload. The
  // workflow behind it rebuilds a single shared in-memory vector store
  // from this file, so there's no session/document ID to track — one
  // contract loaded at a time is the assumption.
  const INGEST_WEBHOOK_URL = "https://jyotiv99.app.n8n.cloud/webhook/b0ddf539-6bf7-4265-b41c-c094f7dfe19a";
  // Chat webhook: takes just the typed message, per turn. It answers
  // against whatever contract the ingestion webhook most recently
  // indexed into the shared store.
  const CHAT_WEBHOOK_URL = "https://jyotiv99.app.n8n.cloud/webhook/27c91df5-80d8-413b-9a0e-1cec720b2262";

  let currentObjectUrl = null;
  let selectedFile = null;

  function loadPdf(file) {
    if (!file || file.type !== "application/pdf") {
      alert("Please upload a PDF file.");
      return;
    }

    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
    }

    selectedFile = file;
    currentObjectUrl = URL.createObjectURL(file);
    pdfEmbed.setAttribute("src", currentObjectUrl);
    fileName.textContent = file.name;

    dropZone.hidden = true;
    pdfViewer.hidden = false;

    ingestContract(file);
  }

  // Sends the freshly loaded PDF to the ingestion webhook so it can be
  // indexed into the shared vector store before the user is allowed to
  // chat against it.
  async function ingestContract(file) {
    chatInput.disabled = true;
    sendBtn.disabled = true;

    const statusEl = addMessage("Indexing contract...", "assistant", true);

    try {
      const formData = new FormData();
      formData.append("data", file, file.name);

      const response = await fetch(INGEST_WEBHOOK_URL, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Workflow returned ${response.status} ${response.statusText}`);
      }

      statusEl.remove();
      chatInput.disabled = false;
      sendBtn.disabled = false;
    } catch (err) {
      statusEl.remove();
      addMessage(`Could not index contract: ${err.message}`, "error");
      clearPdf();
    }
  }

  function clearPdf() {
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = null;
    }
    selectedFile = null;
    pdfEmbed.removeAttribute("src");
    fileInput.value = "";
    pdfViewer.hidden = true;
    dropZone.hidden = false;
  }

  browseBtn.addEventListener("click", () => fileInput.click());
  dropZone.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", () => {
    if (fileInput.files && fileInput.files[0]) {
      loadPdf(fileInput.files[0]);
    }
  });

  clearBtn.addEventListener("click", clearPdf);

  ["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove("dragover");
    });
  });

  dropZone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) {
      loadPdf(file);
    }
  });

  function addMessage(text, role, isThinking = false) {
    const messageEl = document.createElement("div");
    messageEl.className = `chat-message ${role}`;

    const bubble = document.createElement("div");
    bubble.className = isThinking ? "bubble thinking-bubble" : "bubble";
    bubble.textContent = text;

    messageEl.appendChild(bubble);
    chatMessages.appendChild(messageEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return messageEl;
  }

  function extractReplyText(data) {
    if (typeof data === "string") return data;
    if (Array.isArray(data)) return extractReplyText(data[0]);
    if (data && typeof data === "object") {
      return (
        data.reply ||
        data.response ||
        data.message ||
        data.output ||
        data.text ||
        JSON.stringify(data)
      );
    }
    return "Received an empty response from the workflow.";
  }

  function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function safeJsonParse(text) {
    try {
      return JSON.parse(text);
    } catch (err) {
      return undefined;
    }
  }

  // Looks for a structured { response, citation, reasoning } object in the
  // webhook payload, unwrapping n8n's { output: "<stringified json>" }
  // envelope (optionally inside a 1-item array) one level. Returns null
  // when no such object is present — the caller still saves using the
  // plain text already shown in the chat, just without citation/reasoning.
  function findStructuredReply(data) {
    let value = data;

    if (typeof value === "string") {
      value = safeJsonParse(value);
      if (value === undefined) return null;
    }

    if (Array.isArray(value) && value.length === 1) {
      value = value[0];
    }

    if (isPlainObject(value) && "output" in value && !("response" in value)) {
      let inner = value.output;
      if (typeof inner === "string") {
        inner = safeJsonParse(inner);
        if (inner === undefined) return null;
      }
      value = inner;
    }

    if (Array.isArray(value) && value.length === 1) {
      value = value[0];
    }

    return isPlainObject(value) && "response" in value ? value : null;
  }

  // Successful question/response pairs are kept in the browser's
  // localStorage (no backend) and exported as config.json on demand.
  const RESPONSES_STORAGE_KEY = "contractReviewAppResponses";

  function loadSavedResponses() {
    try {
      const saved = JSON.parse(localStorage.getItem(RESPONSES_STORAGE_KEY));
      return Array.isArray(saved) ? saved : [];
    } catch (err) {
      return [];
    }
  }

  // Saves a successful turn to localStorage. "response" always matches
  // the text actually shown in the chat bubble; citation/reasoning are
  // pulled from the raw webhook payload when the backend provides them.
  function saveSuccessfulResponse(question, data, displayedText) {
    const structured = findStructuredReply(data);
    const rawCitation = structured ? structured.citation ?? structured.citations : undefined;
    const citation = Array.isArray(rawCitation)
      ? rawCitation.map((c) => String(c))
      : rawCitation
      ? [String(rawCitation)]
      : [];
    const reasoning = structured && typeof structured.reasoning === "string" ? structured.reasoning : "";

    const entries = loadSavedResponses();
    entries.push({
      question,
      response: displayedText,
      citation,
      reasoning,
    });

    try {
      localStorage.setItem(RESPONSES_STORAGE_KEY, JSON.stringify(entries));
      downloadResponsesBtn.hidden = false;
    } catch (err) {
      console.error("Could not save response to localStorage:", err);
    }
  }

  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  downloadResponsesBtn.hidden = loadSavedResponses().length === 0;
  downloadResponsesBtn.addEventListener("click", () => {
    downloadFile(JSON.stringify(loadSavedResponses(), null, 2), "config.json", "application/json");
  });

  chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;

    addMessage(text, "user");
    chatInput.value = "";

    const thinkingEl = addMessage("Thinking...", "assistant", true);

    try {
      // Sent as multipart/form-data (not JSON), matching the ingestion
      // request. The PDF itself already went to the ingestion webhook
      // when it was uploaded, so only the message is sent here — the
      // chat workflow answers against whatever the shared vector store
      // currently holds. Do not set a Content-Type header here: fetch
      // generates the multipart boundary itself when the body is a
      // FormData instance.
      const formData = new FormData();
      formData.append("message", text);

      const response = await fetch(CHAT_WEBHOOK_URL, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Workflow returned ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type") || "";
      const data = contentType.includes("application/json")
        ? await response.json()
        : await response.text();

      thinkingEl.remove();
      const displayedText = extractReplyText(data);
      addMessage(displayedText, "assistant");
      saveSuccessfulResponse(text, data, displayedText);
    } catch (err) {
      thinkingEl.remove();
      addMessage(`Could not reach the workflow: ${err.message}`, "error");
    }
  });
})();
