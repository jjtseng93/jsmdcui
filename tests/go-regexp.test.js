import {test, expect} from 'bun:test';
import {convertGoRegexp} from '../src/highlight/go-regexp.js';
import {SyntaxDefinition,parseHeaderYaml} from '../src/highlight/parser.js';
const regex = s => new RegExp(convertGoRegexp(s), 'u');
test('Go flags apply to the remaining alternatives, preserving precedence', () => {
  const r = regex('^a(?i)b$|^c$');
  expect(r.test('aB')).toBe(true);
  expect(r.test('AB')).toBe(false);
  expect(r.test('C')).toBe(true);
  expect(r.test('aC')).toBe(false);
});
test('flag changes stay inside groups and can be disabled', () => {
  const r = regex('^(a(?i)b|c)d$');
  expect(r.test('aBd')).toBe(true);
  expect(r.test('Cd')).toBe(true);
  expect(r.test('CD')).toBe(false);
  expect(regex('^(?i)a(?-i)b$').test('Ab')).toBe(true);
  expect(regex('^(?i)a(?-i)b$').test('AB')).toBe(false);
  expect(regex('^(?i:a(?-i:b))c$').test('Abc')).toBe(true);
  expect(regex('^(?i:a(?-i:b))c$').test('ABC')).toBe(false);
});
test('capture numbers, scoped flags, escaped literals and class brackets survive', () => {
  expect(regex('^(?i)(a)(b)$').exec('AB').slice(1)).toEqual(['A','B']);
  expect(regex('(?i:a)+').test('AAA')).toBe(true);
  expect(regex('\\(\\?i\\)').test('(?i)')).toBe(true);
  const url = regex('(https?|ftp|ssh)://\\S*[^])>\\s,.]');
  expect(url.exec('https://example.com)')[0]).toBe('https://example.com');
  expect(regex('(?s)^a.b$').test('a\nb')).toBe(true);
  expect(regex('(?m)^b$').test('a\nb\nc')).toBe(true);
  expect(convertGoRegexp('\\bword\\b')).toBe('\\bword\\b');
});
test('all bundled syntax regexes compile, and Dockerfile keywords match', async () => {
  const root = new URL('../runtime/syntax/', import.meta.url).pathname;
  const failures = [];
  function walk(rules, file) {
    for (const r of rules) {
      if (r.type === 'pattern' && !r.regex) failures.push(file+': '+r.source);
      if (r.type === 'region') {
        for (const k of ['start','end','skip']) if (r.source[k] && !r[k]) failures.push(file+': '+r.source[k]);
        walk(r.rules,file);
      }
    }
  }
  for await (const file of new Bun.Glob('*.yaml').scan(root)) {
    const source = Bun.YAML.parse(await Bun.file(root+'/'+file).text());
    const header = parseHeaderYaml(source);
    for (const [key,re] of [['filename','fileNameRegex'],['header','headerRegex'],['signature','signatureRegex']])
      if (header[key] && !header[re]) failures.push(file+': '+key);
    const def = new SyntaxDefinition(header,source);
    walk(def.rules,file);
    if (file === 'dockerfile.yaml') {
      expect(header.matchFileName('/tmp/Dockerfile')).toBe(true);
      const keyword = def.rules.find(r=>r.group==='type.keyword').regex;
      for (const line of ['FROM debian','run echo hi','COPY . /app']) expect(keyword.test(line)).toBe(true);
      expect(keyword.test('FROMAGE debian')).toBe(false);
    }
  }
  expect(failures).toEqual([]);
});
