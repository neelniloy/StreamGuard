import React, { useState, useEffect, useMemo } from 'react';
import { Upload, AlertTriangle, Play, Link as LinkIcon, ShieldCheck, X, Loader2, FileText, Menu, Globe, Server, Tv, Film, Radio, Star, Clock, History, Trash2 } from 'lucide-react';
import { VideoPlayer } from './components/VideoPlayer';
import { ChannelList } from './components/ChannelList';
import { PlaylistTester } from './components/PlaylistTester';
import { parseM3U } from './services/parser';
import { Channel, PlaylistData, HistoryItem } from './types';

const DISCLAIMER_ACCEPTED_KEY = 'streamguard_disclaimer_v1';
const FAVORITES_KEY = 'streamguard_favorites_v1';
const HISTORY_KEY = 'streamguard_history_v1';

type InputMode = 'file' | 'url' | 'text' | 'xtream';

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
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [testerResults, setTesterResults] = useState<Record<string, { id: string; status: 'pending' | 'testing' | 'working' | 'dead'; error?: string }>>({});
  
  // Filter States
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('All');
  const [hideBadChannels, setHideBadChannels] = useState(false);
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);

  const [inputMode, setInputMode] = useState<InputMode>('url');
  const [urlInput, setUrlInput] = useState('');
  const [textInput, setTextInput] = useState('');
  const [xtreamName, setXtreamName] = useState('');
  const [xtreamUrl, setXtreamUrl] = useState('');
  const [xtreamUsername, setXtreamUsername] = useState('');
  const [xtreamPassword, setXtreamPassword] = useState('');
  
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<string>('');
  const [isTesterMode, setIsTesterMode] = useState(false);
  const [showTester, setShowTester] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  useEffect(() => {
    const accepted = localStorage.getItem(DISCLAIMER_ACCEPTED_KEY);
    if (accepted === 'true') {
      setDisclaimerAccepted(true);
    }
    
    const savedFavorites = localStorage.getItem(FAVORITES_KEY);
    if (savedFavorites) {
      try {
        setFavorites(new Set(JSON.parse(savedFavorites)));
      } catch (e) {
        console.error("Failed to load favorites", e);
      }
    }

    const savedHistory = localStorage.getItem(HISTORY_KEY);
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error("Failed to load history", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(favorites)));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }, [history]);

  const addToHistory = (item: Omit<HistoryItem, 'id' | 'timestamp'>) => {
    if (!item.url && item.type === 'url') return;
    
    setHistory(prev => {
      // Avoid duplicates by URL if it's a URL type
      const filtered = item.url ? prev.filter(h => h.url !== item.url) : prev;
      const newItem: HistoryItem = {
        ...item,
        id: Math.random().toString(36).substr(2, 9),
        timestamp: Date.now()
      };
      return [newItem, ...filtered].slice(0, 10); // Keep last 10
    });
  };

  const removeFromHistory = (id: string) => {
    setHistory(prev => prev.filter(h => h.id !== id));
  };

  const handleDisclaimerAccept = () => {
    localStorage.setItem(DISCLAIMER_ACCEPTED_KEY, 'true');
    setDisclaimerAccepted(true);
  };

  const processPlaylist = (content: string, resolvedUrl?: string) => {
    setLoadingStatus('Parsing playlist...');
    
    // Use a slight delay to allow UI to update loading state before heavy parsing
    setTimeout(() => {
      try {
        const trimmedContent = content.trim();
        
        // Basic HTML detection
        if (
          trimmedContent.toLowerCase().startsWith('<!doctype') || 
          trimmedContent.toLowerCase().startsWith('<html') ||
          (trimmedContent.includes('<head>') && trimmedContent.includes('<body>'))
        ) {
          throw new Error("The link returned a webpage (HTML) instead of an M3U playlist. This usually happens when the playlist link requires a login, has expired, or is being blocked by a protection service like Cloudflare.");
        }

        const data = parseM3U(content);
        if (data.channels.length === 0) {
          setError("No channels found in this playlist. Please check if the link is correct and accessible.");
        } else {
          setPlaylist(data);
          setBadChannels(new Set()); // Reset bad channels on new playlist
          setTesterResults({}); // Clear any previous tester results
          
          // Reset Filters
          setSearch('');
          setSelectedGroup('All');
          setHideBadChannels(false);

          setError(null);

          if (isTesterMode) {
            setShowTester(true);
          } else {
            // On mobile, auto-open menu if it's a fresh load
            if (window.innerWidth < 768) {
              setMobileMenuOpen(true);
            }
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

  const fetchXtreamPlaylist = async (
    cleanUrl: string,
    customName: string,
    username: string,
    password: string
  ) => {
    setIsLoading(true);
    setError(null);
    setLoadingStatus('Connecting to Xtream server API...');

    const fetchJson = async (endpoint: string): Promise<any> => {
      const fullUrl = `${cleanUrl}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&${endpoint}`;
      
      const fetchWithTimeout = async (url: string, options: RequestInit = {}): Promise<Response> => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 seconds per strategy to keep failover quick
        try {
          const res = await window.fetch(url, {
            ...options,
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          return res;
        } catch (err) {
          clearTimeout(timeoutId);
          throw err;
        }
      };

      // Strategy 0: Local Server Proxy (Highly secure, handles CORS + User-Agent bypass)
      try {
        const res = await fetchWithTimeout(`/api/proxy/json?url=${encodeURIComponent(fullUrl)}`);
        if (res.ok) {
          const text = await res.text();
          return JSON.parse(text);
        }
      } catch (e) {
        console.warn(`Local JSON proxy failed for ${endpoint}, testing fallback direct fetch...`, e);
      }
      
      // Strategy 1: Direct Fetch
      try {
        const res = await fetchWithTimeout(fullUrl);
        if (res.ok) {
          const text = await res.text();
          return JSON.parse(text);
        }
      } catch (e) {
        console.warn(`Direct fetch failed for ${endpoint}, trying proxies...`, e);
      }

      // Strategy 2: AllOrigins JSON API
      try {
        const res = await fetchWithTimeout(`https://api.allorigins.win/get?url=${encodeURIComponent(fullUrl)}`);
        if (res.ok) {
          const json = await res.json();
          return JSON.parse(json.contents);
        }
      } catch (e) {
        console.warn(`Proxy 1 (AllOrigins) failed for ${endpoint}`, e);
      }

      // Strategy 3: CorsProxy.io
      try {
        const res = await fetchWithTimeout(`https://corsproxy.io/?${encodeURIComponent(fullUrl)}`);
        if (res.ok) {
          const text = await res.text();
          return JSON.parse(text);
        }
      } catch (e) {
        console.warn(`Proxy 2 (CorsProxy.io) failed for ${endpoint}`, e);
      }

      // Strategy 4: CodeTabs Proxy
      try {
        const res = await fetchWithTimeout(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(fullUrl)}`);
        if (res.ok) {
          const text = await res.text();
          return JSON.parse(text);
        }
      } catch (e) {
        console.warn(`Proxy 3 (CodeTabs) failed for ${endpoint}`, e);
      }

      throw new Error(`Failed to fetch ${endpoint} via all proxy strategies.`);
    };

    try {
      // 1. Fetch categories
      setLoadingStatus('Fetching live categories...');
      let liveCategories: any[] = [];
      try {
        liveCategories = await fetchJson('action=get_live_categories');
      } catch (e) {
        console.warn("Could not fetch categories, using default mapping", e);
      }

      const categoryMap: Record<string, string> = {};
      if (Array.isArray(liveCategories)) {
        liveCategories.forEach((cat: any) => {
          if (cat && cat.category_id !== undefined && cat.category_name) {
            categoryMap[String(cat.category_id)] = cat.category_name;
          }
        });
      }

      // 2. Fetch live streams
      setLoadingStatus('Fetching live channels...');
      const liveStreams = await fetchJson('action=get_live_streams');

      if (!Array.isArray(liveStreams)) {
        throw new Error("Invalid response format: Live streams is not an array. Check your username/password or Server URL.");
      }

      if (liveStreams.length === 0) {
        throw new Error("No live streams found for this account.");
      }

      const channels: Channel[] = [];
      const groups = new Set<string>();

      liveStreams.forEach((stream: any) => {
        if (!stream || !stream.stream_id) return;
        
        const catName = categoryMap[String(stream.category_id)] || 'Other Live Channels';
        groups.add(catName);

        channels.push({
          id: `xtream_live_${stream.stream_id}`,
          name: stream.name || `Live Stream ${stream.stream_id}`,
          logo: stream.stream_icon || undefined,
          group: catName,
          url: `${cleanUrl}/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${stream.stream_id}.ts`
        });
      });

      const sortedGroups = Array.from(groups).sort();
      const playlistData: PlaylistData = {
        channels,
        groups: sortedGroups
      };

      // Set live channels immediately to allow instant usage
      setPlaylist(playlistData);
      setBadChannels(new Set()); // Reset bad channels
      setTesterResults({}); // Clear any previous tester results
      setCurrentChannel(channels[0] || null);

      // Reset Filters
      setSearch('');
      setSelectedGroup('All');
      setHideBadChannels(false);

      if (isTesterMode) {
        setShowTester(true);
      } else {
        if (window.innerWidth < 768) {
          setMobileMenuOpen(true);
        }
      }
      
      // Store in History as a reconstructible M3U URL so it works seamlessly on reload
      const m3uUrl = `${cleanUrl}/get.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&output=ts`;
      addToHistory({
        name: customName || 'Xtream Server',
        url: m3uUrl,
        resolvedUrl: undefined,
        type: 'url'
      });

      setIsLoading(false);
      setLoadingStatus('');
      setError(null);

      // 3. Background asynchronous fetching of movies (VOD) so it never blocks the primary interface
      (async () => {
        try {
          console.log("Background check for movie categories started...");
          const vodCategories = await fetchJson('action=get_vod_categories');
          const vodCategoryMap: Record<string, string> = {};
          if (Array.isArray(vodCategories)) {
            vodCategories.forEach((cat: any) => {
              if (cat && cat.category_id !== undefined && cat.category_name) {
                vodCategoryMap[String(cat.category_id)] = cat.category_name;
              }
            });
          }

          console.log("Background fetch for movie streams started...");
          const vodStreams = await fetchJson('action=get_vod_streams');
          if (Array.isArray(vodStreams) && vodStreams.length > 0) {
            const vodChannels: Channel[] = [];
            const updatedGroups = new Set<string>(groups);

            vodStreams.forEach((stream: any) => {
              if (!stream || !stream.stream_id) return;
              
              const catName = vodCategoryMap[String(stream.category_id)] || 'Other Movies';
              updatedGroups.add(catName);

              const ext = stream.container_extension || 'mp4';
              vodChannels.push({
                id: `xtream_vod_${stream.stream_id}`,
                name: stream.name || `Movie ${stream.stream_id}`,
                logo: stream.stream_icon || undefined,
                group: catName,
                url: `${cleanUrl}/movie/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${stream.stream_id}.${ext}`
              });
            });

            // Safely append to the current playlist state
            setPlaylist(prev => {
              if (!prev) return prev;
              
              // Only append if movies are NOT already added to avoid duplication
              const hasVod = prev.channels.some(ch => ch.id.startsWith('xtream_vod_'));
              if (hasVod) return prev;

              const mergedChannels = [...prev.channels, ...vodChannels];
              const mergedGroups = Array.from(updatedGroups).sort();

              return {
                channels: mergedChannels,
                groups: mergedGroups
              };
            });
            console.log(`Background VOD fetch successfully loaded ${vodStreams.length} movies.`);
          }
        } catch (e) {
          console.warn("Could not fetch VOD streams/categories as background process, continuing with live channels only", e);
        }
      })();
    } catch (err: any) {
      console.warn("Xtream JSON API failed, falling back to direct M3U download URL...", err);
      
      // Fallback Strategy: directly download the M3U get.php and parse it
      setLoadingStatus('Attempting standard M3U download...');
      const m3uUrl = `${cleanUrl}/get.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&output=ts`;
      
      const safeFetch = async (u: string) => {
        const res = await window.fetch(u);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return { text: await res.text(), resolvedUrl: res.url };
      };

      const fetchViaAllOrigins = async (u: string) => {
        const res = await window.fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return { text: await res.text(), resolvedUrl: undefined };
      };

      try {
        let textContent = '';
        let resolvedUrl: string | undefined = undefined;

        // Try local security proxy first
        try {
          const res = await window.fetch(`/api/proxy/plaintext?url=${encodeURIComponent(m3uUrl)}`);
          if (res.ok) {
            textContent = await res.text();
          }
        } catch (eLocal) {
          console.warn("Local security proxy failed for M3U fallback, trying direct fetch...", eLocal);
        }

        if (!textContent) {
          // Try direct fetch
          try {
            const result = await safeFetch(m3uUrl);
            textContent = result.text;
            resolvedUrl = result.resolvedUrl;
          } catch (e1) {
            // Try AllOrigins
            try {
              const result = await fetchViaAllOrigins(m3uUrl);
              textContent = result.text;
            } catch (e2) {
              // Try CorsProxy.io
              try {
                const result = await safeFetch(`https://corsproxy.io/?${encodeURIComponent(m3uUrl)}`);
                textContent = result.text;
                resolvedUrl = result.resolvedUrl;
              } catch (e3) {
                // Try CodeTabs
                const result = await safeFetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(m3uUrl)}`);
                textContent = result.text;
                resolvedUrl = result.resolvedUrl;
              }
            }
          }
        }

        if (textContent) {
          addToHistory({
            name: customName || 'Xtream Server',
            url: m3uUrl,
            resolvedUrl,
            type: 'url'
          });
          processPlaylist(textContent);
        } else {
          throw new Error("No playlist data retrieved.");
        }
      } catch (fallbackErr) {
        console.error("All access strategies failed:", fallbackErr);
        setError(err.message || "Failed to connect to Xtream Codes server. Check URL, username, and password.");
        setIsLoading(false);
        setLoadingStatus('');
      }
    }
  };

  const fetchFromUrl = async (url: string, customName?: string) => {
    setIsLoading(true);
    setLoadingStatus('Connecting...');
    setError(null);

    // Intercept Xtream Codes URLs
    const isXtreamUrl = url.includes('/get.php?') && url.includes('username=') && url.includes('password=');
    if (isXtreamUrl) {
      try {
        const urlObj = new URL(url);
        const cleanUrl = `${urlObj.protocol}//${urlObj.host}`;
        const username = urlObj.searchParams.get('username') || '';
        const password = urlObj.searchParams.get('password') || '';
        await fetchXtreamPlaylist(cleanUrl, customName || 'Xtream API Server', username, password);
        return;
      } catch (e) {
        console.warn("Failed to parse Xtream URL for API fetch, continuing with raw M3U streaming fetch:", e);
      }
    }

    // Use window.fetch explicitly to avoid potential shadowing issues
    const safeFetch = async (u: string) => {
      const res = await window.fetch(u);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { text: await res.text(), resolvedUrl: res.url };
    };

    const fetchViaAllOrigins = async (u: string) => {
      // Try JSON API first to get resolved URL
      try {
        const res = await window.fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(u)}`);
        if (res.ok) {
          const json = await res.json();
          return { text: json.contents, resolvedUrl: json.status.url };
        }
      } catch (e) {
        console.warn("AllOrigins JSON failed, falling back to raw...");
      }
      
      // Fallback to raw mode
      const res = await window.fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { text: await res.text(), resolvedUrl: undefined };
    };

    try {
      // Strategy 0: Local Server Security Proxy (Bypasses CORS + Mixed Content + sets custom User-Agent)
      try {
        setLoadingStatus('Streaming via Security Proxy...');
        const res = await window.fetch(`/api/proxy/plaintext?url=${encodeURIComponent(url)}`);
        if (res.ok) {
          const text = await res.text();
          addToHistory({ name: customName || url.split('/').pop() || 'Remote Playlist', url, resolvedUrl: undefined, type: 'url' });
          processPlaylist(text);
          return;
        }
      } catch (e) {
        console.warn("Local server security proxy failed, trying Direct Fetch...", e);
      }

      // Strategy 1: Direct Fetch
      try {
        const { text, resolvedUrl } = await safeFetch(url);
        addToHistory({ name: customName || url.split('/').pop() || 'Remote Playlist', url, resolvedUrl, type: 'url' });
        processPlaylist(text);
        return;
      } catch (e) {
        console.warn("Direct fetch failed, attempting proxies...", e);
      }

      // Strategy 2: AllOrigins
      try {
        setLoadingStatus('Routing via Proxy 1...');
        const { text, resolvedUrl } = await fetchViaAllOrigins(url);
        addToHistory({ name: customName || url.split('/').pop() || 'Remote Playlist', url, resolvedUrl, type: 'url' });
        processPlaylist(text);
        return;
      } catch (e) {
        console.warn("Proxy 1 failed...", e);
      }

      // Strategy 3: CorsProxy.io
      try {
        setLoadingStatus('Routing via Proxy 2...');
        const { text, resolvedUrl } = await safeFetch(`https://corsproxy.io/?${encodeURIComponent(url)}`);
        addToHistory({ name: customName || url.split('/').pop() || 'Remote Playlist', url, resolvedUrl, type: 'url' });
        processPlaylist(text);
        return;
      } catch (e) {
        console.warn("Proxy 2 failed...", e);
      }

      // Strategy 4: CodeTabs Proxy
      try {
        setLoadingStatus('Routing via Proxy 3...');
        const { text, resolvedUrl } = await safeFetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`);
        addToHistory({ name: customName || url.split('/').pop() || 'Remote Playlist', url, resolvedUrl, type: 'url' });
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

  const loadDemo = (url: string, customName?: string) => {
    setInputMode('url');
    setUrlInput(url);
    fetchFromUrl(url, customName);
  };

  const handleXtreamSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!xtreamUrl || !xtreamUsername || !xtreamPassword) return;

    let cleanUrl = xtreamUrl.trim();
    cleanUrl = cleanUrl.replace(/\/+$/, '');

    if (!/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = `http://${cleanUrl}`;
    }

    const playlistName = xtreamName.trim() || 'Xtream Server';
    fetchXtreamPlaylist(cleanUrl, playlistName, xtreamUsername.trim(), xtreamPassword.trim());
  };


  const markChannelAsBad = (id: string) => {
    setBadChannels(prev => {
      const newSet = new Set(prev);
      newSet.add(id);
      return newSet;
    });
  };

  const handleAutoFailover = (failedId: string) => {
    if (!currentChannel || !playlist) return;

    // Mark current as bad
    markChannelAsBad(failedId);

    // Find all alternatives for the same channel name
    const alternatives = playlist.channels.filter(ch => ch.name === currentChannel.name);
    
    // Find the next alternative that isn't already marked bad
    const nextAlt = alternatives.find(ch => !badChannels.has(ch.id) && ch.id !== failedId);

    if (nextAlt) {
      setError(`Stream failed. Trying alternative server...`);
      setCurrentChannel(nextAlt);
      // Auto-clear the error toast after 3 seconds
      setTimeout(() => setError(null), 3000);
    } else {
      setError(`All servers failed for ${currentChannel.name}. Moving to next channel...`);
      handleNavigate('next');
      setTimeout(() => setError(null), 3000);
    }
  };

  const toggleFavorite = (id: string) => {
    setFavorites(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // --- Filter Logic ---
  const filteredChannels = useMemo(() => {
    if (!playlist) return [];
    return playlist.channels.filter(ch => {
      if (hideBadChannels && badChannels.has(ch.id)) return false;
      if (showOnlyFavorites && !favorites.has(ch.id)) return false;
      const matchesSearch = ch.name.toLowerCase().includes(search.toLowerCase());
      const matchesGroup = selectedGroup === 'All' || ch.group === selectedGroup;
      return matchesSearch && matchesGroup;
    });
  }, [playlist, search, selectedGroup, hideBadChannels, badChannels, favorites, showOnlyFavorites]);

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
          <div className="flex items-center gap-2">
            {!showTester && (
              <button 
                onClick={() => setShowTester(true)}
                className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors flex items-center gap-2 focus:ring-2 focus:ring-indigo-500"
              >
                <ShieldCheck className="w-3 h-3" />
                <span>Tester</span>
              </button>
            )}
            <button 
              onClick={() => { 
                setPlaylist(null); 
                setCurrentChannel(null); 
                setMobileMenuOpen(false); 
                setShowTester(false);
                setIsTesterMode(false);
              }} 
              className="px-3 py-1.5 text-xs font-medium bg-slate-800 text-slate-300 rounded hover:bg-slate-700 hover:text-white transition-colors flex items-center gap-2 focus:ring-2 focus:ring-indigo-500"
            >
              <X className="w-3 h-3" />
              <span className="hidden sm:inline">Clear Playlist</span>
              <span className="sm:hidden">Clear</span>
            </button>
          </div>
        )}
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {!playlist ? (
          // Empty State / Input Area
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in duration-500 z-10 overflow-y-auto">
            <div className="max-w-2xl w-full space-y-6">
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold text-white">
                  {isTesterMode ? 'Playlist Tester' : 'Load Your Playlist'}
                </h2>
                <p className="text-slate-400">
                  {isTesterMode 
                    ? 'Test every channel in your playlist for playback.' 
                    : 'Select a method to load channels.'}
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl shadow-lg space-y-6">
                
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setIsTesterMode(false)}
                      className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${!isTesterMode ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      Player
                    </button>
                    <button 
                      onClick={() => setIsTesterMode(true)}
                      className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${isTesterMode ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      Tester
                    </button>
                  </div>
                </div>
                
                 {/* Tabs */}
                <div className="flex p-1 bg-slate-950 rounded-lg gap-1 overflow-x-auto">
                  <button 
                    onClick={() => setInputMode('url')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-md transition-all focus:ring-2 focus:ring-indigo-500 focus:outline-none shrink-0 ${inputMode === 'url' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                  >
                    <LinkIcon className="w-3.5 h-3.5" /> URL
                  </button>
                  <button 
                    onClick={() => setInputMode('file')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-md transition-all focus:ring-2 focus:ring-indigo-500 focus:outline-none shrink-0 ${inputMode === 'file' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                  >
                    <Upload className="w-3.5 h-3.5" /> Upload
                  </button>
                  <button 
                    onClick={() => setInputMode('text')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-md transition-all focus:ring-2 focus:ring-indigo-500 focus:outline-none shrink-0 ${inputMode === 'text' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                  >
                    <FileText className="w-3.5 h-3.5" /> Paste
                  </button>
                  <button 
                    onClick={() => setInputMode('xtream')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-md transition-all focus:ring-2 focus:ring-indigo-500 focus:outline-none shrink-0 ${inputMode === 'xtream' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                  >
                    <Server className="w-3.5 h-3.5 text-indigo-400 group-hover:text-white" /> Xtream
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

                      {/* History Section */}
                      {history.length > 0 && (
                        <div className="pt-6 border-t border-slate-800 mt-6">
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                              <History className="w-3 h-3" /> Recent Playlists
                            </h3>
                            <button 
                              onClick={() => setHistory([])}
                              className="text-[10px] text-slate-600 hover:text-red-400 transition-colors"
                            >
                              Clear All
                            </button>
                          </div>
                          <div className="space-y-2">
                            {history.map((item) => (
                              <div key={item.id} className="group flex items-center gap-3 p-2 bg-slate-950 border border-slate-800 rounded-lg hover:border-indigo-500/30 transition-all">
                                <div className="p-2 bg-slate-900 rounded-md text-slate-500 group-hover:text-indigo-400 transition-colors">
                                  <Clock className="w-4 h-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <button 
                                    onClick={() => item.url && loadDemo(item.url, item.name)}
                                    className="w-full text-left"
                                  >
                                    <p className="text-xs font-medium text-slate-300 truncate group-hover:text-white">{item.name}</p>
                                    <p className="text-[10px] text-slate-600 truncate">{item.url}</p>
                                  </button>
                                  {item.resolvedUrl && item.resolvedUrl !== item.url && (
                                    <div className="flex items-center gap-1.5 mt-1">
                                      <span className="text-[8px] bg-green-500/20 text-green-400 px-1 rounded font-bold uppercase tracking-tighter">Direct</span>
                                      <p className="text-[9px] text-slate-500 truncate cursor-help" title={item.resolvedUrl}>{item.resolvedUrl}</p>
                                      <button 
                                        onClick={() => {
                                          navigator.clipboard.writeText(item.resolvedUrl || '');
                                          setError("Direct URL copied to clipboard!");
                                          setTimeout(() => setError(null), 2000);
                                        }}
                                        className="text-[9px] text-indigo-400 hover:text-indigo-300 ml-auto"
                                      >
                                        Copy
                                      </button>
                                    </div>
                                  )}
                                </div>
                                <button 
                                  onClick={() => removeFromHistory(item.id)}
                                  className="p-2 text-slate-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
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

                  {/* XTREAM MODE */}
                  {inputMode === 'xtream' && (
                    <form onSubmit={handleXtreamSubmit} className="space-y-4">
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Server Name (e.g. Xtreamtv)</label>
                            <input
                              type="text"
                              placeholder="Xtreamtv"
                              value={xtreamName}
                              onChange={(e) => setXtreamName(e.target.value)}
                              className="w-full bg-slate-950 text-white px-3 py-2.5 rounded-lg border border-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-xs transition-all"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Server URL / Address</label>
                            <input
                              type="text"
                              placeholder="http://premimum.online:80"
                              value={xtreamUrl}
                              onChange={(e) => setXtreamUrl(e.target.value)}
                              className="w-full bg-slate-950 text-white px-3 py-2.5 rounded-lg border border-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-xs transition-all animate-none"
                              required
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1 animate-none">Username</label>
                            <input
                              type="text"
                              placeholder="Username"
                              value={xtreamUsername}
                              onChange={(e) => setXtreamUsername(e.target.value)}
                              className="w-full bg-slate-950 text-white px-3 py-2.5 rounded-lg border border-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-xs transition-all animate-none"
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1 animate-none">Password</label>
                            <input
                              type="password"
                              placeholder="Password"
                              value={xtreamPassword}
                              onChange={(e) => setXtreamPassword(e.target.value)}
                              className="w-full bg-slate-950 text-white px-3 py-2.5 rounded-lg border border-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-xs transition-all animate-none"
                              required
                            />
                          </div>
                        </div>
                        <p className="text-[10px] text-slate-500 leading-normal mb-1">
                          Provide a server address (should start with "http://" or "https://") along with your credentials. We construct the live API query to load your channels directly.
                        </p>
                      </div>

                      <button 
                        type="submit" 
                        disabled={isLoading || !xtreamUrl || !xtreamUsername || !xtreamPassword}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2 focus:ring-2 focus:ring-indigo-500"
                      >
                         {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                         {loadingStatus || 'Log In & Load'}
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
        ) : showTester ? (
          <div className="absolute inset-0 z-20">
            <PlaylistTester 
              channels={playlist.channels} 
              onBack={() => setShowTester(false)} 
              onPlay={(channel) => {
                setCurrentChannel(channel);
                setShowTester(false);
                setMobileMenuOpen(false);
              }}
              results={testerResults}
              setResults={setTesterResults}
              setBadChannels={setBadChannels}
            />
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
                showOnlyFavorites={showOnlyFavorites}
                setShowOnlyFavorites={setShowOnlyFavorites}
                onSelect={setCurrentChannel} 
                currentChannelId={currentChannel?.id}
                badChannels={badChannels}
                favorites={favorites}
                onToggleFavorite={toggleFavorite}
                testerResults={testerResults}
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
                      showOnlyFavorites={showOnlyFavorites}
                      setShowOnlyFavorites={setShowOnlyFavorites}
                      onSelect={(ch) => {
                        setCurrentChannel(ch);
                        setMobileMenuOpen(false);
                      }}
                      currentChannelId={currentChannel?.id}
                      badChannels={badChannels}
                      favorites={favorites}
                      onToggleFavorite={toggleFavorite}
                      testerResults={testerResults}
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
                  onAutoFailover={handleAutoFailover}
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