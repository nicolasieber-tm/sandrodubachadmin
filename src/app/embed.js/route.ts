// Liefert das Einbettungs-Skript für die Hauptwebsite aus.
//
// Pfad-Trick: Das Verzeichnis heisst wörtlich `embed.js`, daher mappt Next den
// Route-Handler auf den Pfad `/embed.js` (der Punkt ist Teil des Segments, kein
// Sonderzeichen). Ausgeliefert wird reines Vanilla-JS als Template-String.

const EMBED_JS = `(function () {
  'use strict';

  // App-Origin aus der src des eigenen <script>-Tags ableiten.
  var self = document.currentScript;
  var origin = (function () {
    try {
      return new URL(self.src).origin;
    } catch (e) {
      return window.location.origin;
    }
  })();

  var BOOK_URL = origin + '/book';
  var MIN_HEIGHT = 120;
  // Das iframe bekommt eine FESTE, bildschirmabhaengige Hoehe: dieser Anteil des
  // Viewports. Es richtet sich also nach dem Geraet, auf dem es angezeigt wird
  // (Rotation/Resize eingeschlossen) – aber NICHT nach dem Inhalt. Passt ein
  // Schritt in diese Hoehe, erscheint kein Scrollbalken; ist er hoeher (langes
  // Formular), wird IM iframe gescrollt. So „springt" das Fenster nie zwischen
  // den Schritten und passt trotzdem immer auf den Bildschirm.
  var FRAME_VH = 0.92;

  var overlay = null;
  var iframe = null;
  var onMessage = null;
  var onKey = null;
  var onResize = null;
  var prevHtmlOverflow = '';

  // iframe auf die feste, bildschirmabhaengige Hoehe setzen. Wird initial und bei
  // jeder Fenster-/Rotations-Aenderung aufgerufen, damit es immer zum aktuellen
  // Bildschirm passt. Inhalt, der nicht hineinpasst, ist dank scrolling="auto"
  // im iframe scrollbar (statt abgeschnitten).
  function applyHeight() {
    if (!iframe) return;
    var h = Math.max(MIN_HEIGHT, Math.floor(window.innerHeight * FRAME_VH));
    iframe.style.height = h + 'px';
  }

  function closeOverlay() {
    if (!overlay) return;
    if (onMessage) window.removeEventListener('message', onMessage);
    if (onKey) document.removeEventListener('keydown', onKey);
    if (onResize) window.removeEventListener('resize', onResize);
    onMessage = null;
    onKey = null;
    onResize = null;
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
    iframe = null;
    // Hintergrund-Scroll der Hauptseite wiederherstellen.
    document.documentElement.style.overflow = prevHtmlOverflow;
  }

  function openOverlay() {
    if (overlay) return;

    // Hintergrund-Scroll der Hauptseite sperren, solange das Overlay offen ist.
    prevHtmlOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';

    overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:2147483000',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'padding:20px',
      'background:rgba(20,24,32,0.55)',
      'backdrop-filter:blur(2px)',
      '-webkit-backdrop-filter:blur(2px)'
    ].join(';');

    var frameWrap = document.createElement('div');
    frameWrap.style.cssText = [
      'position:relative',
      'width:100%',
      'max-width:520px',
      'max-height:92vh',
      'background:#fbf1e6',
      'border-radius:18px',
      'overflow:hidden',
      'box-shadow:0 24px 60px -16px rgba(20,25,35,0.5)'
    ].join(';');

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Schliessen');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.cssText = [
      'position:absolute',
      'top:10px',
      'right:10px',
      'z-index:2',
      'width:32px',
      'height:32px',
      'border:none',
      'border-radius:9px',
      'background:rgba(244,245,247,0.92)',
      'color:#5a616b',
      'font-size:20px',
      'line-height:1',
      'cursor:pointer',
      'display:flex',
      'align-items:center',
      'justify-content:center'
    ].join(';');
    closeBtn.addEventListener('click', closeOverlay);

    iframe = document.createElement('iframe');
    iframe.src = BOOK_URL;
    iframe.title = 'Termin buchen';
    iframe.setAttribute('frameborder', '0');
    // Scrollen erlaubt: passt ein Schritt in die feste Hoehe, erscheint kein
    // Balken; ist er hoeher, bleibt der Rest im iframe scrollbar.
    iframe.setAttribute('scrolling', 'auto');
    iframe.style.cssText = [
      'display:block',
      'width:100%',
      'height:' + MIN_HEIGHT + 'px',
      'border:0',
      'overflow:auto',
      '-webkit-overflow-scrolling:touch',
      'background:#fbf1e6'
    ].join(';');
    // Feste Hoehe sofort setzen, bevor das Overlay sichtbar wird (kein Aufblitzen).
    applyHeight();

    frameWrap.appendChild(closeBtn);
    frameWrap.appendChild(iframe);
    overlay.appendChild(frameWrap);

    // Klick auf den Backdrop (ausserhalb der Karte) schliesst das Overlay.
    overlay.addEventListener('click', function (ev) {
      if (ev.target === overlay) closeOverlay();
    });

    onKey = function (ev) {
      if (ev.key === 'Escape') closeOverlay();
    };
    document.addEventListener('keydown', onKey);

    onMessage = function (ev) {
      var data = ev.data;
      if (!data || data.type !== 'sd-booking') return;
      // Nur noch die Erfolgs-Meldung wird gebraucht (Auto-Schliessen nach der
      // Buchung); die Hoehe ist fix und haengt nicht mehr am Inhalt.
      if (data.event === 'success') {
        window.setTimeout(closeOverlay, 2600);
      }
    };
    window.addEventListener('message', onMessage);

    // Bei Viewport-Aenderung (Resize/Rotation) Hoehe neu einpassen.
    onResize = applyHeight;
    window.addEventListener('resize', onResize);

    document.body.appendChild(overlay);
  }

  function bindTriggers() {
    var triggers = document.querySelectorAll('[data-sd-book]');
    if (triggers.length > 0) {
      for (var i = 0; i < triggers.length; i++) {
        triggers[i].addEventListener('click', function (ev) {
          ev.preventDefault();
          openOverlay();
        });
      }
      return;
    }

    // Kein Trigger vorhanden: fixierten Fallback-Button unten rechts erzeugen.
    var fab = document.createElement('button');
    fab.type = 'button';
    fab.textContent = 'Termin buchen';
    fab.setAttribute('data-sd-book', '');
    fab.style.cssText = [
      'position:fixed',
      'right:20px',
      'bottom:20px',
      'z-index:2147482000',
      'padding:12px 18px',
      'border:1px solid #c75f1f',
      'border-radius:999px',
      'background:linear-gradient(180deg,#ec7d34,#dd6a23)',
      'color:#ffffff',
      'font:600 14px/1 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif',
      'cursor:pointer',
      'box-shadow:0 8px 22px -8px rgba(199,95,31,0.6)'
    ].join(';');
    fab.addEventListener('click', openOverlay);
    document.body.appendChild(fab);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindTriggers);
  } else {
    bindTriggers();
  }
})();
`;

export async function GET(): Promise<Response> {
  return new Response(EMBED_JS, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
