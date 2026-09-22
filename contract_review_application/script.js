(function () {
  const fileInput = document.getElementById('file-input');
  const uploadArea = document.getElementById('upload-area');
  const fileInfo = document.getElementById('file-info');
  const fileName = document.getElementById('file-name');
  const removeFileBtn = document.getElementById('remove-file');
  const pdfPreview = document.getElementById('pdf-preview');
  const pdfEmbed = document.getElementById('pdf-embed');

  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const chatMessages = document.getElementById('chat-messages');
  const sendBtn = document.getElementById('send-btn');

  // Ingestion webhook: takes the PDF once, right after upload. The workflow
  // behind it rebuilds a single shared in-memory vector store from this
  // file, so there's no session/document ID to track — one contract loaded
  // at a time is the assumption.
  const INGEST_WEBHOOK_URL = 'https://jyotiv99.app.n8n.cloud/webhook/db9975ee-656e-43f6-b744-3764e1d5ab42';
  // Chat webhook: takes just the typed message, per turn. It answers
  // against whatever contract the ingestion webhook most recently indexed
  // into the shared store.
  const CHAT_WEBHOOK_URL = 'https://jyotiv99.app.n8n.cloud/webhook/d9fcf5d7-7e4a-4682-9e47-21338e063954';

  let currentObjectUrl = null;

  function loadPdf(file) {
    if (!file || file.type !== 'application/pdf') {
      alert('Please upload a PDF file.');
      return;
    }

    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
    }

    currentObjectUrl = URL.createObjectURL(file);
    pdfEmbed.setAttribute('src', currentObjectUrl);

    fileName.textContent = file.name;
    fileInfo.hidden = false;
    pdfPreview.hidden = false;
    uploadArea.hidden = true;

    ingestContract(file);
  }

  // Sends the freshly loaded PDF to the ingestion webhook so it can be
  // indexed into the shared vector store before the user is allowed to
  // chat against it.
  async function ingestContract(file) {
    chatInput.disabled = true;
    sendBtn.disabled = true;

    const statusEl = appendMessage('Indexing contract…', 'assistant', true);

    try {
      const formData = new FormData();
      formData.append('data', file, file.name);

      const response = await fetch(INGEST_WEBHOOK_URL, {
        method: 'POST',
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
      appendMessage(`Could not index contract: ${err.message}`, 'error');
      clearPdf();
    }
  }

  function clearPdf() {
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = null;
    }
    pdfEmbed.setAttribute('src', '');
    fileInfo.hidden = true;
    pdfPreview.hidden = true;
    uploadArea.hidden = false;
    fileInput.value = '';

    chatInput.disabled = true;
    sendBtn.disabled = true;
  }

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    loadPdf(file);
  });

  removeFileBtn.addEventListener('click', clearPdf);

  ['dragenter', 'dragover'].forEach((eventName) => {
    uploadArea.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      uploadArea.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    uploadArea.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      uploadArea.classList.remove('dragover');
    });
  });

  uploadArea.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files[0];
    loadPdf(file);
  });

  function appendMessage(text, role, isStatus = false) {
    const message = document.createElement('div');
    message.className = 'message ' + role;

    const bubble = document.createElement('div');
    bubble.className = isStatus ? 'message-bubble status-bubble' : 'message-bubble';
    bubble.textContent = text;

    message.appendChild(bubble);
    chatMessages.appendChild(message);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return message;
  }

  function extractReplyText(data) {
    if (typeof data === 'string') return data;
    if (Array.isArray(data)) return extractReplyText(data[0]);
    if (data && typeof data === 'object') {
      return (
        data.reply ||
        data.response ||
        data.message ||
        data.output ||
        data.text ||
        JSON.stringify(data)
      );
    }
    return 'Received an empty response from the workflow.';
  }

  async function handleSend(e) {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) {
      return;
    }

    appendMessage(text, 'user');
    chatInput.value = '';
    chatInput.style.height = 'auto';

    const thinkingEl = appendMessage('Thinking…', 'assistant', true);

    try {
      // The PDF itself already went to the ingestion webhook when it was
      // uploaded, so only the typed message is sent here — the chat
      // workflow answers against whatever the shared vector store
      // currently holds. Do not set a Content-Type header: fetch
      // generates the multipart boundary itself when the body is a
      // FormData instance.
      const formData = new FormData();
      formData.append('message', text);

      const response = await fetch(CHAT_WEBHOOK_URL, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Workflow returned ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      const data = contentType.includes('application/json')
        ? await response.json()
        : await response.text();

      thinkingEl.remove();
      appendMessage(extractReplyText(data), 'assistant');
    } catch (err) {
      thinkingEl.remove();
      appendMessage(`Could not reach the workflow: ${err.message}`, 'error');
    }
  }

  chatForm.addEventListener('submit', handleSend);

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  });

  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
  });
})();
