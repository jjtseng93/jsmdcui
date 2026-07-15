#!/usr/bin/env bun

import { evalBack } from "./rpc.mjs";

const csl = console.log
const mda = Bun.markdown.ansi


import homepage from "./testapp.md.html"
import * as backmod from "./testapp.md.back.js";


/*
// Wait until Bun fixes dynamic html import bundle

process.env.PUBLIC_MDPATH ||= "testapp.md"

const { default: homepage } = 
    await import(
      "./" + 
      process.env.PUBLIC_MDPATH + 
      ".html"
    ) ;

const backmod = 
    await import(
      './' +
      process.env.PUBLIC_MDPATH + 
      ".back.js"
    ) ;
    
*/


function json(data, init = {}) {
  return Response.json(data, {
    headers: {
      "access-control-allow-origin": "*",
      ...init.headers,
    },
    ...init,
  });
}


export function main()
{



const basePath = "/" + crypto.randomUUID()
const pathname = basePath + "/"
const server = Bun.serve({
  port: Number(process.env.PORT || 3000),
  development: {
    hmr: true,
    console: true,
  },
  routes: {
    [basePath]: (req) => Response.redirect(new URL(pathname, req.url), 308),
    [pathname]: homepage,

    [pathname + "rpc"]: async (req) => {
      csl("\n"+mda("## "+req.method+" "+req.url))
    
      if (req.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "POST,OPTIONS",
            "access-control-allow-headers": "content-type",
          },
        });
      }

      if (req.method !== "POST") {
        csl('illegal method')
        return new Response("Method Not Allowed", { status: 405 });
      }

      try {
        const packet = await req.json();
        
        csl('req json:',packet)
        
        const result = await evalBack(backmod, packet);

        return json(result ?? null);
      } catch (error) {
        return json(
          {
            ok: false,
            error: error?.stack || String(error),
          },
          { status: 400 },
        );
      }
    },
  },

  fetch() {
    return new Response("Not Found", { status: 404 });
  },
});

console.log(mda("- Bun RPC server listening on"));
console.log(`http://localhost:${server.port}${pathname}`);



return server

} // main

if(import.meta.main)
  main()
