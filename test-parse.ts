import { readFileSync } from 'fs';
import { parseM3U } from './services/parser';
const text = readFileSync('bd-test.m3u', 'utf8');
const result = parseM3U(text);
console.log(result.channels.length);
