// background.js - Manages offscreen document with direct communication
console.log('🔧 Background service worker starting...');

let isModelLoaded = false;
let isLoading = false;
let loadingProgress = 0;
let offscreenReady = false;
let initializationPromise = null; // Track ongoing initialization

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

// Initialize immediately when service worker starts
(async () => {
  console.log('🔄 Service worker started, initializing model...');
  try {
    await initializeModel();
  } catch (error) {
    console.error('❌ Auto-initialization failed:', error);
  }
})();

// Initialize on install (but check if already initializing)
chrome.runtime.onInstalled.addListener(async () => {
  console.log('📦 Extension installed');
  if (!isModelLoaded && !isLoading) {
    try {
      await initializeModel();
    } catch (error) {
      console.error('❌ Install initialization failed:', error);
    }
  }
});

// Initialize on startup (but check if already initializing)
chrome.runtime.onStartup.addListener(async () => {
  console.log('🚀 Browser started');
  if (!isModelLoaded && !isLoading) {
    try {
      await initializeModel();
    } catch (error) {
      console.error('❌ Startup initialization failed:', error);
    }
  }
});

// Initialize model
async function initializeModel() {
  // If already loaded, return immediately
  if (isModelLoaded) {
    console.log('⏩ Model already loaded');
    return initializationPromise || Promise.resolve();
  }
  
  // If already loading, return the existing promise
  if (isLoading && initializationPromise) {
    console.log('⏩ Already loading, waiting for existing initialization...');
    return initializationPromise;
  }

  // Start new initialization
  isLoading = true;
  console.log('🔄 Starting model initialization...');

  initializationPromise = (async () => {
    try {
      // Create offscreen document
      await createOffscreenDocument();

      // Wait a bit for offscreen to initialize
      await new Promise(r => setTimeout(r, 500));

      // Tell offscreen to load model
      console.log('📨 Requesting model load from offscreen...');
      
      let response;
      try {
        response = await sendToOffscreen({
          type: 'LOAD_MODEL'
        });
      } catch (sendError) {
        // If offscreen is already loading, that's actually OK
        if (sendError.message && sendError.message.includes('Already loading')) {
          console.log('⏩ Offscreen already loading, waiting...');
          // Wait a bit and check status
          await new Promise(r => setTimeout(r, 1000));
          const statusCheck = await sendToOffscreen({ type: 'CHECK_STATUS' });
          if (statusCheck && statusCheck.isLoaded) {
            response = { success: true };
          } else {
            throw new Error('Model still loading in offscreen');
          }
        } else {
          throw sendError;
        }
      }

      if (response && response.success) {
        isModelLoaded = true;
        loadingProgress = 100;
        console.log('✅ Model initialization complete!');
        
        // Broadcast to any listening contexts
        chrome.runtime.sendMessage({
          type: 'MODEL_READY'
        }).catch(() => {});
      } else {
        throw new Error(response?.error || 'Failed to load model');
      }

    } catch (error) {
      console.error('❌ Initialization failed:', error);
      isModelLoaded = false;
      offscreenReady = false;
      
      // Broadcast error
      chrome.runtime.sendMessage({
        type: 'MODEL_ERROR',
        error: error.message
      }).catch(() => {});
      
      throw error;
    } finally {
      isLoading = false;
      // Don't clear initializationPromise here, keep it for future calls
    }
  })();

  return initializationPromise;
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
      if (!isModelLoaded && !isLoading) {
        initializeModel().catch(err => {
          console.error('Init error:', err);
        });
      }
      sendResponse({
        isLoaded: isModelLoaded,
        isLoading: isLoading,
        progress: loadingProgress
      });
      return false;
    }

    // Classify text - forward to offscreen (ASYNC HANDLER)
    if (request.type === 'CLASSIFY_TEXT') {
      console.log('🔄 Classification request received');
      
      // Handle async logic
      (async () => {
        try {
          // Double-check model is loaded
          if (!isModelLoaded) {
            console.warn('⚠️ Model not ready in background, checking offscreen...');
            
            // Query offscreen directly
            const offscreenStatus = await sendToOffscreen({ type: 'CHECK_STATUS' });
            
            if (offscreenStatus && offscreenStatus.isLoaded) {
              console.log('✅ Offscreen reports model is loaded, updating status');
              isModelLoaded = true;
              // Continue with classification
            } else {
              sendResponse({
                success: false,
                error: 'Model not ready yet. Please wait for initialization to complete.'
              });
              return;
            }
          }

          console.log('🔄 Forwarding classification request to offscreen...');

          // Forward to offscreen
          const response = await sendToOffscreen(request);
          console.log('✅ Got response from offscreen');
          sendResponse(response);
          
        } catch (error) {
          console.error('❌ Failed to communicate with offscreen:', error);
          sendResponse({
            success: false,
            error: 'Failed to communicate with model: ' + error.message
          });
        }
      })();

      return true; // Keep channel open for async response
    }

    // Retry loading
    if (request.type === 'RETRY_LOAD') {
      console.log('🔄 Retry requested, resetting state...');
      isModelLoaded = false;
      isLoading = false;
      offscreenReady = false;
      initializationPromise = null; // Clear the promise
      
      initializeModel().catch(err => {
        console.error('Retry error:', err);
      });
      
      sendResponse({ success: true });
      return false;
    }
  }

  return false;
});

console.log('✅ Background service worker ready');