#!/usr/bin/env bun

//  Change these 2 lines for 
//  the relative assets root if needed
import pkg from "../package.json" with {
  type: "json" 
}
const ASSETS_ROOT=".."


import path from 'node:path'
import { existsSync } from "node:fs"
import { readdirSync, statSync } from "node:fs"

const PKG_ROOT=path.resolve(import.meta.dir,ASSETS_ROOT);

if( process.argv.includes('-h') || 
    process.argv.includes('--help') )
{
  console.log(`
Single-file executable assets packer: 
  For packing folders recursively
  -r  Append mode on
  -f  File(.tar) or Folder
    Folder: /path/to/build/assets
    Copies to ${pkg.name}@${pkg.version}
`);
  
}
else if(import.meta.main)
{
  await main();
}



export async function main(argv = process.argv)
{





console.log("Packing",pkg.name+"@"+pkg.version)


let aindex = argv.indexOf('-f')


const appendMode = argv.includes('-r') || argv.includes('--append')

const archive = (aindex==-1) ?
  path.join(import.meta.dir,'assets.tar') : argv[aindex+1] ;

const folderMode = existsSync(archive) && ! await Bun.file(archive).exists() ;

const folderPath = folderMode? path.join(archive,pkg.name+'@'+pkg.version):'';


console.log({
  appendMode, archive, 
  folderMode, folderPath,
  PKG_ROOT,
  assets: pkg.assets
})

if(argv.includes('--dry'))
  return 0;


if(folderMode)
  await Bun.$`mkdir -p ${folderPath}`;


// No assets field in package.json
if( !Array.isArray(pkg.assets) ||
    pkg.assets.length==0 )
{
  console.error('Nothing to pack!')
  
  if(folderMode)
  {
    console.error('Defaults to package.json')
    await Bun.write(
      path.join(
        folderPath,"package.json"
      ),
      JSON.stringify(pkg,null,1)
    );
  }
  else // assets.tar mode
  {
    const file = Bun.file(archive);

    //  Leave a real archive alone; only stand one up when it is
    //  missing (or the zero-byte file that is not a valid tar), so
    //  entry.mjs's `with { type: "file" }` import still resolves.
    if(await file.exists() && file.size > 0)
      return 0;

    console.error("Writing a placeholder assets tar");

    await Bun.Archive.write(archive, {
      [`packages/${pkg.name}@${pkg.version}/package.json`]:
        JSON.stringify(pkg,null,1)
    });
  }

}
else // assets present in package.json
{
  if(folderMode)
  {
    for(let i of pkg.assets)
    {
      await Bun.$`cp -R ${i} ${folderPath}`.cwd(PKG_ROOT);
    }
  }
  else // tar mode
  {
    if(appendMode)
      return await tar_rvf(archive, pkg.assets, PKG_ROOT);

    const proc = Bun.spawn(
      ['tar', '-cvf', archive, ...pkg.assets],
      { cwd: PKG_ROOT, stdout: 'inherit', stderr: 'inherit' }
    );

    return await proc.exited;
  }
}




}  //  end of main


//  Stands in for `tar -rvf`, which toybox tar does not implement.
//  Reads the existing members, adds `filesArray` (paths relative to
//  `cwd`, folders walked recursively), and writes the archive back.
//  Unlike real tar -r, a repacked path replaces its member instead of
//  becoming a second one with the same name.
export async function tar_rvf(archive, filesArray, cwd)
{
  const entries = new Map();
  const file = Bun.file(archive);

  if(await file.exists())
  {
    const bytes = await file.bytes();

    if(bytes.byteLength > 0)
      for(const [member, blob] of await new Bun.Archive(bytes).files())
        entries.set(member, await blob.bytes());
  }

  for(const asset of filesArray)
  {
    const full = path.join(cwd, asset);

    if(!statSync(full).isDirectory())
    {
      entries.set(asset, await Bun.file(full).bytes());
      console.log(asset);
      continue;
    }

    for(const rel of readdirSync(full, { recursive: true }))
    {
      const child = path.join(full, String(rel));
      if(!statSync(child).isFile()) continue;

      const member = asset + '/' + String(rel).split(path.sep).join('/');
      entries.set(member, await Bun.file(child).bytes());
      console.log(member);
    }
  }

  await Bun.Archive.write(archive, Object.fromEntries(entries));

  return 0;
}
