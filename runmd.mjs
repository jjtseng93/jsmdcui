#!/usr/bin/env bun

import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { readInternalAssetText } from './src/runtime/assets.js'
import { REPO_ROOT } from './single-exe/compiled.js'

const csl=console.log
const mda=Bun.markdown.ansi
const mdh=Bun.markdown.html
const jss=JSON.stringify


const TEST_ROW=9
const TEST_COL=5


function logWroteFile(label,path)
{
  csl(mda(`- Wrote to ${label} file: ${path}`))
}

async function readTemplate(pathname)
{
  return readInternalAssetText(pathname) ??
         await Bun.file(path.join(REPO_ROOT, pathname)).text()
}

async function readMarkdownInput(mdpath)
{
  const file = Bun.file(mdpath);
  if (await file.exists()) return await file.text();
  const assetName = path.basename(mdpath);
  const internalText = readInternalAssetText(assetName);
  if (internalText != null) return internalText;
  const fallbackPath = path.join(REPO_ROOT, assetName);
  const fallback = Bun.file(fallbackPath);
  if (await fallback.exists()) return await fallback.text();
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
	csl(mda("\n# TUI"))
	csl(tui)
	csl(mda('## TUI raw'))
	csl(jss(tui))


	// 4. Create Web UI
	let wui = await createWui(md,mdpath)
	csl(mda('\n# HTML'))
	csl(wui)


	// 5. Get character from point for TUI
	let ch = charFromPoint(tui,TEST_ROW,TEST_COL)

	csl(mda(
	  '# Slicing row,col: '+TEST_ROW+','+TEST_COL
	))

	csl(jss(ch))


    const serverPath = mdpath + "-server.js"
    const svmod = await import(pathToFileURL(path.resolve(serverPath)).href)

    csl("\n\n"+mda('# Server'))
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
  
  const mdb = path.basename(mdpath);
  
  
  md += `

<scr`+`ipt type="module" src="./${mdb}.front.js">
</scr`+`ipt>

  `;
  
  
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
