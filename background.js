// background.js - Manages offscreen document with direct communication
console.log('🔧 Background service worker starting...');

let isModelLoaded = false;
let isLoading = false;
let loadingProgress = 0;
let offscreenReady = false;

// Create offscreen document
async function createOffscreenDocument() {
  // Check if offscreen document already exists
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
  });

  if (existingContexts.length > 0) {
    console.log('⏩ Offscreen document already exists');
    offscreenReady = true;
    return;
  }

  console.log('📄 Creating offscreen document...');

  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['WORKERS'],
    justification: 'Load and run AI model with WebAssembly'
  });

  offscreenReady = true;
  console.log('✅ Offscreen document created');
}

// Send message to offscreen with retry
async function sendToOffscreen(message, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      // Ensure offscreen exists
      if (!offscreenReady) {
        await createOffscreenDocument();
        await new Promise(r => setTimeout(r, 100)); // Wait for it to initialize
      }

      const response = await chrome.runtime.sendMessage(message);
      return response;
    } catch (error) {
      console.warn(`⚠️ Attempt ${i + 1} failed:`, error.message);
      
      if (i === retries - 1) {
        throw error;
      }
      
      // Wait before retry
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

// Initialize on install
chrome.runtime.onInstalled.addListener(async () => {
  console.log('📦 Extension installed');
  await initializeModel();
});

// Initialize on startup
chrome.runtime.onStartup.addListener(async () => {
  console.log('🚀 Browser started');
  await initializeModel();
});

// Initialize model
async function initializeModel() {
  if (isLoading || isModelLoaded) {
    console.log('⏩ Already loading or loaded');
    return;
  }

  try {
    isLoading = true;

    // Create offscreen document
    await createOffscreenDocument();

    // Wait a bit for offscreen to initialize
    await new Promise(r => setTimeout(r, 200));

    // Tell offscreen to load model
    console.log('📨 Requesting model load from offscreen...');
    
    const response = await sendToOffscreen({
      type: 'LOAD_MODEL'
    });

    if (response && response.success) {
      isModelLoaded = true;
      loadingProgress = 100;
      console.log('✅ Model initialization complete!');
    } else {
      throw new Error(response?.error || 'Failed to load model');
    }

  } catch (error) {
    console.error('❌ Initialization failed:', error);
    isModelLoaded = false;
    offscreenReady = false;
  } finally {
    isLoading = false;
  }
}

// Handle messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Identify sender
  const senderType = sender.url?.includes('offscreen.html') ? 'offscreen' : 
                     sender.url?.includes('popup.html') ? 'popup' : 'unknown';
  
  console.log(`📨 Message from ${senderType}:`, request.type);

  // Messages FROM offscreen (broadcast to popup)
  if (senderType === 'offscreen') {
    if (request.type === 'MODEL_PROGRESS') {
      loadingProgress = request.progress;
      // Broadcast to all extension contexts
      chrome.runtime.sendMessage(request).catch(() => {});
      return false;
    }

    if (request.type === 'MODEL_READY') {
      isModelLoaded = true;
      loadingProgress = 100;
      chrome.runtime.sendMessage(request).catch(() => {});
      return false;
    }

    if (request.type === 'MODEL_ERROR') {
      isModelLoaded = false;
      chrome.runtime.sendMessage(request).catch(() => {});
      return false;
    }
  }

  // Messages FROM popup
  if (senderType === 'popup') {
    // Check status
    if (request.type === 'CHECK_STATUS') {
      sendResponse({
        isLoaded: isModelLoaded,
        isLoading: isLoading,
        progress: loadingProgress
      });
      return false;
    }

    // Initialize model
    if (request.type === 'INIT_MODEL') {
      if (!isLoading && !isModelLoaded) {
        initializeModel();
      }
      sendResponse({
        isLoaded: isModelLoaded,
        isLoading: isLoading,
        progress: loadingProgress
      });
      return false;
    }

    // Classify text - forward to offscreen
    if (request.type === 'CLASSIFY_TEXT') {
      if (!isModelLoaded) {
        console.warn('⚠️ Model not ready yet');
        sendResponse({
          success: false,
          error: 'Model not ready yet. Please wait.'
        });
        return false;
      }

      console.log('🔄 Forwarding classification request to offscreen...');

      // Forward to offscreen
      sendToOffscreen(request)
        .then(response => {
          console.log('✅ Got response from offscreen');
          sendResponse(response);
        })
        .catch(error => {
          console.error('❌ Failed to communicate with offscreen:', error);
          sendResponse({
            success: false,
            error: 'Failed to communicate with model: ' + error.message
          });
        });

      return true; // Keep channel open
    }

    // Retry loading
    if (request.type === 'RETRY_LOAD') {
      isModelLoaded = false;
      isLoading = false;
      offscreenReady = false;
      initializeModel();
      sendResponse({ success: true });
      return false;
    }
  }

  return false;
});

console.log('✅ Background service worker ready');