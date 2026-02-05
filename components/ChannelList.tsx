import React, { useState, useEffect, useRef } from 'react';
import { Channel } from '../types';
import { Search, MonitorPlay, Tv, Filter, Loader2, Eye, EyeOff, AlertCircle } from 'lucide-react';

interface ChannelListProps {
  channels: Channel[]; // Pre-filtered channels
  groups: string[];
  search: string;
  setSearch: (s: string) => void;
  selectedGroup: string;
  setSelectedGroup: (g: string) => void;
  hideBadChannels: boolean;
  setHideBadChannels: (b: boolean) => void;
  onSelect: (channel: Channel) => void;
  currentChannelId?: string;
  badChannels?: Set<string>;
}

const ITEMS_PER_PAGE = 50;

export const ChannelList: React.FC<ChannelListProps> = ({ 
  channels, 
  groups,
  search,
  setSearch,
  selectedGroup,
  setSelectedGroup,
  hideBadChannels,
  setHideBadChannels,
  onSelect, 
  currentChannelId, 
  badChannels = new Set() 
}) => {
  const [isGroupMenuOpen, setIsGroupMenuOpen] = useState(false);
  const firstChannelRef = useRef<HTMLButtonElement>(null);
  
  // Pagination State
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);
  const observerTarget = useRef<HTMLDivElement>(null);

  // Reset pagination when the channel list changes
  useEffect(() => {
    setVisibleCount(ITEMS_PER_PAGE);
  }, [channels]);

  // TV UX: Auto-focus first channel when list becomes available and no channel is selected yet
  useEffect(() => {
    if (channels.length > 0 && !currentChannelId && firstChannelRef.current) {
        // Short timeout to ensure render is complete
        setTimeout(() => {
            // Check if active element is not already in the list
            if (!document.activeElement?.closest('.channel-list-container')) {
                 firstChannelRef.current?.focus();
            }
        }, 100);
    }
  }, [channels, currentChannelId]);

  const displayChannels = channels.slice(0, visibleCount);
  const hasMore = visibleCount < channels.length;

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore) {
          setVisibleCount((prev) => Math.min(prev + ITEMS_PER_PAGE, channels.length));
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [hasMore, channels.length]);

  return (
    <div className="channel-list-container flex flex-col h-full bg-slate-900 border-r border-slate-800">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 space-y-3 shrink-0">
        <h2 className="text-slate-100 font-semibold flex items-center gap-2">
          <Tv className="w-5 h-5 text-indigo-500" />
          <span>Channels</span>
          <span className="text-xs font-normal text-slate-500 ml-auto">{channels.length} found</span>
        </h2>
        
        <div className="relative">
          <Search className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search channels..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-800 text-slate-200 text-sm pl-9 pr-4 py-2.5 rounded-lg border border-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 transition-all"
          />
        </div>

        <div className="flex gap-2">
            <div className="relative flex-1">
              <button
                onClick={() => setIsGroupMenuOpen(!isGroupMenuOpen)}
                className="w-full flex items-center justify-between bg-slate-800 text-slate-300 text-xs px-3 py-2.5 rounded border border-slate-700 hover:bg-slate-750 transition-colors focus:ring-2 focus:ring-indigo-500"
              >
                <span className="truncate font-medium">{selectedGroup === 'All' ? 'All Groups' : selectedGroup}</span>
                <Filter className="w-3 h-3 ml-2 opacity-70" />
              </button>
              
              {isGroupMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setIsGroupMenuOpen(false)}></div>
                  <div className="absolute top-full left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-slate-800 border border-slate-700 rounded-md shadow-xl z-20 custom-scrollbar">
                    <div 
                      className={`px-3 py-3 text-sm text-slate-300 hover:bg-slate-700 cursor-pointer focus:bg-slate-700 outline-none ${selectedGroup === 'All' ? 'bg-slate-700 text-white' : ''}`}
                      onClick={() => { setSelectedGroup('All'); setIsGroupMenuOpen(false); }}
                      tabIndex={0}
                    >
                      All Groups
                    </div>
                    {groups.map(g => (
                      <div
                        key={g}
                        className={`px-3 py-3 text-sm text-slate-300 hover:bg-slate-700 cursor-pointer truncate focus:bg-slate-700 outline-none ${selectedGroup === g ? 'bg-slate-700 text-white' : ''}`}
                        onClick={() => { setSelectedGroup(g); setIsGroupMenuOpen(false); }}
                        tabIndex={0}
                      >
                        {g}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <button 
                onClick={() => setHideBadChannels(!hideBadChannels)}
                className={`flex items-center justify-center px-3 py-2 rounded border transition-colors focus:ring-2 focus:ring-indigo-500 ${hideBadChannels ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'}`}
                title="Toggle Visibility of Offline Channels"
            >
                {hideBadChannels ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {displayChannels.length === 0 ? (
          <div className="p-8 text-center flex flex-col items-center justify-center h-full">
            <Search className="w-8 h-8 text-slate-700 mb-2" />
            <p className="text-slate-500 text-sm">No channels found</p>
            <p className="text-slate-600 text-xs mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/50 pb-4">
            {displayChannels.map((ch, index) => {
              const isBad = badChannels.has(ch.id);
              return (
                <button
                  key={ch.id}
                  ref={index === 0 ? firstChannelRef : null}
                  onClick={() => onSelect(ch)}
                  className={`w-full text-left px-4 py-4 flex items-center gap-3 hover:bg-slate-800/50 transition-colors group focus:bg-slate-800 focus:outline-none focus:ring-inset focus:ring-2 focus:ring-indigo-500 ${currentChannelId === ch.id ? 'bg-slate-800 border-l-4 border-indigo-500 pl-[14px]' : 'border-l-4 border-transparent pl-[14px]'} ${isBad ? 'opacity-50' : ''}`}
                >
                  <div className="w-10 h-10 bg-slate-950 rounded-md flex items-center justify-center shrink-0 overflow-hidden border border-slate-800/50 relative">
                    {ch.logo ? (
                      <img src={ch.logo} alt={ch.name} className="w-full h-full object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />
                    ) : (
                      <Tv className="w-5 h-5 text-slate-700 group-hover:text-slate-500 transition-colors" />
                    )}
                    {isBad && (
                        <div className="absolute inset-0 bg-slate-900/80 flex items-center justify-center">
                            <AlertCircle className="w-5 h-5 text-red-500" />
                        </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-base font-medium truncate flex items-center gap-2 ${currentChannelId === ch.id ? 'text-indigo-400' : isBad ? 'text-red-400 decoration-slate-500' : 'text-slate-200'}`}>
                      {ch.name}
                      {isBad && <span className="text-[9px] uppercase border border-red-500/50 text-red-500 px-1 rounded bg-red-500/10">Offline</span>}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                       <span className="text-[11px] text-slate-500 truncate bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800/50">
                          {ch.group || 'N/A'}
                       </span>
                    </div>
                  </div>
                  {currentChannelId === ch.id && (
                    <MonitorPlay className="w-5 h-5 text-indigo-500 ml-auto shrink-0 animate-pulse" />
                  )}
                </button>
              );
            })}
            
            {hasMore && (
              <div ref={observerTarget} className="p-4 flex justify-center">
                 <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};