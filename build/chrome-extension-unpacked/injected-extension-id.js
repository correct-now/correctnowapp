(function () {
  try {
    var script = document.currentScript;
    var extensionId = script && script.dataset ? script.dataset.extensionId : '';
    if (!extensionId) return;

    window.__CORRECTNOW_EXTENSION_ID = extensionId;
    document.__CORRECTNOW_EXTENSION_ID = extensionId;

    try {
      var event = new CustomEvent('correctnow-extension-ready', {
        detail: { extensionId: extensionId },
        bubbles: true,
      });
      window.dispatchEvent(event);
    } catch (_err) {
      // Ignore event dispatch errors
    }

    // Respond to explicit page requests as fallback bridge.
    window.addEventListener('message', function (event) {
      if (event && event.data && event.data.type === 'REQUEST_EXTENSION_ID') {
        window.postMessage({
          type: 'EXTENSION_ID_RESPONSE',
          extensionId: extensionId,
        }, '*');
      }
    });
  } catch (err) {
    console.error('[CorrectNow Extension] injected-extension-id.js failed:', err);
  }
})();
