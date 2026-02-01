import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Channel, PlaylistData } from '../types';
import { Search, MonitorPlay, Tv, Filter, Loader2 } from 'lucide-react';

interface ChannelListProps {
  data: PlaylistData;
  onSelect: (channel: Channel) => void;
  currentChannelId?: string;
}

const ITEMS_PER_PAGE = 50;

export const ChannelList: React.FC<ChannelListProps> = ({ data, onSelect, currentChannelId }) => {
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('All');
  const [isGroupMenuOpen, setIsGroupMenuOpen] = useState(false);
  
  // Pagination State
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);
  const observerTarget = useRef<HTMLDivElement>(null);

  // Reset pagination when filters change
  useEffect(() => {
    setVisibleCount(ITEMS_PER_PAGE);
  }, [search, selectedGroup, data]);

  const filteredChannels = useMemo(() => {
    return data.channels.filter(ch => {
      const matchesSearch = ch.name.toLowerCase().includes(search.toLowerCase());
      const matchesGroup = selectedGroup === 'All' || ch.group === selectedGroup;
      return matchesSearch && matchesGroup;
    });
  }, [data.channels, search, selectedGroup]);

  const displayChannels = filteredChannels.slice(0, visibleCount);
  const hasMore = visibleCount < filteredChannels.length;

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore) {
          setVisibleCount((prev) => Math.min(prev + ITEMS_PER_PAGE, filteredChannels.length));
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [hasMore, filteredChannels.length]);

  return (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 space-y-3 shrink-0">
        <h2 className="text-slate-100 font-semibold flex items-center gap-2">
          <Tv className="w-5 h-5 text-indigo-500" />
          <span>Channels</span>
          <span className="text-xs font-normal text-slate-500 ml-auto">{filteredChannels.length} found</span>
        </h2>
        
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search channels..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-800 text-slate-200 text-sm pl-9 pr-4 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
          />
        </div>

        <div className="relative">
          <button
             onClick={() => setIsGroupMenuOpen(!isGroupMenuOpen)}
             className="w-full flex items-center justify-between bg-slate-800 text-slate-300 text-xs px-3 py-2 rounded border border-slate-700 hover:bg-slate-750 transition-colors"
          >
            <span className="truncate font-medium">{selectedGroup === 'All' ? 'All Groups' : selectedGroup}</span>
            <Filter className="w-3 h-3 ml-2 opacity-70" />
          </button>
          
          {isGroupMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setIsGroupMenuOpen(false)}></div>
              <div className="absolute top-full left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-slate-800 border border-slate-700 rounded-md shadow-xl z-20 custom-scrollbar">
                <div 
                  className={`px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 cursor-pointer ${selectedGroup === 'All' ? 'bg-slate-700 text-white' : ''}`}
                  onClick={() => { setSelectedGroup('All'); setIsGroupMenuOpen(false); }}
                >
                  All Groups
                </div>
                {data.groups.map(g => (
                  <div
                    key={g}
                    className={`px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 cursor-pointer truncate ${selectedGroup === g ? 'bg-slate-700 text-white' : ''}`}
                    onClick={() => { setSelectedGroup(g); setIsGroupMenuOpen(false); }}
                  >
                    {g}
                  </div>
                ))}
              </div>
            </>
          )}
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
            {displayChannels.map(ch => (
              <button
                key={ch.id}
                onClick={() => onSelect(ch)}
                className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-800/50 transition-colors group ${currentChannelId === ch.id ? 'bg-slate-800 border-l-2 border-indigo-500' : 'border-l-2 border-transparent'}`}
              >
                <div className="w-8 h-8 bg-slate-950 rounded flex items-center justify-center shrink-0 overflow-hidden border border-slate-800/50">
                  {ch.logo ? (
                    <img src={ch.logo} alt={ch.name} className="w-full h-full object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />
                  ) : (
                    <Tv className="w-4 h-4 text-slate-700 group-hover:text-slate-500 transition-colors" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium truncate ${currentChannelId === ch.id ? 'text-indigo-400' : 'text-slate-200'}`}>
                    {ch.name}
                  </p>
                  <div className="flex items-center gap-2">
                     <span className="text-[10px] text-slate-500 truncate bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800/50">
                        {ch.group || 'N/A'}
                     </span>
                  </div>
                </div>
                {currentChannelId === ch.id && (
                  <MonitorPlay className="w-4 h-4 text-indigo-500 ml-auto shrink-0 animate-pulse" />
                )}
              </button>
            ))}
            
            {hasMore && (
              <div ref={observerTarget} className="p-4 flex justify-center">
                 <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};