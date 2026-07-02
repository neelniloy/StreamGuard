const line = '#EXTINF:-1 group-title="┃ASIA┃ BANGLA" tvg-logo="http://picon.tivi-ott.net:25461/picon/ASIA/BANGLA/MY CINEMA TV.png", ┃BANGLA┃ MY CINEMA TV';
const metaPart = line.substring(0, line.indexOf(','));
const attrRegex = /([a-zA-Z0-9-_]+)=("[^"]*"|[^,\s]+)/g;
let match;
while ((match = attrRegex.exec(metaPart)) !== null) {
  console.log(match[1], "=>", match[2]);
}
