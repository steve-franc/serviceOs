import { useCallback, useEffect, useRef } from "react";
import { Howl } from "howler";

export type SoundType = "success" | "error" | "info" | "warning";

const SOUND_FILES: Record<SoundType, string> = {
  success: "/sounds/success.mp3",
  error: "/sounds/error.mp3",
  info: "/sounds/notification.mp3",
  warning: "/sounds/warning.mp3",
};

// Module-level cache so sounds are initialized once across the app
const cache: Partial<Record<SoundType, Howl>> = {};

function getSound(type: SoundType): Howl {
  let s = cache[type];
  if (!s) {
    s = new Howl({
      src: [SOUND_FILES[type]],
      preload: "metadata" as unknown as boolean, // load lazily; Howler accepts boolean but we hint metadata
      html5: true,
      volume: 0.5,
    });
    cache[type] = s;
  }
  return s;
}

const clamp = (v: number) => Math.max(0, Math.min(1, v));

export function useSoundNotification() {
  // Warm up references on mount (does not download full audio when html5+preload)
  const warmedRef = useRef(false);
  useEffect(() => {
    if (warmedRef.current) return;
    warmedRef.current = true;
    (Object.keys(SOUND_FILES) as SoundType[]).forEach((t) => getSound(t));
  }, []);

  const play = useCallback((type: SoundType, volume = 0.5) => {
    try {
      const sound = getSound(type);
      sound.volume(clamp(volume));
      sound.play();
    } catch (err) {
      console.warn(`[sound] failed to play ${type}:`, err);
    }
  }, []);

  return { play };
}

// Standalone helper for non-hook contexts (e.g. global toast wrapper)
export function playNotificationSound(type: SoundType, volume = 0.5) {
  try {
    const sound = getSound(type);
    sound.volume(clamp(volume));
    sound.play();
  } catch (err) {
    console.warn(`[sound] failed to play ${type}:`, err);
  }
}
