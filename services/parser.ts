import { Channel, PlaylistData } from '../types';

export const parseM3U = (content: string): PlaylistData => {
  const lines = content.split(/\r?\n/);
  const channels: Channel[] = [];
  const groups = new Set<string>();

  // State for the parser machine
  let currentName: string | null = null;
  let currentLogo: string | null = null;
  let currentGroup: string | null = null;
  let currentGroupDirective: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) continue;

    if (line.startsWith('#')) {
      const lowerLine = line.toLowerCase();
      
      if (lowerLine.startsWith('#extinf:')) {
        // Reset per-channel metadata
        currentName = null;
        currentLogo = null;
        currentGroup = null;

        // Strategy: standard M3U is "#EXTINF:duration attributes,Title"
        // 1. Split into metadata part and title part based on the *first* comma
        //    (We assume the comma separating duration/attrs from title is the first one, 
        //    or we might parse attributes and assume everything after is title)
        
        const firstCommaIndex = line.indexOf(',');
        if (firstCommaIndex !== -1) {
          // Title is everything after the first comma
          const titlePart = line.substring(firstCommaIndex + 1).trim();
          if (titlePart) currentName = titlePart;

          // Attributes are before the comma (excluding #EXTINF:duration)
          // We need to parse key="value" pairs.
          const metaPart = line.substring(0, firstCommaIndex);
          
          // Regex to match key="value" OR key=value
          // Matches:
          // 1. key (alphanumeric+dashes)
          // 2. =
          // 3. "value" (quoted) OR non-whitespace-non-comma (unquoted)
          const attrRegex = /([a-zA-Z0-9-_]+)=("[^"]*"|[^,\s]+)/g;
          
          let match;
          while ((match = attrRegex.exec(metaPart)) !== null) {
            const key = match[1].toLowerCase();
            let val = match[2];
            
            // Strip quotes
            if (val.startsWith('"') && val.endsWith('"')) {
              val = val.slice(1, -1);
            }

            if (key === 'tvg-logo') currentLogo = val;
            if (key === 'group-title') currentGroup = val;
            // Sometimes tvg-name is used if the title part is missing/garbage
            if (key === 'tvg-name' && !currentName) currentName = val;
          }
        } else {
            // Fallback if no comma found (rare)
            const parts = line.split(':');
            if (parts.length > 1) currentName = parts[1].trim();
        }
      } 
      else if (lowerLine.startsWith('#extgrp:')) {
        // Handle #EXTGRP: GroupName
        currentGroupDirective = line.substring(8).trim();
      }
    } else {
      // It's a URL (assuming it doesn't start with #)
      const url = line;
      
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

      // Reset state that shouldn't persist to the next channel implicitly
      // (Note: EXTGRP usually applies to the next channel, but some formats imply grouping. 
      // We'll keep currentGroupDirective active until changed? No, safest is reset to avoid bleed.)
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