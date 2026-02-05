import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Loader2, List, ChevronLeft, Server, AlertCircle, SkipBack, SkipForward } from 'lucide-react';
import { Channel } from '../types';

interface VideoPlayerProps {
  channel: Channel | null;
  alternatives?: Channel[];
  onSelectChannel?: (channel: Channel) => void;
  onNext?: () => void;
  onPrev?: () => void;
  onError: (msg: string) => void;
  onMarkBad?: (id: string) => void;
  onShowList?: () => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ 
  channel, 
  alternatives = [], 
  onSelectChannel, 
  onNext,
  onPrev,
  onError, 
  onMarkBad, 
  onShowList 
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showServerMenu, setShowServerMenu] = useState(false);

  useEffect(() => {
    if (!channel || !videoRef.current) return;

    const video = videoRef.current;
    const { url, id } = channel;

    setIsLoading(true);
    setIsPlaying(false);
    setShowServerMenu(false); // Close menu on channel change

    const handleMediaError = () => {
       setIsLoading(false);
       if (onMarkBad) onMarkBad(id);
       onError("Playback failed. Stream is offline or not supported.");
    };

    if (Hls.isSupported()) {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }

      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });

      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoading(false);
        video.play().catch(() => {
          setIsPlaying(false);
        });
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              // Try to recover network error once
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              handleMediaError();
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      video.addEventListener('loadedmetadata', () => {
        setIsLoading(false);
        video.play().catch(() => setIsPlaying(false));
      });
      video.addEventListener('error', handleMediaError);
    } else {
      onError("HLS is not supported in this browser.");
      setIsLoading(false);
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
      video.removeEventListener('error', handleMediaError);
    };
  }, [channel, onError, onMarkBad]);

  const handleInteraction = () => {
    setShowControls(true);
    // Auto hide controls after 3 seconds if playing
    // This is simple logic, could be more robust with timers but fine for now
  };

  if (!channel) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-900 text-slate-400 p-8 text-center">
        <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4 shadow-inner">
          <div className="w-0 h-0 border-t-[10px] border-t-transparent border-l-[18px] border-l-slate-600 border-b-[10px] border-b-transparent ml-1"></div>
        </div>
        <h2 className="text-xl font-semibold mb-2 text-white">Ready to Play</h2>
        <p className="max-w-md text-sm mb-6">Select a channel from the list to start streaming.</p>
        
        {onShowList && (
          <button 
            onClick={onShowList}
            className="md:hidden flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-full font-medium shadow-lg shadow-indigo-500/20 transition-all active:scale-95 focus:ring-4 focus:ring-indigo-500/50"
          >
            <List className="w-4 h-4" />
            Browse Channels
          </button>
        )}
      </div>
    );
  }

  return (
    <div 
      className="relative w-full h-full bg-black group"
      onClick={handleInteraction}
      onMouseMove={handleInteraction}
      onTouchStart={handleInteraction}
      onKeyDown={handleInteraction} // Ensure controls show on remote key press
      tabIndex={-1}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        controls
        playsInline
        poster={channel.logo}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />
      
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10 pointer-events-none">
          <Loader2 className="w-10 h-10 text-white animate-spin" />
        </div>
      )}

      {/* Mobile Channel Toggle Overlay */}
      {onShowList && (
        <div className={`md:hidden absolute top-4 left-4 z-30 transition-opacity duration-300 ${isPlaying ? 'opacity-0 group-hover:opacity-100 focus-within:opacity-100' : 'opacity-100'}`}>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onShowList();
            }}
            className="flex items-center gap-2 bg-black/60 hover:bg-black/80 text-white px-4 py-3 rounded-full backdrop-blur-sm border border-white/10 shadow-lg focus:ring-2 focus:ring-white"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Channels</span>
          </button>
        </div>
      )}

      {/* Info Overlay & Controls */}
      <div className={`absolute top-0 right-0 left-0 p-4 bg-gradient-to-b from-black/90 via-black/50 to-transparent transition-opacity duration-300 ${isPlaying ? 'opacity-0 group-hover:opacity-100 focus-within:opacity-100' : 'opacity-100'}`}>
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4"> 
          {/* Channel Info */}
          <div className="md:block flex-1 min-w-0">
             <h2 className="text-white font-bold text-lg md:text-xl drop-shadow-md truncate">{channel.name}</h2>
             {channel.group && <span className="text-slate-200 text-xs font-semibold uppercase tracking-wider bg-indigo-600/90 px-2 py-0.5 rounded shadow-sm">{channel.group}</span>}
          </div>

          {/* Controls Area - Optimized for TV Navigation */}
          <div className="flex items-center gap-3 self-end md:self-auto">
            {/* Prev/Next Buttons - Larger Touch Targets with Text */}
            {onPrev && onNext && (
                <div className="flex items-center gap-2 mr-0 md:mr-4">
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            onPrev();
                        }}
                        className="flex items-center gap-2 px-4 py-2.5 bg-black/60 hover:bg-indigo-600 text-white rounded-lg border border-white/10 backdrop-blur-sm transition-all focus:ring-2 focus:ring-white focus:bg-indigo-600"
                        title="Previous Channel"
                    >
                        <SkipBack className="w-5 h-5" />
                        <span className="text-sm font-semibold">Prev</span>
                    </button>
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            onNext();
                        }}
                        className="flex items-center gap-2 px-4 py-2.5 bg-black/60 hover:bg-indigo-600 text-white rounded-lg border border-white/10 backdrop-blur-sm transition-all focus:ring-2 focus:ring-white focus:bg-indigo-600"
                        title="Next Channel"
                    >
                        <span className="text-sm font-semibold">Next</span>
                        <SkipForward className="w-5 h-5" />
                    </button>
                </div>
            )}

            {alternatives.length > 1 && (
              <div className="relative">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowServerMenu(!showServerMenu);
                  }}
                  className="flex items-center gap-2 bg-black/60 hover:bg-indigo-600/80 text-white px-4 py-2.5 rounded-lg backdrop-blur-sm border border-white/10 transition-colors focus:ring-2 focus:ring-white"
                >
                   <Server className="w-5 h-5" />
                   <span className="text-sm font-medium">Server {alternatives.findIndex(c => c.id === channel.id) + 1}</span>
                </button>

                {showServerMenu && (
                  <div className="absolute top-full right-0 mt-2 w-56 bg-slate-900 border border-slate-700 rounded-lg shadow-xl overflow-hidden z-50 animate-in slide-in-from-top-2 fade-in duration-200">
                    <div className="px-3 py-2 bg-slate-950 border-b border-slate-800 text-xs text-slate-400 font-medium">
                      Select Server/Stream
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      {alternatives.map((alt, idx) => (
                        <button
                          key={alt.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectChannel?.(alt);
                            setShowServerMenu(false);
                          }}
                          className={`w-full text-left px-4 py-3 text-sm hover:bg-slate-800 transition-colors flex items-center justify-between focus:bg-slate-800 focus:outline-none focus:ring-inset focus:ring-2 focus:ring-indigo-500 ${alt.id === channel.id ? 'bg-indigo-900/30 text-indigo-400' : 'text-slate-200'}`}
                        >
                          <span>Server {idx + 1}</span>
                          {alt.id === channel.id && <div className="w-2 h-2 rounded-full bg-indigo-500"></div>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};