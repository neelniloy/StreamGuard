const url = 'https://raw.githubusercontent.com/IPTVFlixBD/OopsTv/refs/heads/main/bd-test.m3u';
fetch(url).then(res => res.text()).then(text => {
  console.log("Starts with #EXTM3U:", text.trim().startsWith("#EXTM3U"));
  console.log("Length:", text.length);
  import('./services/parser.js').then(mod => {
    const data = mod.parseM3U(text);
    console.log("Channels:", data.channels.length);
  }).catch(e => console.error("Could not import parser", e));
});
