// popup.js - Enhanced UI version
import { Wllama } from './wllama/esm/index.js';

const CONFIG_PATHS = {
  'single-thread/wllama.wasm': chrome.runtime.getURL('wllama/esm/single-thread/wllama.wasm'),
  'multi-thread/wllama.wasm': chrome.runtime.getURL('wllama/esm/multi-thread/wllama.wasm'),
  'multi-thread/wllama.worker.mjs': chrome.runtime.getURL('wllama/esm/multi-thread/wllama.worker.mjs'),
};

let wllama = null;
let isModelLoaded = false;

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

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initWllama();
  
  // Character counter
  inputText.addEventListener('input', () => {
    charCount.textContent = inputText.value.length;
  });
  
  // Analyze button
  checkBtn.addEventListener('click', async () => {
    const text = inputText.value.trim();
    if (!text) {
      showError('Please enter some text to analyze');
      return;
    }
    
    if (text.length < 10) {
      showError('Please enter at least 10 characters for accurate analysis');
      return;
    }
    
    setAnalyzingState(true);
    hideResult();
    
    try {
      const result = await classifyText(text);
      showResult(result);
    } catch (error) {
      console.error('Classification error:', error);
      showError('Analysis failed: ' + error.message);
    }
    
    setAnalyzingState(false);
  });
});

function showError(message) {
  statusDiv.className = 'status error';
  statusIcon.textContent = '❌';
  statusText.textContent = message;
  setTimeout(() => {
    if (isModelLoaded) {
      statusDiv.className = 'status ready';
      statusIcon.textContent = '✅';
      statusText.textContent = 'Model ready';
    }
  }, 3000);
}

function setAnalyzingState(analyzing) {
  checkBtn.disabled = analyzing || !isModelLoaded;
  if (analyzing) {
    checkBtn.classList.add('analyzing');
    statusDiv.className = 'status loading';
    statusIcon.textContent = '🤔';
    statusText.textContent = 'Analyzing...';
  } else {
    checkBtn.classList.remove('analyzing');
    if (isModelLoaded) {
      statusDiv.className = 'status ready';
      statusIcon.textContent = '✅';
      statusText.textContent = 'Model ready';
    }
  }
}

function hideResult() {
  resultDiv.classList.remove('show');
}

async function initWllama() {
  try {
    console.log('🦙 Initializing wllama...');
    
    wllama = new Wllama(CONFIG_PATHS, {
      logger: {
        debug: () => {},
        log: (...args) => console.log('🦙', ...args),
        warn: (...args) => {
          const msg = args.join(' ');
          const ignore = ['special_eos_id', 'munmap failed', 'n_ctx_seq', 'n_ctx_train', 'llama_kv_cache_iswa'];
          if (!ignore.some(w => msg.includes(w))) {
            console.warn('⚠️', ...args);
          }
        },
        error: (...args) => console.error('❌', ...args),
      }
    });
    
    await loadModel();
  } catch (error) {
    console.error('Initialization error:', error);
    statusDiv.className = 'status error';
    statusIcon.textContent = '❌';
    statusText.textContent = 'Failed to initialize';
  }
}

async function loadModel() {
  if (isModelLoaded) return;
  
  console.log('⏳ Loading model from HuggingFace...');
  statusText.textContent = 'Downloading model (253 MB)...';
  
  const modelUrl = 'https://huggingface.co/Priyansu19/ai-slop-gemma-fp32_gguf/resolve/main/model-q4.gguf';
  
  try {
    await wllama.loadModelFromUrl(modelUrl, {
      n_ctx: 4096,
      n_threads: 4,
      progressCallback: ({ loaded, total }) => {
        let progress = 0;
        if (total && total > 0 && isFinite(total)) {
          progress = Math.round((loaded / total) * 100);
        } else {
          progress = Math.min(Math.round(loaded / 1000000), 99);
        }
        progress = isNaN(progress) ? 99 : progress;
        progressFill.style.width = `${progress}%`;
        
        if (progress < 100) {
          statusText.textContent = `Downloading model... ${progress}%`;
        } else {
          statusText.textContent = 'Loading into memory...';
        }
        
        console.log(`📊 Loading: ${progress}%`);
      }
    });
    
    isModelLoaded = true;
    statusDiv.className = 'status ready';
    statusIcon.textContent = '✅';
    statusText.textContent = 'Model ready';
    checkBtn.disabled = false;
    console.log('✅ Model loaded!');
    
  } catch (error) {
    console.error('❌ Failed to load model:', error);
    statusDiv.className = 'status error';
    statusIcon.textContent = '❌';
    statusText.textContent = 'Failed to load model';
    throw error;
  }
}

async function classifyText(text) {
  if (!isModelLoaded) {
    throw new Error('Model not loaded');
  }
  
  console.log('🔍 Classifying:', text.substring(0, 50) + '...');
  
  const prompt = `<start_of_turn>user
Classify this text as exactly 'ai_generated' or 'human_written':

"${text}"

<end_of_turn>
<start_of_turn>model
`;

  const output = await wllama.createCompletion(prompt, {
    nPredict: 5,
    sampling: {
      temp: 0.0,
      top_k: 1,
      top_p: 1.0,
    },
    stop: ['\n', ' ', '<end_of_turn>', '<start_of_turn>'],
  });
  
  console.log('📝 Raw output:', JSON.stringify(output));
  
  const result = output.toLowerCase().trim();
  
  if (result.includes('ai_generated') || result.startsWith('ai')) {
    return { label: 'ai_generated', confidence: 95, raw: output };
  } else if (result.includes('human_written') || result.startsWith('human')) {
    return { label: 'human_written', confidence: 95, raw: output };
  } else {
    return { label: 'uncertain', confidence: 50, raw: output };
  }
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
      text: 'Probably AI-written', 
      icon: '⚠️', 
      class: 'uncertain',
      desc: 'Could not determine with high confidence'
    }
  };
  
  const display = labelMap[result.label] || labelMap['uncertain'];
  
  resultDiv.className = 'result ' + display.class;
  resultIcon.textContent = display.icon;
  resultText.textContent = display.text;
  resultConfidence.textContent = `${display.desc} • ${result.confidence}% confidence`;
  resultDiv.classList.add('show');
  
  console.log('✅ Result:', result);
}