#!/usr/bin/env node
/*
 * Сборка одностраничных версий игры:
 *   dist/slovokrug.html — полностью автономный файл (открывается даже с file://);
 *   dist/artifact.html  — тело страницы без <!DOCTYPE>/<html>/<head>/<body>
 *                         (для публикации как Claude Artifact).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

let html = read('index.html');

html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) =>
  '<style>\n' + read(href) + '</style>');

html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) =>
  '<script>\n' + read(src) + '</script>');

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'dist', 'slovokrug.html'), html);

const bodyMatch = html.match(/<body>([\s\S]*)<\/body>/);
const styleMatch = html.match(/<style>[\s\S]*?<\/style>/);
const artifact = '<title>Словокруг</title>\n' + styleMatch[0] + '\n' + bodyMatch[1].trim() + '\n';
fs.writeFileSync(path.join(ROOT, 'dist', 'artifact.html'), artifact);

console.log('dist/slovokrug.html: ' + (html.length / 1024).toFixed(1) + ' KiB');
console.log('dist/artifact.html:  ' + (artifact.length / 1024).toFixed(1) + ' KiB');
