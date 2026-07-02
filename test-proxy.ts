import { parseM3U } from './services/parser';
fetch("http://localhost:3000/api/proxy/plaintext?url=https%3A%2F%2Fraw.githubusercontent.com%2FIPTVFlixBD%2FOopsTv%2Frefs%2Fheads%2Fmain%2Fbd-test.m3u")
.then(res => res.text())
.then(text => {
  console.log("Length:", text.length);
  const data = parseM3U(text);
  console.log("Channels:", data.channels.length);
});
