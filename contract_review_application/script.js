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

  function appendMessage(text, role) {
    const message = document.createElement('div');
    message.className = 'message ' + role;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = text;

    message.appendChild(bubble);
    chatMessages.appendChild(message);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function handleSend(e) {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) {
      return;
    }

    appendMessage(text, 'user');
    chatInput.value = '';
    chatInput.style.height = 'auto';

    appendMessage('This is a simulated response. AI integration coming soon.', 'assistant');
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
