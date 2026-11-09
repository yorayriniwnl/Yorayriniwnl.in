'use client';

import { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { sound } from '@/lib/audio';

export function AmbientAudioToggle() {
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    setMuted(sound.muted);
  }, []);

  function toggle() {
    const next = sound.toggleMute();
    setMuted(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      onMouseEnter={() => sound.playHover()}
      aria-label={muted ? 'Unmute procedural UI audio' : 'Mute procedural UI audio'}
      title={muted ? 'Enable procedural UI audio' : 'Procedural UI audio enabled'}
      className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-[#b89bd310] hover:bg-[#b89bd320] border border-[#b89bd320] text-[#c9b4e6] text-[11px] font-mono transition-all"
    >
      {muted ? (
        <>
          <VolumeX size={13} className="text-[#8e7b9f]" />
          <span className="text-[10px] text-[#8e7b9f] hidden sm:inline">SFX: OFF</span>
        </>
      ) : (
        <>
          <Volume2 size={13} className="text-[#c6b1ef] animate-pulse" />
          <span className="flex items-center gap-0.5 h-2.5">
            <span className="w-0.5 h-full bg-[#c6b1ef] animate-[bounce_0.6s_ease-in-out_infinite]" />
            <span className="w-0.5 h-3/4 bg-[#c6b1ef] animate-[bounce_0.8s_ease-in-out_infinite_0.1s]" />
            <span className="w-0.5 h-full bg-[#c6b1ef] animate-[bounce_0.7s_ease-in-out_infinite_0.2s]" />
          </span>
          <span className="text-[10px] text-[#d6c4f0] hidden sm:inline">SFX: LIVE</span>
        </>
      )}
    </button>
  );
}
