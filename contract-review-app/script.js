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

  // Ingestion webhook: takes the PDF once, right after upload. The
  // workflow behind it rebuilds a single shared in-memory vector store
  // from this file, so there's no session/document ID to track — one
  // contract loaded at a time is the assumption.
  const INGEST_WEBHOOK_URL = "https://jyotiv99.app.n8n.cloud/webhook-test/b0ddf539-6bf7-4265-b41c-c094f7dfe19a";
  // Chat webhook: takes just the typed message, per turn. It answers
  // against whatever contract the ingestion webhook most recently
  // indexed into the shared store.
  const CHAT_WEBHOOK_URL = "https://jyotiv99.app.n8n.cloud/webhook-test/27c91df5-80d8-413b-9a0e-1cec720b2262";

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
      addMessage(extractReplyText(data), "assistant");
    } catch (err) {
      thinkingEl.remove();
      addMessage(`Could not reach the workflow: ${err.message}`, "error");
    }
  });
})();
