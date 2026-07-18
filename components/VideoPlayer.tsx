import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import mpegts from 'mpegts.js';
import { Loader2, List, ChevronLeft, Server, AlertCircle, SkipBack, SkipForward, Copy, ExternalLink } from 'lucide-react';
import { Channel } from '../types';

interface VideoPlayerProps {
  channel: Channel | null;
  alternatives?: Channel[];
  onSelectChannel?: (channel: Channel) => void;
  onNext?: () => void;
  onPrev?: () => void;
  onError: (msg: string) => void;
  onAutoFailover?: (id: string) => void;
  onShowList?: () => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ 
  channel, 
  alternatives = [], 
  onSelectChannel, 
  onNext,
  onPrev,
  onError, 
  onAutoFailover, 
  onShowList 
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const mpegtsRef = useRef<mpegts.Player | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showServerMenu, setShowServerMenu] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [retryTrigger, setRetryTrigger] = useState(0);
  const [copiedDirect, setCopiedDirect] = useState(false);
  const [copiedProxy, setCopiedProxy] = useState(false);
  const [useProxy, setUseProxy] = useState(true);

  const handleMediaError = useCallback((customMsg?: string) => {
     setIsLoading(false);
     setPlaybackError(customMsg || "Playback failed. This stream is offline, contains invalid credentials, or format is not supported by your browser.");
     if (channel && onAutoFailover) {
       onAutoFailover(channel.id);
     } else {
       onError(customMsg || "Playback failed. Stream is offline or not supported.");
     }
  }, [channel, onAutoFailover, onError]);

  useEffect(() => {
    setPlaybackError(null);
    if (!channel || !videoRef.current) return;

    const video = videoRef.current;
    const { url, id } = channel;

    setIsLoading(true);
    setIsPlaying(false);
    setShowServerMenu(false); // Close menu on channel change

    // Clean up any existing players first
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (mpegtsRef.current) {
      mpegtsRef.current.unload();
      mpegtsRef.current.destroy();
      mpegtsRef.current = null;
    }

    // Determine the stream source URL
    // Absolute rules: if useProxy is true, starts with http://, or if it is a .m3u8/HLS stream, or if it is a .ts file/livestream, route it through our high-performance local proxy!
    let finalUrl = url;
    const urlLower = url.toLowerCase();
    const isHttp = url.startsWith('http://');
    const isHls = urlLower.includes('.m3u8') || 
                  urlLower.includes('m3u8') || 
                  urlLower.includes('/play') || 
                  urlLower.includes('stream=') || 
                  urlLower.includes('workers.dev');
    const isTsStream = urlLower.includes('.ts') || 
                       urlLower.includes('/live/') || 
                       urlLower.includes('/movie/');

    if (useProxy && (isHttp || isHls || isTsStream)) {
      finalUrl = `/api/stream?url=${encodeURIComponent(url)}`;
    }

    // Playback strategy
    if (isTsStream && mpegts.isSupported()) {
      try {
        const mpegtsPlayer = mpegts.createPlayer({
          type: 'mpegts',
          isLive: true,
          url: finalUrl
        }, {
          enableWorker: true,
          lazyLoad: false,
          stashInitialSize: 32 * 1024, // Optimized initial buffer for lightning-fast playback
          liveBufferLatencyChasing: true, // Auto catch-up to minimize lag
          maxReaderPageSize: 512 * 1024 // Increased reader page size for fluid decoding
        } as any);

        mpegtsRef.current = mpegtsPlayer;
        mpegtsPlayer.attachMediaElement(video);
        mpegtsPlayer.load();
        
        mpegtsPlayer.on(mpegts.Events.ERROR, (type, detail, info) => {
          console.warn("mpegts.js live stream warning:", type, detail, info);
          // Only abort for unrecoverable Network connections. Let media recovery play through soft decoding errors/warns.
          if (type === mpegts.ErrorTypes.NETWORK_ERROR) {
            handleMediaError("Stream network connection lost. The IPTV provider might be offline or rate-limiting.");
          }
        });

        mpegtsPlayer.on(mpegts.Events.LOADING_COMPLETE, () => {
          setIsLoading(false);
        });

        mpegtsPlayer.on(mpegts.Events.METADATA_ARRIVED, () => {
          setIsLoading(false);
        });

        video.play().then(() => {
          setIsLoading(false);
        }).catch(() => {
          setIsPlaying(false);
        });

      } catch (err) {
        console.error("Failed to initialize mpegts.js:", err);
        handleMediaError();
      }
    } else if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 60
      });

      hlsRef.current = hls;
      hls.loadSource(finalUrl);
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
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              handleMediaError("A critical HLS playback error occurred.");
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = finalUrl;
      const handleMetadata = () => {
        setIsLoading(false);
        video.play().catch(() => setIsPlaying(false));
      };
      
      video.addEventListener('loadedmetadata', handleMetadata);
      video.addEventListener('error', () => handleMediaError("Native video engine failed to play this stream."));

      return () => {
        video.removeEventListener('loadedmetadata', handleMetadata);
      };
    } else {
      onError("Streaming format has no supported players in this browser.");
      setIsLoading(false);
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (mpegtsRef.current) {
        mpegtsRef.current.unload();
        mpegtsRef.current.destroy();
        mpegtsRef.current = null;
      }
    };
  }, [channel, handleMediaError, retryTrigger, useProxy]);

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
        onCanPlay={() => setIsLoading(false)}
        onError={(e) => {
          const err = e.currentTarget.error;
          console.error("HTML5 Video Native Error:", err);
          if (err) {
            if (err.code === err.MEDIA_ERR_DECODE) {
              handleMediaError("HTML5 Decoding Error: The browser failed to decode the video. Some broadcast streams use Dolby AC-3 sound or MPEG-2 formats that standard web browsers block. Toggle proxy modes or try direct streaming below.");
            } else if (err.code === err.MEDIA_ERR_SRC_NOT_SUPPORTED) {
              handleMediaError("Unsupported Stream Source: The link was blocked, timed out, or returned an unplayable stream. Try switching connection modes below.");
            } else {
              handleMediaError(`Native Player Error (Code ${err.code}). Toggle proxy modes below to attempt recovery.`);
            }
          }
        }}
      />
      
      {playbackError && !isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/98 text-slate-300 p-6 md:p-8 text-center z-20 overflow-y-auto">
          <AlertCircle className="w-12 h-12 text-indigo-500 mb-3 animate-pulse shrink-0" />
          <h3 className="text-lg font-bold text-white mb-1">Internal Player Resilience Center</h3>
          
          <div className="max-w-xl text-xs text-slate-400 bg-slate-900 border border-slate-800 p-4 rounded-lg mb-6 text-left space-y-2">
            <p className="font-semibold text-indigo-400">Stream Connection Diagnose State:</p>
            <p className="text-slate-300 italic">"{playbackError}"</p>
            <p className="pt-2">
              Our player contains **dual connection modes** to bypass browser constraints. Mixed content blocks occur because modern browsers refuse raw HTTP streams inside secure HTTPS interfaces.
            </p>
          </div>

          <div className="flex flex-col gap-4 w-full max-w-md mb-2">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 text-left">Configure Internal Player Mode:</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setUseProxy(true);
                    setPlaybackError(null);
                    setRetryTrigger(prev => prev + 1);
                  }}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    useProxy 
                      ? 'bg-indigo-950/40 border-indigo-500 text-white shadow-md shadow-indigo-500/10' 
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-400'
                  }`}
                >
                  <p className="text-xs font-bold block mb-0.5">Stream Proxy (On)</p>
                  <p className="text-[9px] text-slate-400 leading-tight">Bypasses ISP CORS blocks, HTTPS security filters & User-Agent blocks</p>
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setUseProxy(false);
                    setPlaybackError(null);
                    setRetryTrigger(prev => prev + 1);
                  }}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    !useProxy 
                      ? 'bg-emerald-950/40 border-emerald-500 text-white shadow-md shadow-emerald-500/10' 
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-400'
                  }`}
                >
                  <p className="text-xs font-bold block mb-0.5">Stream Direct</p>
                  <p className="text-[9px] text-slate-400 leading-tight">Hits source directly from your browser engine (best for latency)</p>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap justify-center gap-2 border-t border-slate-900 pt-4">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setPlaybackError(null);
                  setRetryTrigger(prev => prev + 1);
                }}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-all shadow-md active:scale-95 flex items-center gap-1.5"
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin-slow" />
                Retry Web Connection
              </button>
              
              <a
                href={channel.url}
                target="_blank"
                rel="noreferrer"
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-semibold transition-all shadow-md active:scale-95 flex items-center gap-1.5 border border-slate-705"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                VLC Hardware Fallback
              </a>

              {onShowList && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onShowList();
                  }}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-slate-200 rounded-lg text-xs font-semibold transition-all border border-slate-800 active:scale-95"
                >
                  Choose Another
                </button>
              )}
            </div>

            <div className="border-t border-slate-850 pt-4 mt-2 text-left space-y-2.5">
              <p className="text-xs font-semibold text-slate-400">Stream Resource Direct Access urls:</p>
              
              {/* Direct Server URL */}
              <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 p-2 rounded-lg justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Direct Source URL</p>
                  <p className="text-[10px] text-slate-400 font-mono truncate">{channel.url}</p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(channel.url);
                    setCopiedDirect(true);
                    setTimeout(() => setCopiedDirect(false), 2000);
                  }}
                  className="px-2.5 py-1.5 bg-slate-800 text-slate-300 rounded hover:bg-slate-700 text-[10px] font-medium shrink-0 flex items-center gap-1 border border-slate-700"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copiedDirect ? "Copied!" : "Copy"}
                </button>
              </div>

              {/* Secure Proxy Stream URL */}
              <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 p-2 rounded-lg justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] text-indigo-400 font-bold uppercase tracking-wider">Cloud Resilient Proxy URL (Recommended)</p>
                  <p className="text-[10px] text-slate-400 font-mono truncate">
                    {`${window.location.origin}/api/stream?url=${encodeURIComponent(channel.url)}`}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const proxyUrl = `${window.location.origin}/api/stream?url=${encodeURIComponent(channel.url)}`;
                    navigator.clipboard.writeText(proxyUrl);
                    setCopiedProxy(true);
                    setTimeout(() => setCopiedProxy(false), 2000);
                  }}
                  className="px-2.5 py-1.5 bg-slate-800 text-slate-300 rounded hover:bg-slate-700 text-[10px] font-medium shrink-0 flex items-center gap-1 border border-slate-700"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copiedProxy ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
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