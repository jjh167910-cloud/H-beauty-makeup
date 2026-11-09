import { useCallback, useEffect, useRef, useState } from "react";
import { SpeakerHigh, SpeakerSlash } from "@phosphor-icons/react";

/** One persistent audio element across route and sheet navigation. */
const TRACK = "/audio/hananeh-salon-ambience.mp3";
const PREF_KEY = "hananeh-salon-music-enabled-v1";
const VOLUME = 0.25;
const AVAILABLE = import.meta.env.VITE_SALON_MUSIC === "true";

function initialPreference(): boolean {
  try { return window.localStorage.getItem(PREF_KEY) !== "off"; }
  catch { return true; }
}

/** Audible playback is subject to the browser's first-user-interaction policy. */
export function BackgroundMusicControl() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const unlockedRef = useRef(false);
  const [enabled, setEnabled] = useState(initialPreference);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);

  const tryPlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !enabled || document.hidden || error) return;
    audio.volume = VOLUME;
    void audio.play().catch(() => setPlaying(false));
  }, [enabled, error]);

  useEffect(() => {
    if (!AVAILABLE) return;
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = VOLUME;
    if (!enabled) { audio.pause(); return; }

    const unlock = (event: Event) => {
      if ((event.target as Element | null)?.closest?.("[data-music-control]")) return;
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Enter" && event.key !== " ") return;
        if ((event.target as Element | null)?.closest?.("input, textarea, [contenteditable='true']")) return;
      }
      unlockedRef.current = true;
      tryPlay();
    };
    const onVisibility = () => {
      if (document.hidden) audio.pause();
      else if (unlockedRef.current) tryPlay();
    };
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);
    document.addEventListener("visibilitychange", onVisibility);
    tryPlay();
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, tryPlay]);

  useEffect(() => {
    if (!AVAILABLE) return;
    const sync = (event: StorageEvent) => {
      if (event.key === PREF_KEY) setEnabled(event.newValue !== "off");
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  if (!AVAILABLE) return null;

  const toggle = () => {
    // A browser can block autoplay even when music is preferred. In that
    // state the first speaker tap must START the track, not mute it.
    const next = !enabled || !playing;
    unlockedRef.current = true;
    try { window.localStorage.setItem(PREF_KEY, next ? "on" : "off"); }
    catch { /* Audio still works without storage permission. */ }
    setEnabled(next);

    const audio = audioRef.current;
    if (!audio) return;
    if (!next) { audio.pause(); return; }
    setError(false);
    audio.volume = VOLUME;
    // Retry a temporarily missing stream on a direct user activation.
    if (audio.error) audio.load();
    void audio.play().catch(() => setPlaying(false));
  };

  return (
    <span className="salon-music">
      <audio ref={audioRef} src={TRACK} preload="metadata" loop
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onError={() => { setError(true); setPlaying(false); }}
        onCanPlay={() => setError(false)} aria-hidden="true" />
      <button type="button" className="salon-music__toggle icon-btn"
        data-music-control="" data-playing={playing ? "" : undefined}
        aria-label={playing ? "قطع موسیقی پس‌زمینه" : "پخش موسیقی پس‌زمینه"}
        aria-pressed={playing}
        title={error ? "موسیقی در دسترس نیست؛ تلاش دوباره" : playing ? "قطع موسیقی" : "پخش موسیقی"}
        onClick={toggle}>
        {playing ? <SpeakerHigh size={21} weight="light" aria-hidden="true" /> :
          <SpeakerSlash size={21} weight="light" aria-hidden="true" />}
        {playing ? <span className="salon-music__dot" aria-hidden="true" /> : null}
      </button>
    </span>
  );
}
