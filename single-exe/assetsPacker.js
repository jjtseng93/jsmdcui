#!/usr/bin/env bun

//  Change these 2 lines for 
//  the relative assets root if needed
import pkg from "../package.json" with {
  type: "json" 
}
const ASSETS_ROOT=".."


import path from 'node:path'
import { existsSync } from "node:fs"

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
else
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

if(folderMode)
  await Bun.$`mkdir -p ${folderPath}`;

console.log({
  appendMode, archive, 
  folderMode, folderPath,
  PKG_ROOT,
  assets: pkg.assets
})

if(argv.includes('--dry'))
  return 0;

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
    if(!appendMode)
    {
      console.error("Creating an empty assets tar");
      await Bun.write(archive,'');
    }
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
    {
    }
  }
}




}  //  end of main
