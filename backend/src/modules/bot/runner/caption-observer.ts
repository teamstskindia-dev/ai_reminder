export interface CaptionSelectors {
  captionsRegion: string;
  captionBlock: string;
  captionSpeaker: string;
  captionText: string;
}

/**
 * Builds the JavaScript evaluated inside the Meet page. It watches the DOM with a
 * MutationObserver and, at most every ~250ms, reads each caption block (speaker + text)
 * using the admin-configurable selectors, calling `window[bindingName](speaker, text)`
 * only when a block's text changed. Invalid/missing selectors never throw.
 */
export function captionObserverScript(selectors: CaptionSelectors, bindingName: string): string {
  const config = JSON.stringify({ ...selectors, bindingName });
  return `(() => {
  const cfg = ${config};
  if (window.__remiCaptionObserver) return 'already-installed';
  const safeAll = (root, sel) => {
    if (!root || !sel) return [];
    try { return Array.from(root.querySelectorAll(sel)); } catch (e) { return []; }
  };
  const safeOne = (root, sel) => {
    if (!root || !sel) return null;
    try { return root.querySelector(sel); } catch (e) { return null; }
  };
  const textOf = (el) => (el && (el.innerText || el.textContent) || '').replace(/\\s+/g, ' ').trim();
  const lastSent = new WeakMap();
  let scheduled = false;

  const scan = () => {
    scheduled = false;
    const send = window[cfg.bindingName];
    if (typeof send !== 'function') return;
    const region = safeOne(document, cfg.captionsRegion);
    let blocks = safeAll(document, cfg.captionBlock);
    if (!blocks.length && region) blocks = Array.from(region.children || []);
    for (const block of blocks) {
      const speakerEl = safeOne(block, cfg.captionSpeaker);
      const textEl = safeOne(block, cfg.captionText);
      const speaker = textOf(speakerEl);
      let text = textOf(textEl);
      if (!text) {
        text = textOf(block);
        if (speaker && text.startsWith(speaker)) text = text.slice(speaker.length).trim();
      }
      if (!text) continue;
      const key = speaker + '\\u0000' + text;
      if (lastSent.get(block) === key) continue;
      lastSent.set(block, key);
      try { send(speaker || 'Unknown', text); } catch (e) { /* binding unavailable */ }
    }
  };

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(scan, 250);
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement || document, { subtree: true, childList: true, characterData: true });
  window.__remiCaptionObserver = observer;
  schedule();
  return 'installed';
})()`;
}
