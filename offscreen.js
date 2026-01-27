// offscreen.js - Runs Wllama in a hidden document context
import { Wllama } from './wllama/esm/index.js';

const CONFIG_PATHS = {
  'single-thread/wllama.wasm': chrome.runtime.getURL('wllama/esm/single-thread/wllama.wasm'),
  'multi-thread/wllama.wasm': chrome.runtime.getURL('wllama/esm/multi-thread/wllama.wasm'),
  'multi-thread/wllama.worker.mjs': chrome.runtime.getURL('wllama/esm/multi-thread/wllama.worker.mjs'),
};

const MODEL_URL = 'https://huggingface.co/Priyansu19/ai-slop-gemma-fp32_gguf/resolve/main/model-q4.gguf';

let wllama = null;
let isModelLoaded = false;
let isLoading = false;

console.log('🎬 Offscreen document started');

// Listen for messages from background.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Offscreen received:', request.type);

  if (request.type === 'LOAD_MODEL') {
    if (isModelLoaded) {
      sendResponse({ success: true, loaded: true });
      return false;
    }

    if (isLoading) {
      sendResponse({ success: false, error: 'Already loading' });
      return false;
    }

    loadModel()
      .then(() => {
        sendResponse({ success: true, loaded: true });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Async response
  }

  if (request.type === 'CLASSIFY_TEXT') {
    console.log('🎯 Classification request received');
    
    if (!isModelLoaded) {
      console.error('❌ Model not loaded in offscreen');
      sendResponse({ success: false, error: 'Model not loaded in offscreen' });
      return false;
    }

    classifyText(request.text)
      .then(result => {
        console.log('✅ Classification complete:', result.label);
        sendResponse({ success: true, result });
      })
      .catch(error => {
        console.error('❌ Classification error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Async response
  }

  if (request.type === 'CHECK_STATUS') {
    sendResponse({ 
      isLoaded: isModelLoaded,
      isLoading: isLoading
    });
    return false;
  }

  return false;
});

async function loadModel() {
  if (isModelLoaded || isLoading) {
    console.log('⏩ Model already loaded or loading');
    return;
  }

  isLoading = true;
  const startTime = Date.now();

  try {
    console.log('🦙 Initializing Wllama in offscreen...');
    console.log('⏰ Start time:', new Date().toLocaleTimeString());
    
    wllama = new Wllama(CONFIG_PATHS, {
      logger: {
        debug: () => {},
        log: (...args) => console.log('🦙', ...args),
        warn: (...args) => {
          const msg = args.join(' ');
          const ignore = ['special_eos_id', 'munmap failed', 'n_ctx_seq', 'n_ctx_train', 'llama_kv_cache'];
          if (!ignore.some(w => msg.includes(w))) {
            console.warn('⚠️', ...args);
          }
        },
        error: (...args) => console.error('❌', ...args),
      }
    });

    console.log('📥 Loading model:', MODEL_URL);
    console.log('💾 Size: ~253 MB (cached after first download)');

    let lastProgress = 0;
    await wllama.loadModelFromUrl(MODEL_URL, {
      n_ctx: 2048,
      n_threads: navigator.hardwareConcurrency || 4,
      progressCallback: ({ loaded, total }) => {
        if (total && total > 0) {
          const progress = Math.min(Math.round((loaded / total) * 100), 99);
          
          // Only log every 10% to reduce spam
          if (progress >= lastProgress + 10) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`📊 Progress: ${progress}% (${elapsed}s elapsed)`);
            lastProgress = progress;
          }
          
          // Send progress to background
          chrome.runtime.sendMessage({
            type: 'MODEL_PROGRESS',
            progress: progress
          }).catch(() => {});
        }
      }
    });

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    isModelLoaded = true;
    console.log(`✅ Model loaded in offscreen! Total time: ${totalTime}s`);

    // Notify background
    chrome.runtime.sendMessage({
      type: 'MODEL_READY'
    }).catch(() => {});

  } catch (error) {
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`❌ Model loading failed after ${totalTime}s:`, error);
    isModelLoaded = false;
    
    chrome.runtime.sendMessage({
      type: 'MODEL_ERROR',
      error: error.message
    }).catch(() => {});
    
    throw error;
  } finally {
    isLoading = false;
  }
}

async function classifyText(text) {
  if (!isModelLoaded || !wllama) {
    throw new Error('Model not loaded');
  }

  const truncatedText = text.slice(0, 1500);
  console.log('🔍 Classifying text (length:', truncatedText.length, ')');

  const prompt = `<start_of_turn>user
Classify this text as exactly 'ai_generated' or 'human_written':

"${truncatedText}"

<end_of_turn>
<start_of_turn>model
`;

  const output = await wllama.createCompletion(prompt, {
    nPredict: 10,
    sampling: {
      temp: 0.0,
      top_k: 1,
      top_p: 1.0,
    },
    stop: ['\n', '<end_of_turn>', '<start_of_turn>'],
  });

  console.log('📝 Raw output:', JSON.stringify(output));

  const normalized = output.toLowerCase().trim();

  if (normalized.includes('ai_generated') || normalized.startsWith('ai')) {
    return { label: 'ai_generated', confidence: 95, raw: output };
  } else if (normalized.includes('human_written') || normalized.startsWith('human')) {
    return { label: 'human_written', confidence: 90, raw: output };
  } else {
    return { label: 'uncertain', confidence: 60, raw: output };
  }
}

console.log('✅ Offscreen ready');