// popup.js - Communicates with background service worker

// DOM elements
const statusDiv = document.getElementById('status');
const statusIcon = document.getElementById('status-icon');
const statusText = document.getElementById('status-text');
const progressFill = document.getElementById('progress-fill');
const inputText = document.getElementById('input-text');
const charCount = document.getElementById('char-count');
const checkBtn = document.getElementById('check-btn');
const resultDiv = document.getElementById('result');
const resultIcon = document.getElementById('result-icon');
const resultText = document.getElementById('result-text');
const resultConfidence = document.getElementById('result-confidence');
const retryBtn = document.getElementById('retry-btn');

let isModelReady = false;

// Initialize on popup open
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🎨 Popup opened');
  
  // Check model status
  await checkModelStatus();
  
  // Setup event listeners
  setupEventListeners();
  
  // Listen for background messages
  chrome.runtime.onMessage.addListener((message) => {
    console.log('📨 Received message:', message.type);
    
    if (message.type === 'MODEL_PROGRESS') {
      updateProgress(message.progress);
    } else if (message.type === 'MODEL_READY') {
      onModelReady();
    } else if (message.type === 'MODEL_ERROR') {
      onModelError(message.error);
    }
  });
});

function setupEventListeners() {
  // Character counter
  inputText.addEventListener('input', () => {
    charCount.textContent = inputText.value.length;
  });

  // Retry button
  retryBtn.addEventListener('click', async () => {
    retryBtn.style.display = 'none';
    statusDiv.className = 'status loading';
    statusIcon.textContent = '⏳';
    statusText.textContent = 'Retrying...';
    
    const response = await chrome.runtime.sendMessage({ type: 'RETRY_LOAD' });
    console.log('Retry initiated:', response);
  });
  
  // Analyze button
  checkBtn.addEventListener('click', async () => {
    const text = inputText.value.trim();
    
    if (!text) {
      showError('Please enter some text to analyze');
      return;
    }
    
    if (text.length < 20) {
      showError('Please enter at least 20 characters for accurate analysis');
      return;
    }
    
    await analyzeText(text);
  });
  
  // Ctrl+Enter shortcut
  inputText.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      checkBtn.click();
    }
  });
}

async function checkModelStatus() {
  try {
    statusDiv.className = 'status loading';
    statusIcon.textContent = '⏳';
    statusText.textContent = 'Checking model status...';
    
    const response = await chrome.runtime.sendMessage({ type: 'CHECK_STATUS' });
    
    console.log('Model status:', response);
    
    if (response.isLoaded) {
      onModelReady();
    } else if (response.isLoading) {
      statusText.textContent = 'Loading model...';
      updateProgress(response.progress);
    } else {
      // Start loading
      statusText.textContent = 'Initializing model...';
      await chrome.runtime.sendMessage({ type: 'INIT_MODEL' });
    }
    
  } catch (error) {
    console.error('Failed to check status:', error);
    onModelError(error.message);
  }
}

function updateProgress(progress) {
  progressFill.style.width = `${progress}%`;
  
  if (progress < 100) {
    statusText.textContent = `Loading model... ${progress}%`;
  } else {
    statusText.textContent = 'Finalizing...';
  }
}

function onModelReady() {
  isModelReady = true;
  statusDiv.className = 'status ready';
  statusIcon.textContent = '✅';
  statusText.textContent = 'Model ready • You can analyze text now';
  progressFill.style.width = '100%';
  checkBtn.disabled = false;
  retryBtn.style.display = 'none';
  
  console.log('✅ Model is ready!');
}

function onModelError(error) {
  isModelReady = false;
  statusDiv.className = 'status error';
  statusIcon.textContent = '❌';
  statusText.textContent = error || 'Failed to load model';
  retryBtn.style.display = 'block';
  checkBtn.disabled = true;
  
  console.error('❌ Model error:', error);
}

async function analyzeText(text) {
  if (!isModelReady) {
    showError('Model not ready yet');
    return;
  }
  
  // Show analyzing state
  checkBtn.disabled = true;
  checkBtn.classList.add('analyzing');
  checkBtn.textContent = 'Analyzing';
  
  statusDiv.className = 'status loading';
  statusIcon.textContent = '🤔';
  statusText.textContent = 'Analyzing text...';
  
  hideResult();
  
  try {
    console.log('🔍 Sending text for classification...');
    
    const response = await chrome.runtime.sendMessage({
      type: 'CLASSIFY_TEXT',
      text: text
    });
    
    if (response.success) {
      showResult(response.result);
      
      // Reset status
      statusDiv.className = 'status ready';
      statusIcon.textContent = '✅';
      statusText.textContent = 'Model ready';
    } else {
      showError(response.error || 'Classification failed');
    }
    
  } catch (error) {
    console.error('Analysis error:', error);
    showError('Analysis failed: ' + error.message);
  } finally {
    checkBtn.disabled = false;
    checkBtn.classList.remove('analyzing');
    checkBtn.textContent = 'Analyze Text';
  }
}

function showError(message) {
  statusDiv.className = 'status error';
  statusIcon.textContent = '❌';
  statusText.textContent = message;
  
  setTimeout(() => {
    if (isModelReady) {
      statusDiv.className = 'status ready';
      statusIcon.textContent = '✅';
      statusText.textContent = 'Model ready';
    }
  }, 3000);
}

function hideResult() {
  resultDiv.classList.remove('show');
}

function showResult(result) {
  const labelMap = {
    'ai_generated': { 
      text: 'AI Generated', 
      icon: '🤖', 
      class: 'ai',
      desc: 'This text shows strong patterns typical of AI generation'
    },
    'human_written': { 
      text: 'Human Written', 
      icon: '🧠', 
      class: 'human',
      desc: 'This text appears to be written by a human'
    },
    'uncertain': { 
      text: 'Uncertain', 
      icon: '⚠️', 
      class: 'uncertain',
      desc: 'Could not determine with high confidence, likely AI-generated'
    }
  };
  
  const display = labelMap[result.label] || labelMap['uncertain'];
  
  resultDiv.className = 'result ' + display.class;
  resultIcon.textContent = display.icon;
  resultText.textContent = display.text;
  resultConfidence.textContent = `${display.desc} • ${result.confidence}% confidence`;
  resultDiv.classList.add('show');
  
  console.log('✅ Result displayed:', result);
}