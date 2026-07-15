




const crlf="\r\n"

let apilist = new Map()

export const jss = JSON.stringify


export async function evalBack(backmod, qjson)
{

try{



/* Contract of requestJson(qjson)
type RpcPacket = [
  func: string,
  argv: unknown[],
  envp?: Record<string, unknown>,
];
*/

//  DiscoverApi ApiCaller


let [ func, argv, envp ] = qjson

func = (func || '')+'' ;

if(process.env.RPC_DEBUG)
  console.log(func);

if(!apilist.get(backmod))
  apilist.set(backmod,DiscoverApi(backmod));

const apilistMod = apilist.get(backmod)

if(func=="_discover")
{
  return apilistMod ;
}
else if(apilistMod[func])
{
  if(Array.isArray(argv))
   return await backmod[func]?.apply?.(envp,argv);
  else
   return await ApiCaller(backmod,func,argv,envp);
}
else
{
  return "Unknown func 未知函式: "+func+
         crlf+JSON.stringify(argv);
}



}catch(e)
{
  console.log(e);
  return (e.stack);
}

}  //  end of evalBack


const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function safeFrontError(e)
{
  return {
    ok: false,
    error: e?.stack || String(e),
  };
}

function safeFrontValue(value)
{
  if (typeof value !== "function") return value;
  return function(...args) {
    try {
      const result = value.apply(this, args);
      if (result && typeof result.then === "function")
        return result.catch(safeFrontError);
      return result;
    } catch(e) {
      return safeFrontError(e);
    }
  };
}

export async function evalFront(mod, text) 
{
try{

    text = text.replace(/^javascript:/, "");

    const names = Object.keys(mod);
    const values = Object.values(mod).map(safeFrontValue);

    try {
      return await new AsyncFunction(...names, `return await (${text})`)(...values);
    } catch(e) {
      if (e instanceof SyntaxError)
        return await new AsyncFunction(...names, text)(...values);
      throw e;
    }

}catch(e)
{
  return safeFrontError(e);
}
    
}


export const rpcraw = async (func,argv,envp)=>{
    
  const apilistMod = await FrontendDiscoverApi()
  
  if(apilistMod[func])
    return await fetch("rpc", {
      method: "POST",
      body: JSON.stringify([
        func,argv,envp
      ])
    }).then(r=>r.json()).catch(e=>e) ;
  else if(func=="_discover")
  {
    if(argv[0])
      return jss(apilistMod,null,1) ;
    else
      return apilistMod ;
  }
  else
    return "Unknown func 未知函式: "+func+
           crlf+JSON.stringify(argv);
}

export const rpcproxy = new Proxy(rpcraw,{
  get(target, prop, receiver) {
    if (prop in target) {
      return Reflect.get(target, prop, receiver);
    }

    if (typeof prop !== "string") {
      return undefined;
    }

    target[prop] = async function(...argv) {
      await FrontendDiscoverApi()
      return await target(prop, argv, this);
    };

    return target[prop];
  },
  ownKeys() {
    return Object.keys(apilist.get(0)||{});
  },
  getOwnPropertyDescriptor(target, prop) {
    const apilistMod = apilist.get(0)||{};

    if(prop in apilistMod) {
      return {
        enumerable: true,
        configurable: true,
      };
    }

    return Reflect.getOwnPropertyDescriptor(target, prop);
  }
});

export var rpc = rpcproxy



// functions cannot contain ( ) , 
export function getfuncparams( func )
{
	if( typeof(func) != "function" )
	  return [];
	
	let rs = func.toString();
	let m = rs.match( /\(([\s\S]*?)\)/ );
	if( !m ) return [];
	rs = m[1] ;
	
	return rs.split(",").map(i=>i.trim()) ;
}


export async function FrontendDiscoverApi()
{
  if(!apilist.get(0))
    apilist.set(0, await fetch("rpc", {
      method: "POST",
      body: JSON.stringify(["_discover"])
    }).then(r=>r.json()).catch(e=>e) ) ;
    
  return apilist.get(0);
}


// filters out _ starting functions
export function DiscoverApi( obj ) // module_obj
{
	let karr = Object.keys( obj );
	karr = karr
	  .filter( i=>( !i.startsWith('_') && 
	                typeof(obj[i]) == "function" ) )
	  .map(i=>{
          const fname = obj[i].name || obj[i].Name ;
          
          if( fname && fname != i )
            return [ i, [[ fname ]] ];
            
          return [ i, getfuncparams(obj[i]) ];
      });
	
	return Object.fromEntries( karr ) ;
}



/*
 * Module object from import * as modobj from 'mod.mjs'
 * Parameters object
 */
export async function ApiCaller( modobj, cmd, pobj,envp )
{
  const func = modobj[cmd] ;

  if(!pobj) pobj = {} ;

  if( func && typeof(func) == "function" )
  {
    if(!func.args)
    {
      func.args = getfuncparams( func ) ;
      func.args = func.args.map(i=>{
        let ret = i.split("=")[0]
        ret=(ret||"")+""
        return ret.trim();
      });
    }
    
    let parr = func.args.map(i=>pobj[i]) ;

    return await func.apply(envp,parr) ;
  }
  else
    return "Failed: No such function as" +
           crlf + cmd ;
}
