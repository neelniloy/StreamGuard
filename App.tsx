import React, { useState, useEffect, useMemo } from 'react';
import { Upload, AlertTriangle, Play, Link as LinkIcon, ShieldCheck, X, Loader2, FileText, Menu, Globe, Server, Tv, Film, Radio } from 'lucide-react';
import { VideoPlayer } from './components/VideoPlayer';
import { ChannelList } from './components/ChannelList';
import { parseM3U } from './services/parser';
import { Channel, PlaylistData } from './types';

const DISCLAIMER_ACCEPTED_KEY = 'streamguard_disclaimer_v1';

type InputMode = 'file' | 'url' | 'text';

const DEMO_PLAYLISTS = [
  {
    name: "Global Public",
    desc: "30k+ Channels (IPTV-Org)",
    url: "https://iptv-org.github.io/iptv/index.m3u",
    icon: Globe,
    color: "text-blue-400"
  },
  {
    name: "Community Mix",
    desc: "Sports & General",
    url: "https://raw.githubusercontent.com/DrSujonPaul/Sujon/6dc6a1d4eaa20a9239ae27d8e0f00182b60eeb47/iptv",
    icon: Server,
    color: "text-green-400"
  },
  {
    name: "Mrgify BDIX",
    desc: "Bangladesh/BDIX",
    url: "https://raw.githubusercontent.com/abusaeeidx/Mrgify-BDIX-IPTV/main/playlist.m3u",
    icon: Tv,
    color: "text-red-400"
  },
  {
    name: "Ayna Free",
    desc: "Mixed Entertainment",
    url: "https://raw.githubusercontent.com/abusaeeidx/Ayna-Playlists-free-Version/refs/heads/main/playlist.m3u",
    icon: Film,
    color: "text-purple-400"
  },
  {
    name: "WavesOT",
    desc: "General Streams",
    url: "https://raw.githubusercontent.com/abusaeeidx/iptv-playlist/refs/heads/main/wavesot.m3u",
    icon: Radio,
    color: "text-yellow-400"
  },
  {
    name: "Scraper Zilla",
    desc: "Aggregated Mix",
    url: "https://raw.githubusercontent.com/abusaeeidx/IPTV-Scraper-Zilla/main/combined-playlist.m3u",
    icon: Server,
    color: "text-orange-400"
  },
  {
    name: "Xumo TV",
    desc: "US/Global FAST",
    url: "https://iptv-scraper-zilla.pages.dev/xumo_playlist.m3u",
    icon: Globe,
    color: "text-cyan-400"
  }
];

const App = () => {
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [playlist, setPlaylist] = useState<PlaylistData | null>(null);
  const [currentChannel, setCurrentChannel] = useState<Channel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [badChannels, setBadChannels] = useState<Set<string>>(new Set());
  
  // Filter States
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('All');
  const [hideBadChannels, setHideBadChannels] = useState(false);

  const [inputMode, setInputMode] = useState<InputMode>('url');
  const [urlInput, setUrlInput] = useState('');
  const [textInput, setTextInput] = useState('');
  
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<string>('');

  useEffect(() => {
    const accepted = localStorage.getItem(DISCLAIMER_ACCEPTED_KEY);
    if (accepted === 'true') {
      setDisclaimerAccepted(true);
    }
  }, []);

  const handleDisclaimerAccept = () => {
    localStorage.setItem(DISCLAIMER_ACCEPTED_KEY, 'true');
    setDisclaimerAccepted(true);
  };

  const processPlaylist = (content: string) => {
    setLoadingStatus('Parsing playlist...');
    
    // Use a slight delay to allow UI to update loading state before heavy parsing
    setTimeout(() => {
      try {
        const data = parseM3U(content);
        if (data.channels.length === 0) {
          setError("Parsed 0 channels. Please check the file format or connection.");
        } else {
          setPlaylist(data);
          setBadChannels(new Set()); // Reset bad channels on new playlist
          
          // Reset Filters
          setSearch('');
          setSelectedGroup('All');
          setHideBadChannels(false);

          setError(null);
          // On mobile, auto-open menu if it's a fresh load
          if (window.innerWidth < 768) {
            setMobileMenuOpen(true);
          }
        }
      } catch (err) {
        console.error("Parsing error:", err);
        setError("Failed to parse playlist structure.");
      } finally {
        setLoadingStatus('');
        setIsLoading(false);
      }
    }, 100);
  };

  const fetchFromUrl = async (url: string) => {
    setIsLoading(true);
    setLoadingStatus('Connecting...');
    setError(null);

    // Helper for direct fetching
    const fetchDirect = async (u: string) => {
      const res = await fetch(u);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    };

    // Helper for AllOrigins JSON API (Avoids raw CORS issues sometimes)
    const fetchAllOrigins = async (u: string) => {
      const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(u)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return json.contents;
    };

    try {
      // Strategy 1: Direct Fetch
      try {
        const text = await fetchDirect(url);
        processPlaylist(text);
        return;
      } catch (e) {
        console.warn("Direct fetch failed, attempting proxies...", e);
      }

      // Strategy 2: AllOrigins (JSON Mode)
      try {
        setLoadingStatus('Routing via Proxy 1...');
        const text = await fetchAllOrigins(url);
        processPlaylist(text);
        return;
      } catch (e) {
        console.warn("Proxy 1 failed...", e);
      }

      // Strategy 3: CodeTabs Proxy
      try {
        setLoadingStatus('Routing via Proxy 2...');
        const text = await fetchDirect(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`);
        processPlaylist(text);
        return;
      } catch (e) {
        console.warn("Proxy 2 failed...", e);
      }

      // Strategy 4: CorsProxy.io
      try {
        setLoadingStatus('Routing via Proxy 3...');
        const text = await fetchDirect(`https://corsproxy.io/?${encodeURIComponent(url)}`);
        processPlaylist(text);
        return;
      } catch (e) {
        console.warn("Proxy 3 failed...", e);
      }

      throw new Error("All connection strategies failed.");

    } catch (err) {
      console.error("Fetch Final Error:", err);
      setError("Failed to download playlist. The server might be blocking requests or the URL is invalid. Try downloading the file manually and using the 'Upload' tab.");
      setIsLoading(false);
      setLoadingStatus('');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setLoadingStatus('Reading file...');
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      processPlaylist(content);
    };
    reader.onerror = () => {
      setError("Failed to read file.");
      setIsLoading(false);
      setLoadingStatus('');
    };
    reader.readAsText(file);
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput) return;
    fetchFromUrl(urlInput);
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput) return;
    setIsLoading(true);
    processPlaylist(textInput);
  };

  const loadDemo = (url: string) => {
    setInputMode('url');
    setUrlInput(url);
    fetchFromUrl(url);
  };

  const markChannelAsBad = (id: string) => {
    setBadChannels(prev => {
      const newSet = new Set(prev);
      newSet.add(id);
      return newSet;
    });
  };

  // --- Filter Logic ---
  const filteredChannels = useMemo(() => {
    if (!playlist) return [];
    return playlist.channels.filter(ch => {
      if (hideBadChannels && badChannels.has(ch.id)) return false;
      const matchesSearch = ch.name.toLowerCase().includes(search.toLowerCase());
      const matchesGroup = selectedGroup === 'All' || ch.group === selectedGroup;
      return matchesSearch && matchesGroup;
    });
  }, [playlist, search, selectedGroup, hideBadChannels, badChannels]);

  // --- Navigation Logic ---
  const handleNavigate = (direction: 'next' | 'prev') => {
    if (!currentChannel || filteredChannels.length === 0) return;
    
    const currentIndex = filteredChannels.findIndex(ch => ch.id === currentChannel.id);
    if (currentIndex === -1) return; // Should not happen usually, but safety check

    let newIndex;
    if (direction === 'next') {
      newIndex = currentIndex + 1;
      // Loop back to start if at end
      if (newIndex >= filteredChannels.length) newIndex = 0; 
    } else {
      newIndex = currentIndex - 1;
      // Loop to end if at start
      if (newIndex < 0) newIndex = filteredChannels.length - 1;
    }
    
    setCurrentChannel(filteredChannels[newIndex]);
  };

  // Find all channels with the same name to act as "servers" or alternative streams
  const channelAlternatives = useMemo(() => {
    if (!currentChannel || !playlist) return [];
    return playlist.channels.filter(ch => ch.name === currentChannel.name);
  }, [currentChannel, playlist]);

  if (!disclaimerAccepted) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex items-center justify-center p-4 z-50">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl">
          <div className="flex justify-center mb-6">
            <div className="p-3 bg-indigo-500/10 rounded-full">
              <ShieldCheck className="w-10 h-10 text-indigo-500" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white text-center mb-4">Legal Disclaimer</h1>
          <div className="space-y-4 text-slate-300 text-sm bg-slate-950/50 p-4 rounded-lg border border-slate-800/50 mb-6">
            <p><strong>1. Content Responsibility:</strong> This application is a strictly client-side technical demonstration of HLS video playback technology. It does not host, provide, store, or distribute any media content.</p>
            <p><strong>2. User Liability:</strong> You, the user, are solely responsible for any playlists or content URLs you input. Ensure you have the legal right to access any streams you play.</p>
            <p><strong>3. Third-Party Rights:</strong> All video content remains the property of its respective owners. This tool acts merely as a browser-based video player.</p>
          </div>
          <button
            onClick={handleDisclaimerAccept}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-lg transition-all transform active:scale-95 focus:outline-none focus:ring-4 focus:ring-indigo-500/50"
            autoFocus
          >
            I Understand & Agree
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-slate-950 flex flex-col text-slate-200 font-sans">
      {/* Navbar */}
      <header className="h-14 border-b border-slate-800 bg-slate-900 flex items-center px-4 justify-between shrink-0 z-20 relative">
        <div className="flex items-center gap-3">
          {playlist && (
            <button 
              onClick={() => setMobileMenuOpen(true)} 
              className="md:hidden text-slate-400 hover:text-white p-2 -ml-2 rounded-lg focus:bg-slate-800"
            >
              <Menu className="w-6 h-6" />
            </button>
          )}
          <div className="flex items-center gap-2">
            <Play className="w-6 h-6 text-indigo-500 fill-indigo-500" />
            <h1 className="font-bold text-lg tracking-tight text-white">Stream<span className="text-indigo-500">Guard</span></h1>
          </div>
        </div>
        
        {playlist && (
          <button 
            onClick={() => { setPlaylist(null); setCurrentChannel(null); setMobileMenuOpen(false); }} 
            className="px-3 py-1.5 text-xs font-medium bg-slate-800 text-slate-300 rounded hover:bg-slate-700 hover:text-white transition-colors flex items-center gap-2 focus:ring-2 focus:ring-indigo-500"
          >
            <X className="w-3 h-3" />
            <span className="hidden sm:inline">Clear Playlist</span>
            <span className="sm:hidden">Clear</span>
          </button>
        )}
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {!playlist ? (
          // Empty State / Input Area
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in duration-500 z-10 overflow-y-auto">
            <div className="max-w-2xl w-full space-y-6">
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold text-white">Load Your Playlist</h2>
                <p className="text-slate-400">Select a method to load channels.</p>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl shadow-lg space-y-6">
                
                {/* Tabs */}
                <div className="flex p-1 bg-slate-950 rounded-lg">
                  <button 
                    onClick={() => setInputMode('url')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-medium rounded-md transition-all focus:ring-2 focus:ring-indigo-500 focus:outline-none ${inputMode === 'url' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                  >
                    <LinkIcon className="w-3 h-3" /> URL
                  </button>
                  <button 
                    onClick={() => setInputMode('file')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-medium rounded-md transition-all focus:ring-2 focus:ring-indigo-500 focus:outline-none ${inputMode === 'file' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                  >
                    <Upload className="w-3 h-3" /> Upload
                  </button>
                  <button 
                    onClick={() => setInputMode('text')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-medium rounded-md transition-all focus:ring-2 focus:ring-indigo-500 focus:outline-none ${inputMode === 'text' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                  >
                    <FileText className="w-3 h-3" /> Paste
                  </button>
                </div>

                {/* Content based on Tab */}
                <div className="min-h-[140px] flex flex-col justify-center">
                  
                  {/* URL MODE */}
                  {inputMode === 'url' && (
                    <form onSubmit={handleUrlSubmit} className="space-y-4">
                      <div>
                        <input
                          type="url"
                          placeholder="https://example.com/playlist.m3u"
                          value={urlInput}
                          onChange={(e) => setUrlInput(e.target.value)}
                          className="w-full bg-slate-950 text-white px-4 py-3 rounded-lg border border-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm transition-all"
                        />
                      </div>
                      <button 
                        type="submit" 
                        disabled={isLoading || !urlInput}
                        className="w-full bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2 focus:ring-2 focus:ring-indigo-500"
                      >
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {loadingStatus || 'Load Playlist'}
                      </button>
                      
                      {/* Demo Servers Grid */}
                      <div className="pt-4">
                        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Public Demo Servers</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {DEMO_PLAYLISTS.map((demo, idx) => {
                             const Icon = demo.icon;
                             return (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => loadDemo(demo.url)}
                                  disabled={isLoading}
                                  className="flex flex-col items-center justify-center gap-2 p-3 bg-slate-950 border border-slate-800 rounded-lg hover:bg-slate-800 hover:border-indigo-500/50 transition-all text-center group focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                >
                                  <div className={`p-2 rounded-full bg-slate-900 group-hover:bg-slate-950 transition-colors ${demo.color}`}>
                                    <Icon className="w-5 h-5" />
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="text-xs font-semibold text-slate-300 group-hover:text-white">{demo.name}</span>
                                    <span className="text-[9px] text-slate-600 group-hover:text-slate-500 line-clamp-1">{demo.desc}</span>
                                  </div>
                                </button>
                             );
                          })}
                        </div>
                      </div>
                    </form>
                  )}

                  {/* FILE MODE */}
                  {inputMode === 'file' && (
                    <div className="relative group cursor-pointer h-32" tabIndex={0} onKeyDown={(e) => {
                         if (e.key === 'Enter' || e.key === ' ') {
                             document.getElementById('file-upload-input')?.click();
                         }
                    }}>
                      <input
                        id="file-upload-input"
                        type="file"
                        accept=".m3u,.m3u8"
                        onChange={handleFileUpload}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        tabIndex={-1} // Handled by parent div for focus styles
                      />
                      <div className="absolute inset-0 border-2 border-dashed border-slate-700 rounded-lg flex flex-col items-center justify-center group-hover:border-indigo-500 group-hover:bg-slate-800/50 group-focus:border-indigo-500 group-focus:bg-slate-800/50 transition-all">
                        {isLoading ? (
                           <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                        ) : (
                           <Upload className="w-8 h-8 text-slate-500 group-hover:text-indigo-500 mb-3 transition-colors" />
                        )}
                        <span className="text-sm font-medium text-slate-300">
                          {isLoading ? loadingStatus : 'Click to select .m3u file'}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* TEXT MODE */}
                  {inputMode === 'text' && (
                    <form onSubmit={handleTextSubmit} className="space-y-4 h-full">
                      <textarea
                        placeholder="#EXTM3U&#10;#EXTINF:-1,Channel Name&#10;http://stream-url.m3u8"
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        className="w-full h-32 bg-slate-950 text-white px-3 py-2 rounded-lg border border-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-xs font-mono resize-none"
                      />
                      <button 
                        type="submit" 
                        disabled={isLoading || !textInput}
                        className="w-full bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2 focus:ring-2 focus:ring-indigo-500"
                      >
                         {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                         {loadingStatus || 'Parse Text'}
                      </button>
                    </form>
                  )}
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-400">{error}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          // Main Interface
          <>
            {/* Sidebar (Desktop) */}
            <div className="w-80 shrink-0 h-full hidden md:block border-r border-slate-800">
              <ChannelList 
                channels={filteredChannels}
                groups={playlist.groups}
                search={search}
                setSearch={setSearch}
                selectedGroup={selectedGroup}
                setSelectedGroup={setSelectedGroup}
                hideBadChannels={hideBadChannels}
                setHideBadChannels={setHideBadChannels}
                onSelect={setCurrentChannel} 
                currentChannelId={currentChannel?.id}
                badChannels={badChannels}
              />
            </div>

            {/* Mobile Channel Overlay */}
            {mobileMenuOpen && (
              <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col md:hidden animate-in slide-in-from-left duration-200">
                 <div className="h-14 border-b border-slate-800 flex items-center justify-between px-4 bg-slate-900 shrink-0">
                    <h2 className="font-bold text-white flex items-center gap-2">
                      <Menu className="w-5 h-5 text-indigo-500" /> Channels
                    </h2>
                    <button onClick={() => setMobileMenuOpen(false)} className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-md">
                       <X className="w-5 h-5"/>
                    </button>
                 </div>
                 <div className="flex-1 overflow-hidden">
                    <ChannelList
                      channels={filteredChannels}
                      groups={playlist.groups}
                      search={search}
                      setSearch={setSearch}
                      selectedGroup={selectedGroup}
                      setSelectedGroup={setSelectedGroup}
                      hideBadChannels={hideBadChannels}
                      setHideBadChannels={setHideBadChannels}
                      onSelect={(ch) => {
                        setCurrentChannel(ch);
                        setMobileMenuOpen(false);
                      }}
                      currentChannelId={currentChannel?.id}
                      badChannels={badChannels}
                    />
                 </div>
              </div>
            )}
            
            {/* Main Stage */}
            <div className="flex-1 bg-black flex flex-col relative z-0">
              <div className="flex-1 relative overflow-hidden">
                <VideoPlayer 
                  channel={currentChannel} 
                  alternatives={channelAlternatives}
                  onSelectChannel={setCurrentChannel}
                  onNext={() => handleNavigate('next')}
                  onPrev={() => handleNavigate('prev')}
                  onError={(msg) => setError(msg)}
                  onMarkBad={(id) => markChannelAsBad(id)}
                  onShowList={() => {
                    setCurrentChannel(null); // Stop playback when going back to list
                    setMobileMenuOpen(true);
                  }}
                />
              </div>

              {/* Error Toast */}
              {error && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-red-900/90 text-white px-4 py-2 rounded-lg shadow-lg text-sm flex items-center gap-2 border border-red-700 animate-in slide-in-from-bottom-5 z-50">
                  <AlertTriangle className="w-4 h-4" />
                  {error}
                  <button onClick={() => setError(null)} className="ml-2 hover:bg-red-800 rounded p-0.5"><X className="w-3 h-3"/></button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default App;