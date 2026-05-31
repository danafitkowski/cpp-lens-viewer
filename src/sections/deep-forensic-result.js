import { h, clear } from '../lib/dom.js';
import { brandShareUrl } from '../mcp/lens-urls.js';

/**
 * Build the in-viewer result panel for a finished Deep Forensic run.
 * Embeds the canonical facade result (resultUrl = /lens/r/<id>) in a sandboxed
 * iframe (the viewer already supplies page chrome), with a pop-out link and a
 * Share button that copies the on-brand /r/<id> URL.
 *
 * @param {{ jobId: string, resultUrl: string }} args
 * @returns {HTMLElement}
 */
export function buildResultPanel({ jobId, resultUrl }) {
  const shareUrl = brandShareUrl(jobId);

  const popout = h('a', {
    href: resultUrl, target: '_blank', rel: 'noopener noreferrer',
    style: { color: '#0F2540', fontWeight: '700', textDecoration: 'none', fontSize: '13px' }
  }, 'pop out ↗');

  const copied = h('span', {
    style: { color: '#15803D', fontWeight: '700', fontSize: '13px', marginLeft: '8px', visibility: 'hidden' }
  }, 'Copied!');

  const fallbackSlot = h('div', {});

  const shareBtn = h('button', {
    style: {
      background: '#0F2540', color: '#fff', border: 'none', borderRadius: '4px',
      padding: '6px 14px', cursor: 'pointer', fontWeight: '700', fontSize: '13px'
    },
    onclick: async () => {
      if (!shareUrl) return;
      try {
        await navigator.clipboard.writeText(shareUrl);
        copied.style.visibility = 'visible';
        setTimeout(() => { copied.style.visibility = 'hidden'; }, 2000);
      } catch {
        // Clipboard blocked (permissions / insecure context): show a selectable
        // input so the user can copy manually.
        clear(fallbackSlot);
        const inp = h('input', {
          type: 'text', value: shareUrl, readonly: 'readonly',
          style: { width: '100%', marginTop: '6px', fontSize: '12px', padding: '4px' }
        });
        fallbackSlot.appendChild(inp);
        inp.focus(); inp.select();
      }
    }
  }, 'Share');

  const bar = h('div', {
    style: { display: 'flex', alignItems: 'center', gap: '10px', margin: '4px 0 8px' }
  }, [
    h('span', { style: { fontWeight: '700', color: '#0F2540', flex: '1' } }, 'Result'),
    shareBtn, copied, popout
  ]);

  const iframe = h('iframe', {
    src: resultUrl,
    sandbox: 'allow-scripts allow-same-origin allow-popups allow-downloads',
    referrerpolicy: 'no-referrer',
    title: 'CPP Lens forensic result',
    style: {
      display: 'block', width: '100%', height: '70vh', minHeight: '560px',
      border: '1px solid #e2e8f0', background: '#fff'
    }
  });

  return h('div', { class: 'lens-card', style: { marginTop: '12px' } }, [bar, fallbackSlot, iframe]);
}
