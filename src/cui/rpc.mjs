




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

function semanticWebHeadingHtml(heading)
{
  const copy = heading?.cloneNode?.(true);
  if (!copy) return String(heading?.innerHTML ?? "");
  for (const toggle of copy.querySelectorAll?.(".mdcui-heading-toggle") ?? [])
    toggle.replaceWith?.(...toggle.childNodes);
  return String(copy.innerHTML ?? "");
}

function firstWebHeadingTextNode(root)
{
  for (const child of root?.childNodes ?? []) {
    if (child.nodeType === 3 && /\S/u.test(String(child.textContent ?? "")))
      return child;
    const nested = firstWebHeadingTextNode(child);
    if (nested) return nested;
  }
  return null;
}

function ensureWebHeadingToggle(heading)
{
  if (!isWebHeading(heading) || !heading.id) return null;
  const existing = heading.querySelector?.(".mdcui-heading-toggle");
  if (existing) {
    if (existing.style) existing.style.cursor = "pointer";
    return existing;
  }

  const textNode = firstWebHeadingTextNode(heading);
  const text = String(textNode?.textContent ?? "");
  const start = text.search(/\S/u);
  if (!textNode || start < 0) return null;
  const character = [...text.slice(start)][0];
  const documentObject = heading.ownerDocument;
  const range = documentObject?.createRange?.();
  const toggle = documentObject?.createElement?.("span");
  if (!range || !toggle) return null;

  toggle.className = "mdcui-heading-toggle";
  toggle.setAttribute?.("role", "button");
  toggle.setAttribute?.("tabindex", "0");
  toggle.setAttribute?.("aria-expanded", "true");
  if (toggle.style) toggle.style.cursor = "pointer";
  range.setStart(textNode, start);
  range.setEnd(textNode, start + character.length);
  range.surroundContents(toggle);
  return toggle;
}

function webIdStore(documentObject)
{
  if (!(documentObject?._mdcuiIdStore instanceof Map))
    documentObject._mdcuiIdStore = new Map();
  return documentObject._mdcuiIdStore;
}

function webIdRecord(documentObject, id)
{
  const store = webIdStore(documentObject);
  let record = store.get(id);
  if (!record) {
    record = {};
    store.set(id, record);
  }
  return record;
}

function webUserData(documentObject, id, element)
{
  if (!documentObject || !id) return undefined;
  const record = webIdRecord(documentObject, id);
  if (!record.data || typeof record.data !== "object")
    record.data = Object.create(null);
  if (element) element.mdcuiData = record.data;
  return record.data;
}

function removeWebUserData(documentObject, id, element, keys)
{
  if (!documentObject || !id) return;
  const store = webIdStore(documentObject);
  const record = store.get(id);
  if (!record?.data) return;
  if (keys.length === 0) {
    delete record.data;
    if (element) delete element.mdcuiData;
  } else {
    for (const key of keys) delete record.data[key];
  }
  if (Object.keys(record).length === 0) store.delete(id);
}

function hideWebHeadingSection(documentObject, heading)
{
  if (!isWebHeading(heading) || !heading.id) return false;
  const store = webIdStore(documentObject);
  if (store.get(heading.id)?.headingVisibility?.hidden) return true;

  const section = heading.parentElement;
  const parent = section?.parentElement;
  if (String(section?.tagName ?? "").toLowerCase() !== "section" || !parent) return false;

  heading.remove?.();
  parent.insertBefore?.(heading, section);
  section.hidden = true;
  heading.querySelector?.(".mdcui-heading-toggle")
    ?.setAttribute?.("aria-expanded", "false");
  webIdRecord(documentObject, heading.id).headingVisibility = {
    hidden: true,
    section,
  };
  return true;
}

function showWebHeadingSection(documentObject, heading)
{
  if (!isWebHeading(heading) || !heading.id) return false;
  const store = webIdStore(documentObject);
  const record = store.get(heading.id);
  const state = record?.headingVisibility;
  if (!state?.hidden) return true;

  const section = state.section;
  section.hidden = false;
  heading.remove?.();
  section.insertBefore?.(heading, section.firstChild ?? null);
  heading.querySelector?.(".mdcui-heading-toggle")
    ?.setAttribute?.("aria-expanded", "true");
  delete record.headingVisibility;
  if (Object.keys(record).length === 0) store.delete(heading.id);
  return true;
}

function firstHeadingList(heading)
{
  for (let sibling = heading?.nextElementSibling; sibling; sibling = sibling.nextElementSibling) {
    if (isWebHeading(sibling) || String(sibling.tagName ?? "").toLowerCase() === "section")
      break;
    if (sibling.matches?.("ul, ol")) return sibling;
    const list = sibling.querySelector?.("ul, ol");
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
  const list = firstHeadingList(heading);
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

function directWebTaskItems(list)
{
  const items = [];
  for (const item of list?.children ?? []) {
    if (!item.matches?.("li.task-list-item")) continue;
    if (directTaskCheckbox(item)) items.push(item);
  }
  return items;
}

function webTaskItemSnapshot(item)
{
  const checkbox = directTaskCheckbox(item);
  return {
    value: webTaskItemValue(item, checkbox),
    checked: Boolean(checkbox?.checked),
  };
}

function normalizedTaskItem(input)
{
  if (input && typeof input === "object") {
    return {
      value: String(input.value ?? input.label ?? "").replace(/\r?\n/g, " "),
      checked: Boolean(input.checked),
    };
  }
  return {
    value: String(input ?? "").replace(/\r?\n/g, " "),
    checked: false,
  };
}

function normalizedSpliceRange(length, argumentCount, start, deleteCount)
{
  if (argumentCount === 0) return { start: 0, deleteCount: 0 };
  let relativeStart = Number(start);
  if (Number.isNaN(relativeStart)) relativeStart = 0;
  relativeStart = Math.trunc(relativeStart);
  const actualStart = relativeStart < 0
    ? Math.max(length + relativeStart, 0)
    : Math.min(relativeStart, length);
  if (argumentCount === 1) return { start: actualStart, deleteCount: length - actualStart };
  let requestedDelete = Number(deleteCount);
  if (Number.isNaN(requestedDelete)) requestedDelete = 0;
  requestedDelete = Math.max(0, Math.trunc(requestedDelete));
  return {
    start: actualStart,
    deleteCount: Math.min(requestedDelete, length - actualStart),
  };
}

function appendWebTaskItem(list, input, before = null)
{
  const documentObject = list?.ownerDocument;
  if (!documentObject?.createElement || !documentObject?.createTextNode) return false;

  const itemValue = normalizedTaskItem(input);
  const item = documentObject.createElement("li");
  item.classList?.add("task-list-item");
  const label = documentObject.createElement("label");
  const checkbox = documentObject.createElement("input");
  checkbox.type = "checkbox";
  checkbox.classList?.add("task-list-item-checkbox");
  checkbox.checked = itemValue.checked;
  label.append(checkbox, documentObject.createTextNode(itemValue.value));
  item.append(label);
  list.insertBefore(item, before);
  return true;
}

function mutateWebHeadingList(heading, method, args)
{
  const list = firstHeadingList(heading);
  if (!list) {
    if (method === "push" || method === "unshift") return 0;
    if (method === "splice") return [];
    return undefined;
  }

  const items = directWebTaskItems(list);
  if (method === "splice") {
    const range = normalizedSpliceRange(items.length, args.length, args[0], args[1]);
    const removed = items
      .slice(range.start, range.start + range.deleteCount)
      .map((item) => webTaskItemValue(item, directTaskCheckbox(item)));
    const before = items[range.start] ?? null;
    for (const input of args.slice(2)) appendWebTaskItem(list, input, before);
    for (const item of items.slice(range.start, range.start + range.deleteCount)) item.remove?.();
    return removed;
  }
  if (method === "pop" || method === "shift") {
    const item = method === "pop" ? items.at(-1) : items[0];
    if (!item) return undefined;
    const value = webTaskItemValue(item, directTaskCheckbox(item));
    item.remove?.();
    return value;
  }

  if (method === "push") {
    for (const input of args) appendWebTaskItem(list, input);
  } else {
    const before = items[0] ?? list.firstChild ?? null;
    for (const input of args) appendWebTaskItem(list, input, before);
  }
  return directWebTaskItems(list).length;
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

function webLinkActivationEvent(nativeEvent, anchor)
{
  return {
    type: String(nativeEvent?.type ?? "click"),
    target: anchor,
    currentTarget: anchor,
    originalEvent: nativeEvent,
    ctrlKey: Boolean(nativeEvent?.ctrlKey),
    altKey: Boolean(nativeEvent?.altKey),
    shiftKey: Boolean(nativeEvent?.shiftKey),
    metaKey: Boolean(nativeEvent?.metaKey),
    get defaultPrevented() { return Boolean(nativeEvent?.defaultPrevented); },
    preventDefault() { nativeEvent?.preventDefault?.(); },
    stopPropagation() { nativeEvent?.stopPropagation?.(); },
  };
}

function installWebLinkContext(target)
{
  const documentObject = target?.document;
  if (!documentObject || documentObject.__mdcuiLinkContextInstalled) return;
  documentObject.__mdcuiLinkContextInstalled = true;
  documentObject.addEventListener?.("click", async nativeEvent => {
    const anchor = nativeEvent.target?.closest?.("a[href]");
    const href = anchor?.getAttribute?.("href") ?? "";
    if (!/^javascript:/i.test(href)) return;
    nativeEvent.preventDefault?.();
    const event = webLinkActivationEvent(nativeEvent, anchor);
    await evalFront(
      target.__mdcuiFrontModule ?? {},
      href,
      { event, target: anchor },
      anchor,
    );
  });
}

function installWebHeadingToggle(target)
{
  const documentObject = target?.document;
  if (!documentObject || documentObject.__mdcuiHeadingToggleInstalled) return;
  documentObject.__mdcuiHeadingToggleInstalled = true;

  const decorateAll = () => {
    for (const heading of documentObject.querySelectorAll?.(
      "h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]",
    ) ?? []) ensureWebHeadingToggle(heading);
  };
  if (documentObject.readyState === "loading")
    documentObject.addEventListener?.("DOMContentLoaded", decorateAll, { once: true });
  else
    queueMicrotask(decorateAll);

  const activate = event => {
    const toggle = event.target?.closest?.(".mdcui-heading-toggle");
    const heading = toggle?.closest?.("h1, h2, h3, h4, h5, h6");
    if (!heading?.id) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
    createWebDollar(documentObject)(heading).toggle();
  };
  documentObject.addEventListener?.("click", activate, { capture: true });
  documentObject.addEventListener?.("keydown", event => {
    if (event.key === "Enter" || event.key === " ") activate(event);
  }, { capture: true });
}

export function createWebDollar(documentObject = globalThis.document)
{
  return function $(selectorText) {
    const objectTarget = selectorText !== null && typeof selectorText === "object"
      ? selectorText
      : null;
    const selector = objectTarget
      ? null
      : parseDollarIdentity(selectorText, { selector: true });
    const selectorId = String(objectTarget?.id ?? selector?.id ?? "");
    const nestedSelection = Boolean(objectTarget?._mdcuiDollarSelection);
    const identityOnlyObject = Boolean(
      objectTarget
      && selectorId
      && !("value" in objectTarget)
      && !("textContent" in objectTarget)
      && !("innerHTML" in objectTarget)
      && !objectTarget.tagName
      && !objectTarget.nodeType
      && !objectTarget.ownerDocument
    );
    const resolveElementById = () => (
      documentObject?.getElementById?.(selectorId)
      ?? findWebDollarElement(
        documentObject,
        `#${selectorId}`,
        parseDollarIdentity(`#${selectorId}`, { selector: true }),
      )
    );
    const resolveElement = () => nestedSelection || identityOnlyObject
      ? (
        resolveElementById()
      )
      : objectTarget ?? findWebDollarElement(documentObject, selectorText, selector);
    const selection = {
      id: selectorId,
      _mdcuiDollarSelection: true,
      html() {
        try {
          const element = resolveElement();
          if (!element) return "";
          return isWebHeading(element)
            ? semanticWebHeadingHtml(element)
            : String(element.innerHTML ?? "");
        } catch {
          return "";
        }
      },
      text(...args) {
        try {
          const element = resolveElement();
          if (!element) return args.length > 0 ? selection : "";
          if (args.length > 0) {
            element.textContent = String(args[0] ?? "");
            if (isWebHeading(element)) ensureWebHeadingToggle(element);
            return selection;
          }
          return String(element.textContent ?? "");
        } catch {
          return args.length > 0 ? selection : "";
        }
      },
      show() {
        try {
          const element = resolveElement();
          showWebHeadingSection(documentObject, element);
        } catch {}
        return selection;
      },
      hide() {
        try {
          const element = resolveElement();
          hideWebHeadingSection(documentObject, element);
        } catch {}
        return selection;
      },
      toggle() {
        try {
          const element = resolveElement();
          const hidden = webIdStore(documentObject)
            .get(element?.id)?.headingVisibility?.hidden;
          if (hidden) showWebHeadingSection(documentObject, element);
          else hideWebHeadingSection(documentObject, element);
        } catch {}
        return selection;
      },
      data(...args) {
        try {
          const element = resolveElement();
          const id = element?.id || selector?.id || selectorId;
          const data = webUserData(documentObject, id, element);
          if (!data) return args.length === 0 ? undefined : selection;
          if (args.length === 0) return data;
          if (args.length === 1) {
            if (args[0] && typeof args[0] === "object") {
              Object.assign(data, args[0]);
              return selection;
            }
            return data[String(args[0])];
          }
          data[String(args[0])] = args[1];
          return selection;
        } catch {
          return args.length <= 1 ? undefined : selection;
        }
      },
      removeData(...keys) {
        try {
          const element = resolveElement();
          const id = element?.id || selector?.id || selectorId;
          const normalized = keys
            .flatMap(key => Array.isArray(key) ? key : String(key).split(/\s+/))
            .filter(Boolean)
            .map(String);
          removeWebUserData(documentObject, id, element, normalized);
        } catch {}
        return selection;
      },
      val(...args) {
        try {
          const element = resolveElement();
          if (!element) return args.length > 0 ? selection : "";
          if (objectTarget) {
            if (args.length > 0) {
              const value = String(args[0] ?? "");
              if ("value" in element) {
                element.value = value;
                resizeWebTextarea(element);
              } else element.textContent = value;
              return selection;
            }
            return webDollarValue(element);
          }
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
      push(...items) {
        try {
          const element = resolveElement();
          return isWebHeading(element) ? mutateWebHeadingList(element, "push", items) : 0;
        } catch {
          return 0;
        }
      },
      pop() {
        try {
          const element = resolveElement();
          return isWebHeading(element) ? mutateWebHeadingList(element, "pop", []) : undefined;
        } catch {
          return undefined;
        }
      },
      shift() {
        try {
          const element = resolveElement();
          return isWebHeading(element) ? mutateWebHeadingList(element, "shift", []) : undefined;
        } catch {
          return undefined;
        }
      },
      unshift(...items) {
        try {
          const element = resolveElement();
          return isWebHeading(element) ? mutateWebHeadingList(element, "unshift", items) : 0;
        } catch {
          return 0;
        }
      },
      splice(...args) {
        try {
          const element = resolveElement();
          return isWebHeading(element) ? mutateWebHeadingList(element, "splice", args) : [];
        } catch {
          return [];
        }
      },
      slice(...args) {
        try {
          const element = resolveElement();
          if (!isWebHeading(element)) return [];
          const list = firstHeadingList(element);
          if (!list) return [];
          return directWebTaskItems(list).map(webTaskItemSnapshot).slice(...args);
        } catch {
          return [];
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
  installWebHeadingToggle(target);
  installWebLinkContext(target);
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

export async function evalFront(mod, text, scope = {}, thisArg = undefined)
{
try{

    text = text.replace(/^javascript:/, "");

    const entryMap = new Map(Object.entries(mod).filter(([name]) => name !== "$"));
    if (typeof globalThis.$ === "function")
      entryMap.set("$", globalThis.$);
    for (const [name, value] of Object.entries(scope))
      entryMap.set(name, value);
    const entries = [...entryMap];
    const names = entries.map(([name]) => name);
    const values = entries.map(([, value]) => safeFrontValue(value));

    try {
      return await new AsyncFunction(...names, `return await (${text})`).call(thisArg, ...values);
    } catch(e) {
      if (e instanceof SyntaxError)
        return await new AsyncFunction(...names, text).call(thisArg, ...values);
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
