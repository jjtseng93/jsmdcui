#!/usr/bin/env bun
  
    import { rpc as wuiRpcClient } from "./README.md-rpc.js";
    let rpc = null
    if(globalThis.process)
    {
      rpc = await import(
        "./" +
        (global.MDCUI_MAIN_BASE||"README.md") +
        ".back.js"
      ) ;
    }
    else
      rpc = wuiRpcClient ;
    
  
  
    if (typeof window !== "undefined") 
    {
      // Browser
      setTimeout( () => {
        import("./README.md.front.js").then(mod=>{
          Object.assign(window,mod);
        })
      }, 0 ) ;
    }
  