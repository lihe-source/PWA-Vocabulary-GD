function normalizeVersion(value) {
  return String(value || '').trim().replace(/^V/i, '').replace(/_/g, '.');
}

function compareVersions(a, b) {
  const aa = normalizeVersion(a).split('.').map(n => Number.parseInt(n, 10) || 0);
  const bb = normalizeVersion(b).split('.').map(n => Number.parseInt(n, 10) || 0);
  const len = Math.max(aa.length, bb.length);
  for (let i = 0; i < len; i++) {
    const delta = (aa[i] || 0) - (bb[i] || 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

export class VersionManager {
  constructor({ currentVersion, displayVersion, cachePrefix = 'Voc-PWA-', versionUrl = './version.json', storage }) {
    this.currentVersion = currentVersion;
    this.displayVersion = displayVersion;
    this.cachePrefix = cachePrefix;
    this.versionUrl = versionUrl;
    this.storage = storage;
    this.registration = null;
    this.reloadTriggered = false;
  }

  async register() {
    if (!('serviceWorker' in navigator)) return null;
    try {
      this.registration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (this.reloadTriggered) return;
        this.reloadTriggered = true;
        location.reload();
      });
      return this.registration;
    } catch (error) {
      console.warn('[VersionManager] Service worker registration failed.', error);
      return null;
    }
  }

  getState() {
    return {
      currentVersion: this.currentVersion,
      displayVersion: this.displayVersion,
      latestVersion: this.storage?.getItem('latestKnownVersion') || this.displayVersion,
      lastCheckedAt: this.storage?.getItem('versionLastCheckedAt') || ''
    };
  }

  async check({ autoApply = false } = {}) {
    const response = await fetch(`${this.versionUrl}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`VERSION_HTTP_${response.status}`);
    const data = await response.json();
    const remoteVersion = data.version || data.displayVersion || '';
    const remoteDisplay = data.displayVersion || remoteVersion;
    if (!remoteVersion) throw new Error('VERSION_INVALID');
    const checkedAt = new Date().toISOString();
    this.storage?.setItem('latestKnownVersion', remoteDisplay);
    this.storage?.setItem('versionLastCheckedAt', checkedAt);
    const hasUpdate = compareVersions(remoteVersion, this.currentVersion) > 0;
    const result = { hasUpdate, remoteVersion, remoteDisplay, checkedAt, data };
    if (hasUpdate && autoApply) await this.applyUpdate();
    return result;
  }

  async applyUpdate() {
    if (!('serviceWorker' in navigator)) {
      await this.clearAppCaches();
      location.reload();
      return;
    }
    const reg = this.registration || await navigator.serviceWorker.getRegistration('./') || await this.register();
    if (!reg) {
      await this.clearAppCaches();
      location.reload();
      return;
    }

    await reg.update().catch(() => {});
    const activate = worker => {
      if (!worker) return false;
      worker.postMessage({ type: 'SKIP_WAITING' });
      return true;
    };

    if (activate(reg.waiting)) return;
    if (reg.installing) {
      const installing = reg.installing;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed') activate(reg.waiting || installing);
      });
      return;
    }

    await this.clearAppCaches();
    location.reload();
  }

  async clearAppCaches() {
    if (!('caches' in window)) return;
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(this.cachePrefix)).map(key => caches.delete(key)));
  }
}

export { compareVersions };
