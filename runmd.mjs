#!/usr/bin/env bun

import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { readInternalAssetText } from './src/runtime/assets.js'
import { fenceEventMap } from './src/cui/fence-events.mjs'
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

export async function readMarkdownInput(mdpath, overwriteDemo = false)
{
  const file = Bun.file(mdpath);
  if (!overwriteDemo && await file.exists()) return await file.text();
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


export async function main(tuiWidth=30, {
  overwriteDemo = process.argv.includes("--overwrite-demo"),
  printUi = process.argv.includes("--print-ui"),
} = {})
{
    const explicitMdpath = process.argv.find(i=>i.endsWith('.md'))
    const mdpath = explicitMdpath || 'testapp.md'


	// 1. Read markdown file
	console.error('Reading:',mdpath)
	let md = await readMarkdownInput(mdpath, overwriteDemo && !explicitMdpath)

    // 2. Extract js files
    md = await extractJs(md,mdpath);

	// 3. Create Terminal UI
	let tui = createTui(md,tuiWidth)
	if (printUi) {
	  cse(mda("\n# TUI"))
	  cse(tui)
	  cse(mda('## TUI raw'))
	  cse(jss(tui))
	}


	// 4. Create Web UI
	let wui = await createWui(md,mdpath)
	if (printUi) {
	  cse(mda('\n# HTML'))
	  cse(wui)
	}


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

export function convertWuiTextareas(html, eventsById = new Map())
{
  return String(html).replace(
    /<pre><code class="language-([^"]+)">([^]*?)<\/code><\/pre>/g,
    (whole, info, content) => {
      const identity = parseWuiControlIdentity(info);
      if (!identity) return whole;
      const value = content.replace(/\n$/, "");
      const contentLines = value.split("\n");
      const cols = Math.max(1, ...contentLines.map(line => [...line].length));
      const declaration = identity.id && eventsById.get(identity.id)?.tag === identity.tag
        ? eventsById.get(identity.id)
        : null;
      const keydownHandler = declaration?.events.get("keydown");
      const keydownCode = keydownHandler
        ? [
            "const __mdcuiKeyCode=Number(event.keyCode||event.which||0);",
            "const __mdcuiCodeLetter=/^Key[A-Z]$/.test(event.code||\"\")?event.code.charCodeAt(3):0;",
            "const __mdcuiLetterCode=__mdcuiKeyCode>=65&&__mdcuiKeyCode<=90?__mdcuiKeyCode:__mdcuiCodeLetter;",
            "const __mdcuiAltGraph=!!event.getModifierState&&event.getModifierState(\"AltGraph\");",
            "const __mdcuiLetter=!__mdcuiAltGraph&&(event.ctrlKey||event.altKey||event.metaKey)&&__mdcuiLetterCode>=65&&__mdcuiLetterCode<=90;",
            "if(__mdcuiLetter)Object.defineProperty(event,\"key\",{configurable:true,value:String.fromCharCode(__mdcuiLetterCode+(event.shiftKey?0:32))});",
            "this.__mdcuiIdentifiedKeydown=!!event.key&&event.key!==\"Unidentified\";",
            "this.__mdcuiUnidentifiedKeydown=event.key===\"Unidentified\"?{keyCode:__mdcuiKeyCode,ctrlKey:!!event.ctrlKey,shiftKey:!!event.shiftKey,altKey:!!event.altKey,metaKey:!!event.metaKey,altGraph:__mdcuiAltGraph}:null;",
            "clearTimeout(this.__mdcuiKeydownReset);",
            "this.__mdcuiKeydownReset=setTimeout(()=>{this.__mdcuiIdentifiedKeydown=false;this.__mdcuiUnidentifiedKeydown=null},0);",
            "if(event.key!==\"Unidentified\"){\n",
            "Object.defineProperty(event,\"toJSON\",{configurable:true,value:function(){const t=this.target||{};return{type:String(this.type||\"\"),key:String(this.key||\"\"),code:String(this.code||\"\"),raw:String(this.raw||\"\"),ctrlKey:!!this.ctrlKey,shiftKey:!!this.shiftKey,altKey:!!this.altKey,metaKey:!!this.metaKey,repeat:!!this.repeat,defaultPrevented:!!this.defaultPrevented,target:{id:String(t.id||\"\"),tagName:String(t.tagName||\"\"),className:String(t.className||\"\"),value:String(t.value??\"\")}}}});",
            keydownHandler.modifiers.includes("prevent")
              ? "event.preventDefault();"
              : "",
            keydownHandler.code,
            "\n}",
          ].join("")
        : "";
      const beforeInputCode = keydownHandler
        ? [
            "if(!this.__mdcuiIdentifiedKeydown&&event.data!=null&&event.data!==\"\"){",
            "const m=this.__mdcuiUnidentifiedKeydown||{};",
            "const letter=!m.altGraph&&(m.ctrlKey||m.altKey||m.metaKey)&&m.keyCode>=65&&m.keyCode<=90?String.fromCharCode(m.keyCode+(m.shiftKey?0:32)):String(event.data);",
            "Object.defineProperties(event,{key:{configurable:true,value:letter},ctrlKey:{configurable:true,value:!!m.ctrlKey},shiftKey:{configurable:true,value:!!m.shiftKey},altKey:{configurable:true,value:!!m.altKey},metaKey:{configurable:true,value:!!m.metaKey}});",
            "this.onkeydown(event)",
            "}",
          ].join("")
        : "";
      const inlineEventAttrs = [
        keydownCode ? `onkeydown="${escapeHtmlAttribute(keydownCode)}"` : "",
        beforeInputCode ? `onbeforeinput="${escapeHtmlAttribute(beforeInputCode)}"` : "",
      ];
      const attrs = [
        `data-mdcui-tag="${identity.tag}"`,
        `data-mdcui-language="${escapeHtmlAttribute(info)}"`,
        identity.id ? `id="${escapeHtmlAttribute(identity.id)}"` : "",
        ...inlineEventAttrs,
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
  const eventsById = fenceEventMap(md)
  
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

  md = convertWuiTextareas(md, eventsById)
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
