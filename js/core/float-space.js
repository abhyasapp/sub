// js/core/float-space.js — reserve room under any fixed bottom overlay.

const FLOATSPACE = {
  _seen: {},
  sync(id, el) {
    if (el && el.offsetHeight) this._seen[id] = el.offsetHeight;
    else delete this._seen[id];
    const tallest = Math.max(0, ...Object.values(this._seen));
    const root = document.documentElement.style;
    if (tallest) root.setProperty('--float-h', tallest + 'px');
    else root.removeProperty('--float-h');
  }
};