import { Channel, PlaylistData } from '../types';

export const parseM3U = (content: string): PlaylistData => {
  // Remove BOM if present
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }

  const lines = content.split(/\r?\n/);
  const channels: Channel[] = [];
  const groups = new Set<string>();

  // State for the parser machine
  let currentName: string | null = null;
  let currentLogo: string | null = null;
  let currentGroup: string | null = null;
  let currentGroupDirective: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();

    if (!line) continue;

    if (line.startsWith('#')) {
      const lowerLine = line.toLowerCase();
      
      // Basic info line: #EXTINF:duration attributes,Title
      if (lowerLine.startsWith('#extinf:')) {
        // Reset per-channel metadata for a new entry
        currentName = null;
        currentLogo = null;
        currentGroup = null;

        const firstCommaIndex = line.indexOf(',');
        if (firstCommaIndex !== -1) {
          // Title is everything after the first comma
          const titlePart = line.substring(firstCommaIndex + 1).trim();
          if (titlePart) currentName = titlePart;

          // Attributes are before the comma
          const metaPart = line.substring(0, firstCommaIndex);
          
          // Regex to match key="value" OR key=value
          // Handles cases like: tvg-logo="url" group-title="Group Name"
          const attrRegex = /([a-zA-Z0-9-_]+)=("[^"]*"|[^,\s]+)/g;
          
          let match;
          while ((match = attrRegex.exec(metaPart)) !== null) {
            const key = match[1].toLowerCase();
            let val = match[2];
            
            // Strip quotes
            if (val.startsWith('"') && val.endsWith('"')) {
              val = val.slice(1, -1);
            }

            if (key === 'tvg-logo' || key === 'logo') currentLogo = val;
            if (key === 'group-title') currentGroup = val;
            if (key === 'tvg-name' && !currentName) currentName = val;
          }
        } else {
            // Fallback if no comma found: split by colon
            const parts = line.split(':');
            if (parts.length > 2) {
                // assume #EXTINF:duration metadata...
                currentName = parts.slice(2).join(':').trim();
            } else if (parts.length > 1) {
                currentName = parts[1].trim();
            }
        }
      } 
      // Group directive: #EXTGRP: GroupName
      else if (lowerLine.startsWith('#extgrp:')) {
        currentGroupDirective = line.substring(8).trim();
      }
      // Skip common HLS Master Playlist tags to avoid adding segments as channels
      else if (
        lowerLine.startsWith('#ext-x-') || 
        lowerLine.startsWith('#ext-m3u') || 
        lowerLine.startsWith('#ext-x-stream-inf')
      ) {
        continue;
      }
    } else {
      // It's a URL (assuming it doesn't start with #)
      const url = line;
      
      // Skip if the line doesn't look like a URL (very BASIC heuristic)
      // Some parsers require http://, but we'll be more lenient
      if (!url.includes('://') && !url.includes('.') && !url.startsWith('/')) {
        continue;
      }
      
      // Determine final properties
      const name = currentName || `Channel ${channels.length + 1}`;
      
      // Group priority: 1. group-title attribute, 2. #EXTGRP directive, 3. Default
      const group = currentGroup || currentGroupDirective || 'Uncategorized';
      
      // Generate ID
      const id = Math.random().toString(36).substring(2, 10) + i;

      channels.push({
        id,
        name,
        logo: currentLogo || undefined,
        group,
        url
      });
      
      groups.add(group);

      // Reset state for next channel
      currentName = null;
      currentLogo = null;
      currentGroup = null;
      currentGroupDirective = null; 
    }
  }

  return {
    channels,
    groups: Array.from(groups).sort()
  };
};
