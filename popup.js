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
let startTime = null;
let updateInterval = null;

// Initialize on popup open
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🎨 Popup opened');
  startTime = Date.now();
  
  // Check storage info
  checkStorageInfo();
  
  // Check model status
  await checkModelStatus();
  
  // Setup event listeners
  setupEventListeners();
  
  // Start diagnostic timer
  startDiagnosticTimer();
  
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
  // Debug toggle
  const debugToggle = document.getElementById('debug-toggle');
  if (debugToggle) {
    debugToggle.addEventListener('click', () => {
      const diagnostic = document.getElementById('diagnostic');
      if (diagnostic) {
        diagnostic.classList.toggle('hidden');
      }
    });
  }
  
  // Character counter
  if (inputText) {
    inputText.addEventListener('input', () => {
      if (charCount) {
        charCount.textContent = inputText.value.length;
      }
    });
  }

  // Retry button
  if (retryBtn) {
    retryBtn.addEventListener('click', async () => {
      retryBtn.style.display = 'none';
      statusDiv.className = 'status loading';
      statusIcon.textContent = '⏳';
      statusText.textContent = 'Retrying...';
      startTime = Date.now();
      
      const response = await chrome.runtime.sendMessage({ type: 'RETRY_LOAD' });
      console.log('Retry initiated:', response);
    });
  }
  
  // Analyze button
  if (checkBtn) {
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
  }
  
  // Ctrl+Enter shortcut
  if (inputText) {
    inputText.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter') {
        if (checkBtn) {
          checkBtn.click();
        }
      }
    });
  }
}

async function checkModelStatus() {
  try {
    statusDiv.className = 'status loading';
    statusIcon.textContent = '⏳';
    statusText.textContent = 'Checking model status...';
    
    const response = await chrome.runtime.sendMessage({ type: 'CHECK_STATUS' });
    
    console.log('Model status:', response);
    updateDiagnostics(response);
    
    if (response.isLoaded) {
      onModelReady();
    } else if (response.isLoading) {
      statusText.textContent = 'Model is loading...';
      updateProgress(response.progress);
      
      // Poll for status updates
      pollModelStatus();
    } else {
      // Start loading
      statusText.textContent = 'Initializing model...';
      await chrome.runtime.sendMessage({ type: 'INIT_MODEL' });
      
      // Start polling for updates
      pollModelStatus();
    }
    
  } catch (error) {
    console.error('Failed to check status:', error);
    onModelError(error.message);
  }
}

// Poll for model status updates
let pollInterval = null;
function pollModelStatus() {
  // Clear any existing interval
  if (pollInterval) {
    clearInterval(pollInterval);
  }
  
  console.log('📡 Starting status polling...');
  
  pollInterval = setInterval(async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'CHECK_STATUS' });
      
      updateDiagnostics(response);
      
      if (response.isLoaded) {
        console.log('✅ Polling detected model ready');
        clearInterval(pollInterval);
        pollInterval = null;
        onModelReady();
      } else if (response.isLoading) {
        updateProgress(response.progress);
      }
    } catch (error) {
      console.error('Polling error:', error);
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }, 1000); // Poll every second
  
  // Stop polling after 2 minutes
  setTimeout(() => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
      console.warn('⚠️ Polling timeout');
    }
  }, 120000);
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
  
  // Clear polling if active
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  
  statusDiv.className = 'status ready';
  statusIcon.textContent = '✅';
  statusText.textContent = 'Model ready • Press Ctrl+Enter to analyze';
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
    showError('Model not ready yet, please wait...');
    return;
  }
  
  // Double-check with background before analyzing
  try {
    const status = await chrome.runtime.sendMessage({ type: 'CHECK_STATUS' });
    
    if (!status.isLoaded) {
      showError('Model is still loading. Please wait a moment.');
      
      // Start polling if not already
      if (!pollInterval) {
        pollModelStatus();
      }
      return;
    }
  } catch (error) {
    console.error('Status check failed:', error);
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
      desc: 'This text shows patterns typical of AI generation'
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
      desc: 'Could not determine with high confidence'
    }
  };
  
  const display = labelMap[result.label] || labelMap['uncertain'];
  
  resultDiv.className = 'result ' + display.class;
  resultIcon.textContent = display.icon;
  resultText.textContent = display.text;
  resultConfidence.textContent = display.desc; // Just description, no fake percentage
  resultDiv.classList.add('show');
  
  console.log('✅ Classification result:', result);
}

// Diagnostic functions
function startDiagnosticTimer() {
  updateInterval = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const timeEl = document.getElementById('diag-time');
    if (timeEl) {
      timeEl.textContent = `${elapsed}s`;
    }
  }, 100);
}

async function checkStorageInfo() {
  try {
    const estimate = await navigator.storage.estimate();
    const usedMB = (estimate.usage / (1024 * 1024)).toFixed(0);
    
    const cacheEl = document.getElementById('diag-cache');
    if (cacheEl) {
      if (usedMB > 300) {
        cacheEl.textContent = `${usedMB} MB (cached)`;
      } else {
        cacheEl.textContent = 'not cached';
      }
    }
  } catch (e) {
    const cacheEl = document.getElementById('diag-cache');
    if (cacheEl) {
      cacheEl.textContent = 'unknown';
    }
  }
}

function updateDiagnostics(status) {
  const diagStatus = document.getElementById('diag-status');
  const diagLoaded = document.getElementById('diag-loaded');
  const diagLoading = document.getElementById('diag-loading');
  const diagProgress = document.getElementById('diag-progress');
  
  if (diagStatus) {
    diagStatus.textContent = status.isLoaded ? 'ready' : status.isLoading ? 'loading' : 'waiting';
  }
  if (diagLoaded) {
    diagLoaded.textContent = status.isLoaded ? 'true' : 'false';
  }
  if (diagLoading) {
    diagLoading.textContent = status.isLoading ? 'true' : 'false';
  }
  if (diagProgress) {
    diagProgress.textContent = `${status.progress || 0}%`;
  }
}