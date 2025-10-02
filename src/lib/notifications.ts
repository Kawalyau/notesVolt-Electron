// src/lib/notifications.ts

// Since this app uses an older Electron pattern with nodeIntegration: true,
// we can directly access Electron's IPC renderer.
// A modern approach would use a preload script and contextBridge.

// Helper to check if running in Electron
const isElectron = () => {
  // Renderer process
  if (typeof window !== 'undefined' && typeof window.process === 'object' && (window.process as any).type === 'renderer') {
    return true;
  }
  // Main process
  if (typeof process !== 'undefined' && typeof process.versions === 'object' && !!(process.versions as any).electron) {
    return true;
  }
  // Detect the user agent when nodeIntegration is set to true
  if (typeof navigator === 'object' && typeof navigator.userAgent === 'string' && navigator.userAgent.indexOf('Electron') >= 0) {
    return true;
  }
  return false;
};

/**
 * Shows a native system notification if the app is running in Electron.
 * @param title The title of the notification.
 * @param body The body text of the notification.
 */
export function showNotification(title: string, body: string) {
  if (isElectron()) {
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.send('show-notification', { title, body });
  } else {
    // Optional: Fallback for web browsers, though we are focusing on Electron.
    // Could use the browser's Notification API here if permissions are granted.
    console.log(`Notification (web fallback): ${title} - ${body}`);
  }
}
