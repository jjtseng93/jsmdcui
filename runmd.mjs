#!/usr/bin/env bun

import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { readInternalAssetText } from './src/runtime/assets.js'
import { REPO_ROOT } from './single-exe/compiled.js'

const csl=console.log
const cse=console.error
const mda=Bun.markdown.ansi
const mdh=Bun.markdown.html
const jss=JSON.stringify


const TEST_ROW=9
const TEST_COL=5


function logWroteFile(label,path)
{
  if(!process.stdin.isRaw)
  cse(mda(`- Wrote to ${label} file: ${path}`))
}

async function readTemplate(pathname)
{
  return readInternalAssetText(pathname) ??
         await Bun.file(path.join(REPO_ROOT, pathname)).text()
}

export async function readMarkdownInput(mdpath)
{
  const file = Bun.file(mdpath);
  if (await file.exists()) return await file.text();
  const assetName = path.basename(mdpath);
  const internalText = readInternalAssetText(assetName);
  if (internalText != null) {
    await Bun.write(mdpath, internalText);
    return internalText;
  }
  const fallbackPath = path.join(REPO_ROOT, assetName);
  const fallback = Bun.file(fallbackPath);
  if (await fallback.exists()) {
    const fallbackText = await fallback.text();
    await Bun.write(mdpath, fallbackText);
    return fallbackText;
  }
  throw new Error(`md file not found: ${mdpath}`);
}


export async function main(tuiWidth=30)
{
    const mdpath = process.argv.filter(i=>i.endsWith('.md'))[0] || 'testapp.md'


	// 1. Read markdown file
	console.error('Reading:',mdpath)
	let md = await readMarkdownInput(mdpath)

    // 2. Extract js files
    md = await extractJs(md,mdpath);

	// 3. Create Terminal UI
	let tui = createTui(md,tuiWidth)
	cse(mda("\n# TUI"))
	cse(tui)
	cse(mda('## TUI raw'))
	cse(jss(tui))


	// 4. Create Web UI
	let wui = await createWui(md,mdpath)
	cse(mda('\n# HTML'))
	cse(wui)


    /*
	// 5. Get character from point for TUI
	let ch = charFromPoint(tui,TEST_ROW,TEST_COL)

	cse(mda(
	  '# Slicing row,col: '+TEST_ROW+','+TEST_COL
	))

	cse(jss(ch))
	
	*/


    const serverPath = mdpath + "-server.js"
    const svmod = await import(pathToFileURL(path.resolve(serverPath)).href)

    cse("\n\n"+mda('# Server'))
    svmod.main();
}


//  Exports


export async function extractJs(md,mdpath)
{
  const mdb = path.basename(mdpath)

  let sctagsp = mdpath + ".front.js"
  let sctags = ""
  // Gather frontend script tags
  let reJs = /```js front[^]+?```/g  //  
  md = md.replace( reJs,
    i=>{
      sctags+=i.slice(11,-3)+'\n\n'
    
      return '';
      return i
        .replace('```js front',"<scr"+"ipt>")
        .slice(0,-3)+"</scr"+"ipt>"
    }
  )
  
  sctags = "#!/usr/bin/env bun" + `
  
    import { rpc as wuiRpcClient } from "./${mdb}-rpc.js";
    let rpc = "${mdb}"
    if(globalThis.process)
      rpc = await import("./"+rpc+".back.js") ;
    else
      rpc = wuiRpcClient ;
    
  ` + sctags + `
  
    if (typeof window !== "undefined") 
    {
      // Browser
      setTimeout( () => {
        import("./${mdb}.front.js").then(mod=>{
          Object.assign(window,mod);
        })
      }, 0 ) ;
    }
  ` ;
  
  await Bun.write(sctagsp,sctags);
  logWroteFile("front", sctagsp)
  
  sctagsp = mdpath + ".back.js"
  sctags = "#!/usr/bin/env bun\n\n"
  // Gather backend script tags
  reJs = /```js back[^]+?```/g  //  
  md = md.replace( reJs,
    i=>{
      sctags+=i.slice(10,-3)+'\n\n'
    
      return '';
    }
  )
  
  await Bun.write(sctagsp,sctags);
  logWroteFile("back", sctagsp)
  
  await writeRuntimeFiles(mdpath)
  
  return md
}

export async function writeRuntimeFiles(mdpath)
{
  const mdb = path.basename(mdpath)
  const rpcPath = mdpath + "-rpc.js"
  const serverPath = mdpath + "-server.js"
  const rpcSource = await readTemplate("src/cui/rpc.mjs")
  const serverSource = (await readTemplate("src/cui/server.mjs"))
    .replaceAll("./rpc.mjs", `./${mdb}-rpc.js`)
    .replaceAll("testapp.md", mdb)

  await Bun.write(rpcPath, rpcSource)
  logWroteFile("rpc", rpcPath)
  await Bun.write(serverPath, serverSource)
  logWroteFile("server", serverPath)

  return serverPath
}


export function createTui(md,TERMINAL_WIDTH=30) // ANSI Colors
{
  md = (  Bun?.markdown?.ansi?.(
            md,{
              hyperlinks:true,
              columns:TERMINAL_WIDTH
            }
          )
       || md  )+'' ;
       
  return md ;
       
  return Bun.wrapAnsi(
    md,
    TERMINAL_WIDTH
  )
}

function parseWuiControlIdentity(info)
{
  const match = String(info ?? "").match(/^([A-Za-z_][\w:-]*)(?:#([A-Za-z_][\w:-]*))?((?:\.[A-Za-z_][\w:-]*)*)$/);
  if (!match || !["text", "textarea"].includes(match[1])) return null;
  return {
    tag: match[1],
    id: match[2] || "",
    classes: match[3] ? match[3].slice(1).split(".") : [],
  };
}

function escapeHtmlAttribute(value)
{
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function convertWuiTextareas(html)
{
  return String(html).replace(
    /<pre><code class="language-([^"]+)">([^]*?)<\/code><\/pre>/g,
    (whole, info, content) => {
      const identity = parseWuiControlIdentity(info);
      if (!identity) return whole;
      const value = content.replace(/\n$/, "");
      const contentLines = value.split("\n");
      const cols = Math.max(1, ...contentLines.map(line => [...line].length));
      const attrs = [
        `data-mdcui-tag="${identity.tag}"`,
        `data-mdcui-language="${escapeHtmlAttribute(info)}"`,
        identity.id ? `id="${escapeHtmlAttribute(identity.id)}"` : "",
        `class="${escapeHtmlAttribute([
          `language-${info}`,
          ...identity.classes,
        ].join(" "))}"`,
        `rows="${Math.max(1, contentLines.length)}"`,
        `cols="${cols}"`,
        'wrap="soft"',
        'style="box-sizing:border-box;max-width:100%;width:100%;resize:vertical;overflow-y:hidden"',
      ].filter(Boolean).join(" ");
      return `<textarea ${attrs}>${value}</textarea>`;
    },
  );
}

export function wrapWuiHeadingSections(html)
{
  const input = String(html);
  const bodyStart = input.match(/<body\b[^>]*>/i);
  if (bodyStart?.index != null) {
    const contentStart = bodyStart.index + bodyStart[0].length;
    const bodyEnd = input.slice(contentStart).search(/<\/body\s*>/i);
    if (bodyEnd >= 0) {
      const contentEnd = contentStart + bodyEnd;
      return input.slice(0, contentStart) +
        wrapWuiHeadingSections(input.slice(contentStart, contentEnd)) +
        input.slice(contentEnd);
    }
  }

  let markerPrefix = "MDCUI_HEADING_OPAQUE_";
  while (input.includes(markerPrefix)) markerPrefix = "_" + markerPrefix;
  const opaqueHtml = [];
  const searchable = input.replace(
    /<!--[^]*?-->|<(script|style|pre|code|textarea|template)\b[^>]*>[^]*?<\/\1\s*>/gi,
    (whole) => {
      const marker = `\0${markerPrefix}${opaqueHtml.length}\0`;
      opaqueHtml.push({ marker, html: whole });
      return marker;
    }
  );

  const heading = /<h([1-6])\b[^>]*>[^]*?<\/h\1\s*>/gi;
  const openLevels = [];
  let output = "";
  let cursor = 0;
  let match;

  while ((match = heading.exec(searchable)) !== null) {
    const level = Number(match[1]);
    output += searchable.slice(cursor, match.index);
    while (openLevels.length && openLevels.at(-1) >= level) {
      output += "</section>\n";
      openLevels.pop();
    }
    output += `<section>\n${match[0]}`;
    openLevels.push(level);
    cursor = heading.lastIndex;
  }

  output += searchable.slice(cursor);
  while (openLevels.length) {
    output += "</section>\n";
    openLevels.pop();
  }
  for (const opaque of opaqueHtml) {
    output = output.replace(opaque.marker, opaque.html);
  }
  return output;
}

export async function createWui(md,mdpath) // HTML
{
  
  const opts = {
    headings: { ids: true }
  }
  
  md = (Bun?.markdown?.html?.(md,opts) || md)+'' ;
  
  // Restore single quotes
  let reHrefs = /href="[^"]*?"/g  //  "
  md = md.replace( reHrefs,
    i=>i.replaceAll('&#x27;',"'")
  )
  
  
  md = md.replaceAll(
    'class="task-list-item-checkbox" disabled',
    'class="task-list-item-checkbox"'
  )

  const taskItemStart = '(<li\\b(?=[^>]*\\bclass="[^"]*\\btask-list-item\\b[^"]*")[^>]*>\\s*)'
  const taskCheckbox = '(<input\\b(?=[^>]*\\btype="checkbox")[^>]*>)'
  md = md.replace(
    new RegExp(taskItemStart + taskCheckbox + '([^<]*(?:<p>[^]*?<\\/p>[^<]*)*)', 'g'),
    (whole, itemStart, checkbox, content) => {
      if (!content.trim()) return whole
      return `${itemStart}<label>${checkbox}${content}</label>`
    }
  )

  md = convertWuiTextareas(md)
  md = wrapWuiHeadingSections(md)
  
  const mdb = path.basename(mdpath);
  
  const responsiveImageStyle = `<style>
img {
  max-width: 100%;
  height: auto;
}
</style>`;
  const moduleScript = `<scr`+`ipt type="module" src="./${mdb}.front.js"></scr`+`ipt>`;
  const isFullHtmlDocument = /^\s*<!doctype html>/i.test(md);
  if (!isFullHtmlDocument) {
    md = `<!doctype html>
<html lang="zh-TW">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtmlAttribute(mdb)}</title>
  ${responsiveImageStyle}
</head>
<body>
${md}
${moduleScript}
</body>
</html>
`;
  } else {
    if (/<\/head\s*>/i.test(md)) {
      md = md.replace(/<\/head\s*>/i, `${responsiveImageStyle}\n</head>`);
    } else {
      md = `${responsiveImageStyle}\n${md}`;
    }
    if (/<\/body\s*>/i.test(md)) {
      md = md.replace(/<\/body\s*>/i, `${moduleScript}\n</body>`);
    } else {
      md += `\n${moduleScript}\n`;
    }
  }
  
  
  await Bun.write(mdpath+".html",md)
  logWroteFile("html", mdpath+".html")

  return md;
}

export function charFromPoint(tui,row,col)
{
  tui = tui.split('\n')[row-1] || ""
  return Bun.sliceAnsi(tui,col-1,col)
}


if(import.meta.main)
  main().catch(e=>{
    console.error(e?.message || e)
    process.exit(127)
  });
