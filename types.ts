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
