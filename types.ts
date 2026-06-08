export interface Channel {
  id: string;
  name: string;
  logo?: string;
  group?: string;
  url: string;
}

export interface PlaylistData {
  channels: Channel[];
  groups: string[];
}

export type PlaybackState = 'idle' | 'loading' | 'playing' | 'error';

export interface HistoryItem {
  id: string;
  name: string;
  url?: string;
  resolvedUrl?: string;
  type: 'url' | 'file' | 'text';
  timestamp: number;
}
