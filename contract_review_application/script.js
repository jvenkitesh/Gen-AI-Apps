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
  const downloadResponsesBtn = document.getElementById('download-responses-btn');

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

  const REPLY_KEYS = ['reply', 'response', 'message', 'output', 'text'];

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  // AI Agent nodes usually hand back JSON as a *string*, often wrapped in
  // a ```json fence and sometimes with prose around it. Returns
  // { note, json } when a JSON object/array can be pulled out, else null.
  function parseJsonFromText(text) {
    const trimmed = text.trim();
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fence ? fence[1].trim() : trimmed;
    if (!/^[[{]/.test(candidate)) return null;
    try {
      const json = JSON.parse(candidate);
      if (json === null || typeof json !== 'object') return null;
      const note = fence ? trimmed.replace(fence[0], '').trim() : '';
      return { note, json };
    } catch (err) {
      return null;
    }
  }

  // Normalises whatever the chat workflow returned into either
  // { text } for a plain answer or { note, dataset } for JSON data.
  function resolveReply(data, note = '') {
    if (data === null || data === undefined || data === '') {
      return { text: 'Received an empty response from the workflow.' };
    }

    if (typeof data === 'string') {
      const parsed = parseJsonFromText(data);
      return parsed ? resolveReply(parsed.json, parsed.note) : { text: data };
    }

    // n8n's Respond to Webhook commonly wraps the answer as
    // [{ output: ... }] or { output: ... } — unwrap that envelope, but
    // leave genuine datasets (arrays of records) alone.
    let envelope = data;
    if (Array.isArray(data) && data.length === 1 && isPlainObject(data[0])) {
      envelope = data[0];
    }
    if (isPlainObject(envelope)) {
      const keys = Object.keys(envelope);
      const replyKey = REPLY_KEYS.find((k) => k in envelope);
      if (replyKey && keys.length === 1) {
        const inner = envelope[replyKey];
        if (typeof inner === 'string') {
          const parsed = parseJsonFromText(inner);
          return parsed ? { note: parsed.note, dataset: parsed.json } : { text: inner };
        }
        return resolveReply(inner);
      }
    }

    return { note, dataset: data };
  }

  // Finds the list of records to show as a table: the dataset itself if
  // it's an array of objects, otherwise the first property holding one
  // (e.g. { clauses: [...] }). A single flat object becomes a one-row table.
  function findRows(dataset) {
    const isRecordList = (v) => Array.isArray(v) && v.length > 0 && v.every(isPlainObject);
    if (isRecordList(dataset)) return { rows: dataset, label: '' };
    if (isPlainObject(dataset)) {
      const key = Object.keys(dataset).find((k) => isRecordList(dataset[k]));
      if (key) return { rows: dataset[key], label: key };
      const values = Object.values(dataset);
      if (values.length && values.every((v) => v === null || typeof v !== 'object')) {
        return { rows: [dataset], label: '' };
      }
    }
    return null;
  }

  function collectColumns(rows) {
    const columns = [];
    rows.forEach((row) => {
      Object.keys(row).forEach((key) => {
        if (!columns.includes(key)) columns.push(key);
      });
    });
    return columns;
  }

  function formatCell(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  function toCsv(rows, columns) {
    const escape = (value) => {
      const text = formatCell(value);
      return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
    };
    const lines = [columns.map(escape).join(',')];
    rows.forEach((row) => lines.push(columns.map((c) => escape(row[c])).join(',')));
    return lines.join('\r\n');
  }

  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function datasetFilename(extension) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `contract-dataset-${stamp}.${extension}`;
  }

  function makeDownloadButton(label, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'download-btn';
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
  }

  function appendDataset(dataset, note) {
    const message = document.createElement('div');
    message.className = 'message assistant';

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble dataset-bubble';

    if (note) {
      const noteEl = document.createElement('div');
      noteEl.className = 'dataset-note';
      noteEl.textContent = note;
      bubble.appendChild(noteEl);
    }

    const table = findRows(dataset);
    const actions = document.createElement('div');
    actions.className = 'dataset-actions';

    if (table) {
      const columns = collectColumns(table.rows);

      const meta = document.createElement('div');
      meta.className = 'dataset-meta';
      meta.textContent =
        `${table.label ? table.label + ' · ' : ''}${table.rows.length} ` +
        `row${table.rows.length === 1 ? '' : 's'} × ${columns.length} ` +
        `column${columns.length === 1 ? '' : 's'}`;
      bubble.appendChild(meta);

      const wrap = document.createElement('div');
      wrap.className = 'dataset-table-wrap';
      const tableEl = document.createElement('table');
      tableEl.className = 'dataset-table';

      const headRow = tableEl.createTHead().insertRow();
      columns.forEach((col) => {
        const th = document.createElement('th');
        th.textContent = col;
        headRow.appendChild(th);
      });

      const body = tableEl.createTBody();
      table.rows.forEach((row) => {
        const tr = body.insertRow();
        columns.forEach((col) => {
          tr.insertCell().textContent = formatCell(row[col]);
        });
      });

      wrap.appendChild(tableEl);
      bubble.appendChild(wrap);

      actions.appendChild(
        makeDownloadButton('Download CSV', () => {
          // Leading BOM so Excel opens UTF-8 text correctly.
          downloadFile('﻿' + toCsv(table.rows, columns), datasetFilename('csv'), 'text/csv;charset=utf-8');
        })
      );
    } else {
      const pre = document.createElement('pre');
      pre.className = 'dataset-json';
      pre.textContent = JSON.stringify(dataset, null, 2);
      bubble.appendChild(pre);
    }

    // JSON download always exports the full payload, not just the rows
    // shown in the table.
    actions.insertBefore(
      makeDownloadButton('Download JSON', () => {
        downloadFile(JSON.stringify(dataset, null, 2), datasetFilename('json'), 'application/json');
      }),
      actions.firstChild
    );
    bubble.appendChild(actions);

    message.appendChild(bubble);
    chatMessages.appendChild(message);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return message;
  }

  // Successful question/response pairs are kept in the browser's
  // localStorage (no backend) and exported as config.json on demand.
  const RESPONSES_STORAGE_KEY = 'contractReviewResponses';

  function loadSavedResponses() {
    try {
      const saved = JSON.parse(localStorage.getItem(RESPONSES_STORAGE_KEY));
      return Array.isArray(saved) ? saved : [];
    } catch (err) {
      return [];
    }
  }

  // The AI Agent may return a structured answer ({ response, citation,
  // reasoning }) as JSON or as a JSON string, possibly wrapped in n8n's
  // { output: ... } envelope.
  function findStructuredReply(data) {
    if (typeof data === 'string') {
      const parsed = parseJsonFromText(data);
      return parsed ? findStructuredReply(parsed.json) : null;
    }
    if (Array.isArray(data)) return findStructuredReply(data[0]);
    if (isPlainObject(data)) {
      if ('citation' in data || 'citations' in data || 'reasoning' in data) {
        return data;
      }
      const replyKey = REPLY_KEYS.find((k) => k in data);
      return replyKey ? findStructuredReply(data[replyKey]) : null;
    }
    return null;
  }

  function saveResponse(question, data, reply) {
    const structured = findStructuredReply(data) || {};
    const answer = structured.response ?? structured.answer ?? structured.reply ?? structured.output;
    const citation = structured.citation ?? structured.citations ?? [];

    const entries = loadSavedResponses();
    entries.push({
      question,
      response: answer !== undefined ? answer : reply.dataset !== undefined ? reply.dataset : reply.text,
      citation: Array.isArray(citation) ? citation : [citation],
      reasoning: typeof structured.reasoning === 'string' ? structured.reasoning : '',
    });

    try {
      localStorage.setItem(RESPONSES_STORAGE_KEY, JSON.stringify(entries));
      downloadResponsesBtn.hidden = false;
    } catch (err) {
      console.error('Could not save response to localStorage:', err);
    }
  }

  downloadResponsesBtn.hidden = loadSavedResponses().length === 0;
  downloadResponsesBtn.addEventListener('click', () => {
    downloadFile(JSON.stringify(loadSavedResponses(), null, 2), 'config.json', 'application/json');
  });

  async function handleSend(e) {
    if (e) e.preventDefault();
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
      const reply = resolveReply(data);
      if (reply.dataset !== undefined) {
        appendDataset(reply.dataset, reply.note);
      } else {
        appendMessage(reply.text, 'assistant');
      }
      saveResponse(text, data, reply);
    } catch (err) {
      thinkingEl.remove();
      appendMessage(`Could not reach the workflow: ${err.message}`, 'error');
    }
  }

  // Send is a plain button with a click handler (not native form submit)
  // so it still works inside sandboxed preview iframes; the submit
  // listener just stops any stray native submission from reloading.
  sendBtn.addEventListener('click', handleSend);
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
