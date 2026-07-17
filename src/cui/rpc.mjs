




const crlf="\r\n"

let apilist = new Map()

export const jss = JSON.stringify

function parseDollarIdentity(input, { selector = false } = {})
{
  const text = String(input ?? "").trim();
  const match = text.match(/^([A-Za-z_][\w:-]*)?(?:#([A-Za-z_][\w:-]*))?((?:\.[A-Za-z_][\w:-]*)*)$/);
  if (!match || (!match[1] && !match[2] && !match[3])) return null;
  if (!selector && !match[1]) return null;
  return {
    tag: match[1] || null,
    id: match[2] || null,
    classes: match[3] ? match[3].slice(1).split(".") : [],
  };
}

function matchesDollarIdentity(identity, selector)
{
  if (selector.tag && identity.tag !== selector.tag) return false;
  if (selector.id && identity.id !== selector.id) return false;
  return selector.classes.every(name => identity.classes.includes(name));
}

function findMarkdownCodeElement(documentObject, selector)
{
  for (const code of documentObject?.querySelectorAll?.("pre > code") ?? []) {
    for (const className of code.classList ?? []) {
      if (!className.startsWith("language-")) continue;
      const identity = parseDollarIdentity(className.slice("language-".length));
      if (identity && matchesDollarIdentity(identity, selector)) return code;
    }
  }
  return null;
}

function findWebDollarElement(documentObject, selectorText, selector)
{
  try {
    const direct = documentObject?.querySelector?.(String(selectorText));
    if (direct) return direct;
  } catch {}

  for (const element of documentObject?.querySelectorAll?.("[data-mdcui-tag]") ?? []) {
    const identity = {
      tag: element.getAttribute?.("data-mdcui-tag") || null,
      id: element.id || null,
      classes: [...(element.classList ?? [])],
    };
    if (matchesDollarIdentity(identity, selector)) return element;
  }

  return findMarkdownCodeElement(documentObject, selector);
}

function webDollarValue(element)
{
  if (element && "value" in element) return String(element.value ?? "");
  return String(element?.textContent ?? "").replace(/\n$/, "");
}

function isWebHeading(element)
{
  return /^h[1-6]$/i.test(String(element?.tagName ?? ""));
}

function firstHeadingTaskList(heading)
{
  for (let sibling = heading?.nextElementSibling; sibling; sibling = sibling.nextElementSibling) {
    if (isWebHeading(sibling) || String(sibling.tagName ?? "").toLowerCase() === "section")
      break;
    const task = sibling.matches?.("li.task-list-item")
      ? sibling
      : sibling.querySelector?.("li.task-list-item");
    if (!task) continue;
    const list = task.closest?.("ul, ol");
    if (list) return list;
  }
  return null;
}

function directTaskCheckbox(item)
{
  for (const checkbox of item?.querySelectorAll?.('input[type="checkbox"]') ?? []) {
    if (checkbox.closest?.("li.task-list-item") === item) return checkbox;
  }
  return null;
}

function webTaskItemValue(item, checkbox)
{
  const label = checkbox?.closest?.("label");
  if (label && label.closest?.("li.task-list-item") === item)
    return String(label.textContent ?? "").trim();

  const copy = item.cloneNode?.(true);
  for (const nested of copy?.querySelectorAll?.("ul, ol") ?? []) nested.remove?.();
  for (const input of copy?.querySelectorAll?.('input[type="checkbox"]') ?? []) input.remove?.();
  return String(copy?.textContent ?? "").trim();
}

function webHeadingValue(heading)
{
  const single = String(heading?.id ?? "").startsWith("select");
  const list = firstHeadingTaskList(heading);
  if (!list) return single ? null : [];

  const selected = [];
  for (const item of list.children ?? []) {
    if (!item.matches?.("li.task-list-item")) continue;
    const checkbox = directTaskCheckbox(item);
    if (!checkbox?.checked) continue;
    const value = webTaskItemValue(item, checkbox);
    if (single) return value;
    selected.push(value);
  }
  return single ? null : selected;
}

function resizeWebTextarea(element)
{
  if (!element || String(element.tagName ?? "").toLowerCase() !== "textarea") return;
  try {
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
    const lineHeight = Number.parseFloat(
      element.ownerDocument?.defaultView?.getComputedStyle?.(element)?.lineHeight,
    );
    if (Number.isFinite(lineHeight) && lineHeight > 0)
      element.rows = Math.max(1, Math.ceil(element.scrollHeight / lineHeight));
  } catch {}
}

function installWebTextareaResize(target)
{
  const documentObject = target?.document;
  if (!documentObject || documentObject.__mdcuiTextareaResizeInstalled) return;
  documentObject.__mdcuiTextareaResizeInstalled = true;
  const resizeAll = () => {
    for (const element of documentObject.querySelectorAll?.("textarea[data-mdcui-tag]") ?? [])
      resizeWebTextarea(element);
  };
  documentObject.addEventListener?.("input", event => {
    if (event.target?.matches?.("textarea[data-mdcui-tag]"))
      resizeWebTextarea(event.target);
  });
  target.addEventListener?.("resize", resizeAll);
  if (documentObject.readyState === "loading")
    documentObject.addEventListener?.("DOMContentLoaded", resizeAll, { once: true });
  else
    queueMicrotask(resizeAll);
}

export function createWebDollar(documentObject = globalThis.document)
{
  return function $(selectorText) {
    const selector = parseDollarIdentity(selectorText, { selector: true });
    const selection = {
      html() {
        try {
          const element = findWebDollarElement(documentObject, selectorText, selector);
          return element ? String(element.innerHTML ?? "") : "";
        } catch {
          return "";
        }
      },
      val(...args) {
        try {
          const element = findWebDollarElement(documentObject, selectorText, selector);
          if (!element) return args.length > 0 ? selection : "";
          if (isWebHeading(element)) {
            if (args.length > 0) return selection;
            return webHeadingValue(element);
          }
          if (!selector) return args.length > 0 ? selection : "";
          if (args.length > 0) {
            const value = String(args[0] ?? "");
            if ("value" in element) {
              element.value = value;
              resizeWebTextarea(element);
            }
            else element.textContent = value;
            return selection;
          }
          return webDollarValue(element);
        } catch {
          return args.length > 0 ? selection : "";
        }
      },
    };
    return selection;
  };
}

export function installWebDollar(target = globalThis)
{
  if (!target?.document) return target?.$;
  const $ = createWebDollar(target.document);
  target.$ = $;
  installWebTextareaResize(target);
  return $;
}

if (typeof globalThis.document !== "undefined")
  installWebDollar(globalThis);


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

    const entries = Object.entries(mod).filter(([name]) => name !== "$");
    if (typeof globalThis.$ === "function")
      entries.push(["$", globalThis.$]);
    const names = entries.map(([name]) => name);
    const values = entries.map(([, value]) => safeFrontValue(value));

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
