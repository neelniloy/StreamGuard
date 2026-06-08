import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Play, CheckCircle, XCircle, Loader2, Search, Filter, Trash2, Download, AlertTriangle, ChevronLeft, Tv } from 'lucide-react';
import { Channel } from '../types';
import Hls from 'hls.js';
import { VideoPlayer } from './VideoPlayer';

interface PlaylistTesterProps {
  channels: Channel[];
  onBack: () => void;
  onPlay: (channel: Channel) => void;
  results: Record<string, TestResult>;
  setResults: React.Dispatch<React.SetStateAction<Record<string, TestResult>>>;
  setBadChannels?: React.Dispatch<React.SetStateAction<Set<string>>>;
}

interface TestResult {
  id: string;
  status: 'pending' | 'testing' | 'working' | 'dead';
  error?: string;
}

export const PlaylistTester: React.FC<PlaylistTesterProps> = ({ 
  channels, 
  onBack, 
  onPlay, 
  results, 
  setResults, 
  setBadChannels 
}) => {
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [concurrency, setConcurrency] = useState(5);
  const [search, setSearch] = useState('');
  const [localSearch, setLocalSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'working' | 'dead'>('all');

  // Debounce the update to parent's search state by 250ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setSearch(localSearch);
    }, 250);
    return () => clearTimeout(handler);
  }, [localSearch]);
  const [progress, setProgress] = useState(0);
  
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set());
  const [totalToTest, setTotalToTest] = useState(0);
  const [testedCount, setTestedCount] = useState(0);

  const testingQueue = useRef<string[]>([]);
  const activeTests = useRef<number>(0);
  const stopRequested = useRef(false);

  // Stats
  const stats = useMemo(() => {
    const all = Object.values(results) as TestResult[];
    return {
      total: channels.length,
      tested: all.length,
      working: all.filter(r => r.status === 'working').length,
      dead: all.filter(r => r.status === 'dead').length,
      pending: channels.length - all.length
    };
  }, [results, channels]);

  const testChannel = useCallback(async (channel: Channel): Promise<TestResult> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.muted = true;
      video.style.display = 'none';
      
      let hls: Hls | null = null;
      let timeout: any = null;

      const cleanup = () => {
        if (timeout) clearTimeout(timeout);
        if (hls) {
          hls.destroy();
        }
        video.src = '';
        video.load();
      };

      timeout = setTimeout(() => {
        cleanup();
        resolve({ id: channel.id, status: 'dead', error: 'Timeout' });
      }, 15000); // 15s timeout per channel

      if (Hls.isSupported()) {
        hls = new Hls({
          enableWorker: false,
          xhrSetup: (xhr) => {
            xhr.withCredentials = false;
          }
        });
        
        hls.loadSource(channel.url);
        hls.attachMedia(video);
        
        // Wait for at least one fragment to be loaded - much more reliable than just manifest parsed
        hls.on(Hls.Events.FRAG_LOADED, () => {
          cleanup();
          resolve({ id: channel.id, status: 'working' });
        });

        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            cleanup();
            resolve({ id: channel.id, status: 'dead', error: data.details });
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = channel.url;
        // For native, wait for canplay or playing
        const onCanPlay = () => {
          video.removeEventListener('canplay', onCanPlay);
          cleanup();
          resolve({ id: channel.id, status: 'working' });
        };
        video.addEventListener('canplay', onCanPlay);
        video.addEventListener('error', () => {
          cleanup();
          resolve({ id: channel.id, status: 'dead', error: 'Native error' });
        });
      } else {
        resolve({ id: channel.id, status: 'dead', error: 'HLS not supported' });
      }
    });
  }, []);

  const processQueue = useCallback(async () => {
    if (stopRequested.current || testingQueue.current.length === 0) {
      if (activeTests.current === 0) setIsTesting(false);
      return;
    }

    while (activeTests.current < concurrency && testingQueue.current.length > 0 && !stopRequested.current) {
      const channelId = testingQueue.current.shift();
      if (!channelId) break;

      const channel = channels.find(c => c.id === channelId);
      if (!channel) continue;

      activeTests.current++;
      setResults(prev => ({ ...prev, [channelId]: { id: channelId, status: 'testing' } }));

      testChannel(channel).then(result => {
        setResults(prev => ({ ...prev, [channelId]: result }));
        if (setBadChannels) {
          if (result.status === 'dead') {
            setBadChannels(prev => {
              const next = new Set(prev);
              next.add(channelId);
              return next;
            });
          } else if (result.status === 'working') {
            setBadChannels(prev => {
              const next = new Set(prev);
              next.delete(channelId);
              return next;
            });
          }
        }
        activeTests.current--;
        setTestedCount(prev => prev + 1);
        processQueue();
      });
    }
  }, [channels, concurrency, testChannel]);

  const startTesting = () => {
    stopRequested.current = false;
    setIsTesting(true);
    
    // Test selected channels if any, otherwise test currently filtered channels
    const channelsToTest = selectedChannels.size > 0 
      ? channels.map(c => c.id).filter(id => selectedChannels.has(id)) // Keep original order
      : filteredResults.map(c => c.id);
      
    setTotalToTest(channelsToTest.length);
    setTestedCount(0);
    testingQueue.current = channelsToTest;
    processQueue();
  };

  const stopTesting = () => {
    stopRequested.current = true;
    testingQueue.current = [];
  };

  const clearResults = () => {
    setResults({});
    setTestedCount(0);
    setTotalToTest(0);
  };

  const toggleSelection = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedChannels(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedChannels.size === filteredResults.length && filteredResults.length > 0) {
      setSelectedChannels(new Set());
    } else {
      setSelectedChannels(new Set(filteredResults.map(c => c.id)));
    }
  };

  const downloadWorking = () => {
    const workingChannels = channels.filter(c => results[c.id]?.status === 'working');
    let m3u = "#EXTM3U\n";
    workingChannels.forEach(ch => {
      m3u += `#EXTINF:-1 tvg-id="${ch.id}" tvg-logo="${ch.logo || ''}" group-title="${ch.group || ''}",${ch.name}\n${ch.url}\n`;
    });
    
    const blob = new Blob([m3u], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'working_channels.m3u';
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredResults = useMemo(() => {
    return channels.filter(ch => {
      const result = results[ch.id];
      const matchesSearch = ch.name.toLowerCase().includes(search.toLowerCase());
      const matchesFilter = 
        filter === 'all' || 
        (filter === 'working' && result?.status === 'working') || 
        (filter === 'dead' && result?.status === 'dead');
      return matchesSearch && matchesFilter;
    });
  }, [channels, results, search, filter]);

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-white">Playlist Tester</h1>
            <p className="text-xs text-slate-400">{channels.length} channels loaded</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isTesting ? (
            <button 
              onClick={stopTesting}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <XCircle className="w-4 h-4" /> Stop Test
            </button>
          ) : (
            <button 
              onClick={startTesting}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <Play className="w-4 h-4" /> {selectedChannels.size > 0 ? `Test Selected (${selectedChannels.size})` : 'Test All'}
            </button>
          )}
          <button 
            onClick={clearResults}
            className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors"
            title="Clear Results"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-px bg-slate-800 border-b border-slate-800">
        <div className="bg-slate-900 p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Total</p>
          <p className="text-xl font-bold text-white">{stats.total}</p>
        </div>
        <div className="bg-slate-900 p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-green-500 font-bold">Working</p>
          <p className="text-xl font-bold text-green-400">{stats.working}</p>
        </div>
        <div className="bg-slate-900 p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-red-500 font-bold">Dead</p>
          <p className="text-xl font-bold text-red-400">{stats.dead}</p>
        </div>
        <div className="bg-slate-900 p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Progress</p>
          <p className="text-xl font-bold text-indigo-400">
            {totalToTest > 0 ? Math.round((testedCount / totalToTest) * 100) : 0}%
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      {isTesting && totalToTest > 0 && (
        <div className="h-1 bg-slate-800 overflow-hidden">
          <div 
            className="h-full bg-indigo-500 transition-all duration-300" 
            style={{ width: `${(testedCount / totalToTest) * 100}%` }}
          />
        </div>
      )}

      {/* Main split-panel container */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* Left Side: Playlist Tester (Controls + Channel List) */}
        <div className="flex-1 flex flex-col min-w-0 h-full border-r border-slate-800/50">
          {/* Controls */}
          <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row gap-4 bg-slate-900/30 shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input 
                type="text" 
                placeholder="Search channels..." 
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <label className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-md transition-all text-slate-300 hover:text-white cursor-pointer bg-slate-800 hover:bg-slate-700 mr-2 border border-slate-700">
                <input 
                  type="checkbox" 
                  checked={selectedChannels.size === filteredResults.length && filteredResults.length > 0}
                  onChange={toggleSelectAll}
                  className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-900 accent-indigo-500 cursor-pointer"
                />
                Select All
              </label>
              <div className="flex bg-slate-950 rounded-lg p-1 border border-slate-800">
                <button 
                  onClick={() => setFilter('all')}
                  className={`px-3 py-1 text-xs rounded-md transition-all ${filter === 'all' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  All
                </button>
                <button 
                  onClick={() => setFilter('working')}
                  className={`px-3 py-1 text-xs rounded-md transition-all ${filter === 'working' ? 'bg-green-900/30 text-green-400' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  Working
                </button>
                <button 
                  onClick={() => setFilter('dead')}
                  className={`px-3 py-1 text-xs rounded-md transition-all ${filter === 'dead' ? 'bg-red-900/30 text-red-400' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  Dead
                </button>
              </div>
              <button 
                onClick={downloadWorking}
                disabled={stats.working === 0}
                className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
              >
                <Download className="w-4 h-4" /> Export Working
              </button>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="divide-y divide-slate-800/50">
              {filteredResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-slate-500">
                  <Filter className="w-12 h-12 mb-4 opacity-20" />
                  <p>No results found</p>
                </div>
              ) : (
                filteredResults.map((ch) => {
                  const result = results[ch.id];
                  const isActive = activeChannel?.id === ch.id;
                  return (
                    <div key={ch.id} className={`p-4 flex items-center justify-between hover:bg-slate-900/50 transition-colors ${isActive ? 'bg-indigo-950/20 border-l-4 border-indigo-505 pl-[12px]' : ''}`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <div onClick={(e) => e.stopPropagation()} className="shrink-0 flex items-center justify-center pr-2">
                           <input 
                              type="checkbox" 
                              checked={selectedChannels.has(ch.id)}
                              onChange={(e) => toggleSelection(ch.id, e as any)}
                              className="w-4 h-4 rounded border-slate-700 bg-slate-900 accent-indigo-500 cursor-pointer"
                           />
                        </div>
                        <div className="w-8 h-8 bg-slate-900 rounded border border-slate-800 flex items-center justify-center shrink-0 overflow-hidden">
                          {ch.logo ? (
                            <img src={ch.logo} alt="" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                          ) : (
                            <Tv className="w-4 h-4 text-slate-700" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className={`text-sm font-medium truncate ${isActive ? 'text-indigo-400' : 'text-slate-200'}`}>{ch.name}</p>
                          <p className="text-[10px] text-slate-500 truncate">{ch.url}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0 ml-4">
                        {result?.status === 'working' && (
                          <button
                            onClick={() => setActiveChannel(ch)}
                            className={`p-2 rounded-lg transition-all flex items-center gap-2 group/play ${isActive ? 'bg-indigo-600 text-white shadow' : 'bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600 hover:text-white'}`}
                            title="Play/Preview Channel"
                          >
                            <Play className="w-4 h-4 fill-current" />
                            <span className="text-[10px] font-bold uppercase hidden sm:inline">{isActive ? 'Playing' : 'Play'}</span>
                          </button>
                        )}
                        {result?.status === 'testing' && (
                          <div className="flex items-center gap-2 text-indigo-400">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="text-[10px] font-bold uppercase">Testing</span>
                          </div>
                        )}
                        {result?.status === 'working' && !isActive && (
                          <div className="flex items-center gap-2 text-green-400">
                            <CheckCircle className="w-4 h-4" />
                            <span className="text-[10px] font-bold uppercase">Working</span>
                          </div>
                        )}
                        {result?.status === 'dead' && (
                          <div className="flex items-center gap-2 text-red-400">
                            <XCircle className="w-4 h-4" />
                            <div className="flex flex-col items-end">
                              <span className="text-[10px] font-bold uppercase">Dead</span>
                              <span className="text-[8px] text-red-500/70">{result.error}</span>
                            </div>
                          </div>
                        )}
                        {!result && (
                          <span className="text-[10px] font-bold uppercase text-slate-600">Pending</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Embedded Video Player (only if activeChannel selected) */}
        {activeChannel && (
          <div className="w-full lg:w-[45%] h-[320px] lg:h-full bg-black flex flex-col relative border-t lg:border-t-0 lg:border-l border-slate-800">
             {/* Player Header */}
             <div className="p-3 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between shrink-0">
               <div className="flex items-center gap-2 min-w-0">
                 <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />
                 <span className="text-xs font-semibold text-slate-300 truncate">Previewing: {activeChannel.name}</span>
               </div>
               <div className="flex items-center gap-2 shrink-0">
                 <button 
                   onClick={() => onPlay(activeChannel)}
                   className="text-xs px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-bold transition-all shadow-md active:scale-95 shrink-0"
                   title="Watch in full player"
                 >
                   Open Full Screen
                 </button>
                 <button 
                   onClick={() => setActiveChannel(null)}
                   className="text-xs text-slate-400 hover:text-white px-2 py-1.5 bg-slate-800 hover:bg-slate-700 rounded transition-colors"
                 >
                   Close
                 </button>
               </div>
             </div>
             {/* The VideoPlayer */}
             <div className="flex-1 relative overflow-hidden bg-black">
               <VideoPlayer 
                 channel={activeChannel}
                 onError={(msg) => console.warn("Tester Preview Player error:", msg)}
               />
             </div>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="p-3 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-500">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
            <span>Concurrency: {concurrency}</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="cursor-pointer hover:text-slate-300">
              Adjust:
              <input 
                type="range" 
                min="1" 
                max="20" 
                value={concurrency} 
                onChange={(e) => setConcurrency(parseInt(e.target.value))}
                className="ml-2 w-20 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </label>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-3 h-3 text-yellow-500/50" />
          <span>Note: Testing many channels may trigger CORS or rate limits.</span>
        </div>
      </div>
    </div>
  );
};

