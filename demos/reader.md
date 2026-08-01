#!/usr/bin/env jsmdcui

# File List Reader / 檔案列表閱讀器

Enter a local directory, then press Enter or choose **List directory**.
輸入本機目錄後按 Enter，或選擇「列出目錄」。

```text#directory @keydown="directoryKey(event)"
.
```

- [List directory / 列出目錄](javascript:listDirectory())

## File List / 檔案列表

````js template
---
filelist: []
listPage: 0
---
const size = 10
const files = Array.isArray(data.filelist) ? data.filelist : []
const pages = Math.max(1, Math.ceil(files.length / size))
const page = Math.max(0, Math.min(Number(data.listPage) || 0, pages - 1))
let markdown = `Page ${page + 1} / ${pages} · ${files.length} files\n\n`
for (const file of files.slice(page * size, page * size + size)) {
  const label = String(file.name).replaceAll('\\', '\\\\').replaceAll('[', '\\[').replaceAll(']', '\\]')
  const value = encodeURIComponent(String(file.value))
  markdown += `- [${label}](javascript:selectFile(decodeURIComponent('${value}')))\n`
}
if (!files.length) markdown += '- *(No files / 沒有檔案)*\n'
return markdown
````

## Selected File/URL 已選檔案/網址

```text#selected

```

## Controls / 控制

| Previous page | Previous | Next | Next page | Clear selection |
| --- | --- | --- | --- | --- |
| [上一頁](javascript:changeListPage(-1)) | [上一個](javascript:selectRelative(-1)) | [下一個](javascript:selectRelative(1)) | [下一頁](javascript:changeListPage(1)) | [清除已選](javascript:clearSelection()) |
| [載入](javascript:loadSelected()) | [上一章](javascript:loadRelative(-1)) | [下一章](javascript:loadRelative(1)) | [停止朗讀](javascript:stopReading()) | [朗讀](javascript:readFromCurrentPage()) |

## Document Reader / 文件閱讀器
- asdf = prev page
- hjkl = next page

### More info click 'M' 更多說明按'M'

Focus the reader and use the left half of QWERTY, Left/Up, or PageUp for the
previous page. Use the right half of QWERTY, Right/Down, or PageDown for the
next page.

將遊標放在閱讀框；QWERTY 左半邊、左／上方向鍵或 PageUp 切到上一頁，右半邊、
右／下方向鍵或 PageDown 切到下一頁。

### Document content

```textarea#reader @keydown.prevent="readerKey(event)"












```

```text#reader-status
Not loaded / 尚未載入
```

```js front
const PAGE_ROWS = 12;
const PAGE_COLUMNS = 64;
const LEFT_KEYS = new Set([
  ...'`12345qwerasdfgzxcvb',
  'escape', 'tab',
]);
const RIGHT_KEYS = new Set([
  ...'67890-=uiop[]\\hjkl;\'nm,./',
  'backspace', 'enter', 'delete', 'home', 'end',
]);

let pages = [''];
let pageIndex = 0;
let selectedIndex = -1;
let readingRevision = 0;
let loadedSource = '';

function message(text) {
  $('#reader-status').val(String(text));
}

function fileState() {
  return $('#file-list').data();
}

function pageCount() {
  return Math.max(1, Math.ceil((fileState().filelist?.length || 0) / 10));
}

function selectedValue() {
  return $('#selected').val().trim();
}

function wrapText(text) {
  const rows = [];
  for (const rawLine of String(text ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const characters = [...rawLine];
    if (!characters.length) {
      rows.push('');
      continue;
    }
    for (let offset = 0; offset < characters.length; offset += PAGE_COLUMNS)
      rows.push(characters.slice(offset, offset + PAGE_COLUMNS).join(''));
  }
  if (!rows.length) rows.push('');
  const result = [];
  for (let offset = 0; offset < rows.length; offset += PAGE_ROWS)
    result.push(rows.slice(offset, offset + PAGE_ROWS).join('\n'));
  return result.length ? result : [''];
}

function showReaderPage(nextPage = pageIndex) {
  pageIndex = Math.max(0, Math.min(Number(nextPage) || 0, pages.length - 1));
  const rows = String(pages[pageIndex] ?? '').split('\n');
  while (rows.length < PAGE_ROWS) rows.push('');
  $('#reader').val(rows.slice(0, PAGE_ROWS).join('\n'));
  message(`${loadedSource || 'Reader'} · Page ${pageIndex + 1} / ${pages.length}`);
}

function sentences(text) {
  return String(text ?? '')
    .split(/(?<=[.!?。！？…；;])\s*|[\r\n]+/u)
    .map(value => value.trim())
    .filter(Boolean);
}

export async function onMdcuiLoad() {
  $("#more-info-click-m-m").hide();
  await listDirectory();
  showReaderPage(0);
}

export function directoryKey(event) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  return listDirectory();
}

export async function listDirectory() {
  try {
    const result = await rpc.listReaderDirectory($('#directory').val().trim());
    $('#directory').val(result.directory);
    selectedIndex = -1;
    $('#file-list').data({ filelist: result.files, listPage: 0 });
    message(`Listed ${result.files.length} files from ${result.directory}`);
  } catch (error) {
    message(`List failed: ${error?.message || error}`);
  }
}

export function selectFile(value) {
  const files = fileState().filelist || [];
  selectedIndex = files.findIndex(file => file.value === value);
  $('#selected').val(value);
  if (selectedIndex >= 0)
    $('#file-list').data('listPage', Math.floor(selectedIndex / 10));
  message(`Selected: ${value}`);
}

export function changeListPage(delta) {
  const data = fileState();
  const next = Math.max(0, Math.min((Number(data.listPage) || 0) + delta, pageCount() - 1));
  $('#file-list').data('listPage', next);
}

export function selectRelative(delta) {
  const files = fileState().filelist || [];
  if (!files.length) return;
  if (selectedIndex < 0) {
    const current = selectedValue();
    selectedIndex = files.findIndex(file => file.value === current);
  }
  selectedIndex = Math.max(0, Math.min(
    selectedIndex < 0 ? (delta > 0 ? 0 : files.length - 1) : selectedIndex + delta,
    files.length - 1,
  ));
  selectFile(files[selectedIndex].value);
}

export function clearSelection() {
  selectedIndex = -1;
  $('#selected').val('');
  message('Selection cleared / 已清除選取');
}

function numberedSibling(value, delta) {
  const source = String(value ?? '');
  const suffixAt = source.search(/[?#]/u);
  const path = suffixAt < 0 ? source : source.slice(0, suffixAt);
  const suffix = suffixAt < 0 ? '' : source.slice(suffixAt);
  const separatorAt = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  const directory = path.slice(0, separatorAt + 1);
  const filename = path.slice(separatorAt + 1);
  const matches = [...filename.matchAll(/\d+/gu)];
  const match = matches.at(-1);
  if (!match) return null;
  const current = BigInt(match[0]);
  const next = current + BigInt(delta);
  if (next < 0n) return null;
  const replacement = String(next).padStart(match[0].length, '0');
  return directory
    + filename.slice(0, match.index)
    + replacement
    + filename.slice(match.index + match[0].length)
    + suffix;
}

export async function loadSelected() {
  const value = selectedValue();
  if (!value) {
    message('Load failed: select a file or enter a URL first');
    return;
  }
  stopReading();
  try {
    const result = await rpc.loadReaderResource(value);
    loadedSource = result.source;
    pages = wrapText(result.text);
    pageIndex = 0;
    showReaderPage(0);
  } catch (error) {
    message(`Load failed: ${error?.message || error}`);
  }
}

export async function loadRelative(delta) {
  const numbered = numberedSibling(selectedValue(), delta);
  if (numbered) selectFile(numbered);
  else selectRelative(delta);
  await loadSelected();
}

export function previousReaderPage() {
  showReaderPage(pageIndex - 1);
}

export function nextReaderPage() {
  showReaderPage(pageIndex + 1);
}

export function readerKey(event) {
  const key = String(event.key ?? '').toLowerCase();
  if (key === 'pageup' || key === 'arrowleft' || key === 'arrowup' || LEFT_KEYS.has(key)) {
    previousReaderPage();
  } else if (
    key === 'pagedown' || key === 'arrowright' || key === 'arrowdown' || RIGHT_KEYS.has(key)
  ) {
    nextReaderPage();
  }
}

export function stopReading() {
  readingRevision++;
  $.tts.stop?.();
  message('Reading stopped / 已停止朗讀');
}

export function readFromCurrentPage() {
  const revision = ++readingRevision;
  void runReading(revision);
}

async function runReading(revision) {
  for (let current = pageIndex; current < pages.length; current++) {
    if (revision !== readingRevision) return;
    showReaderPage(current);
    for (const sentence of sentences(pages[current])) {
      if (revision !== readingRevision) return;
      const error = await $.tts(sentence);
      if (error) {
        message(error);
        return;
      }
    }
  }
  if (revision === readingRevision)
    message(`Reading complete: ${loadedSource}`);
}
```

```js back
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function listReaderDirectory(input) {
  const directory = resolve(String(input ?? '').trim() || process.cwd());
  const entries = await readdir(directory, { withFileTypes: true });
  const files = entries
    .filter(entry => entry.isFile())
    .map(entry => ({
      name: entry.name,
      value: resolve(directory, entry.name),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  return { directory, files };
}

export async function loadReaderResource(input) {
  const value = String(input ?? '').trim();
  if (!value) throw new Error('Select a file or enter a URL first');
  if (/^https?:\/\//iu.test(value)) {
    const response = await fetch(value);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    return { source: response.url || value, text: await response.text() };
  }
  const source = resolve(value);
  const file = Bun.file(source);
  if (!await file.exists()) throw new Error(`File not found: ${source}`);
  return { source, text: await file.text() };
}
```
