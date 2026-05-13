// Shared notification sound preferences (localStorage-backed)

const SOUND_KEY = "notifications.sound";
const VOLUME_KEY = "notifications.volume";

export const DEFAULT_SOUND_ENABLED = true;
export const DEFAULT_VOLUME = 0.5;

export function getSoundEnabled(): boolean {
  try {
    const raw = localStorage.getItem(SOUND_KEY);
    if (raw === null) return DEFAULT_SOUND_ENABLED;
    return raw === "true";
  } catch {
    return DEFAULT_SOUND_ENABLED;
  }
}

export function setSoundEnabled(enabled: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, String(enabled));
    window.dispatchEvent(new CustomEvent("notification-prefs-changed"));
  } catch {
    /* noop */
  }
}

export function getVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    if (raw === null) return DEFAULT_VOLUME;
    const n = Number(raw);
    if (!Number.isFinite(n)) return DEFAULT_VOLUME;
    return Math.max(0, Math.min(1, n));
  } catch {
    return DEFAULT_VOLUME;
  }
}

export function setVolume(volume: number) {
  const v = Math.max(0, Math.min(1, volume));
  try {
    localStorage.setItem(VOLUME_KEY, String(v));
    window.dispatchEvent(new CustomEvent("notification-prefs-changed"));
  } catch {
    /* noop */
  }
}
