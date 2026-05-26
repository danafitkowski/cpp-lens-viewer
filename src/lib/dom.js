export function h(tag, attrs = {}, children = null) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v);
  }
  if (children == null) return el;
  if (typeof children === 'string') el.textContent = children;
  else if (Array.isArray(children)) for (const c of children) el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  else if (children instanceof Node) el.appendChild(children);
  else el.textContent = String(children);
  return el;
}

export function on(el, event, handler) {
  el.addEventListener(event, handler);
  return () => el.removeEventListener(event, handler);
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function mount(parent, child) {
  clear(parent);
  if (child) parent.appendChild(child);
}

export function bySelector(sel, root = document) {
  return root.querySelector(sel);
}
