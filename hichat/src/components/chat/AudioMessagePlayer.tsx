import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause } from 'lucide-react';

interface AudioMessagePlayerProps {
  audioUrl: string;
}

export function AudioMessagePlayer({ audioUrl }: AudioMessagePlayerProps) {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [duration, setDuration] = useState<string>('0:00');
  const [progress, setProgress] = useState<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    audio.onloadedmetadata = () => {
      const mins = Math.floor(audio.duration / 60);
      const secs = Math.floor(audio.duration % 60)
        .toString()
        .padStart(2, '0');
      setDuration(`${mins}:${secs}`);
    };

    audio.ontimeupdate = () => {
      if (audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    };

    audio.onended = () => {
      setIsPlaying(false);
      setProgress(0);
    };

    return () => {
      audio.pause();
    };
  }, [audioUrl]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  return (
    <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-black/40 border border-white/10 my-1.5 w-64 max-w-full">
      <button
        type="button"
        onClick={togglePlay}
        className="w-9 h-9 rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-md hover:scale-105 transition shrink-0 cursor-pointer"
      >
        {isPlaying ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
      </button>

      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-0.5 h-4">
          {[40, 70, 90, 60, 100, 50, 80, 65, 45, 95, 75, 55, 85, 30].map((h, i) => (
            <div
              key={i}
              className={`flex-1 rounded-full transition-all duration-150 ${
                isPlaying ? 'bg-cyan-400' : 'bg-gray-600'
              }`}
              style={{
                height: isPlaying ? `${Math.max(20, (h * (progress + 20)) % 100)}%` : `${h * 0.4}%`,
                opacity: (i / 14) * 100 <= progress ? 1 : 0.4,
              }}
            />
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-gray-400 font-mono">
          <span>Voice Note</span>
          <span>{duration}</span>
        </div>
      </div>
    </div>
  );
}
