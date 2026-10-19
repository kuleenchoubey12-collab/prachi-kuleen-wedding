/* Small, dependency-free motion and private RSVP reveal. No guest data is bundled. */
(() => {
  'use strict';
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let layer;
  function confetti(count = 16) {
    if (reduced()) return;
    layer ||= Object.assign(document.createElement('div'), {className: 'pk-confetti'});
    layer.setAttribute('aria-hidden', 'true');
    if (!layer.isConnected) document.body.append(layer);
    const available = Math.max(0, 60 - layer.childElementCount);
    for (let i = 0; i < Math.min(count, available); i++) {
      const bit = document.createElement('i');
      bit.style.cssText = `left:${Math.random()*100}%;--drift:${Math.random()*160-80}px;--spin:${Math.random()*600-300}deg;--delay:${Math.random()*250}ms;background:${['#b38b40','#e6c875','#bd6075','#f0ddae'][i%4]}`;
      layer.append(bit);
      setTimeout(() => bit.remove(), 2300);
    }
  }
  function observe(scope = document) {
    if (reduced() || !('IntersectionObserver' in window)) return;
    const elements = scope.querySelectorAll('.intro-inner > h1,.intro-inner > p,.poster-head,.photo-wrap,.details,.poster-note,.rsvp-intro > h2,.form-heading,.movie-reward > h2,.golden > .celebration-photo,.golden > h1,.golden > .intro-copy,.event-card');
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        entry.target.classList.add('pk-visible');
        observer.unobserve(entry.target);
      }
    }, {threshold: 0.06});
    elements.forEach(el => {
      if (el.dataset.pkObserved) return;
      el.dataset.pkObserved = 'true';
      el.classList.add('pk-reveal');
      observer.observe(el);
    });
  }
  let activeDialog;
  function reveal({name, joke}) {
    if (activeDialog?.open) return;
    const dialog = document.createElement('dialog');
    dialog.className = 'pk-reveal-dialog';
    dialog.setAttribute('aria-labelledby', 'pk-reveal-title');
    // All API-derived values below use textContent, never HTML interpolation.
    dialog.innerHTML = '<button type="button" class="pk-dismiss" aria-label="Return to your saved RSVP">Back to my RSVP ×</button><div class="pk-reveal-inner"><p class="pk-sr" id="pk-reveal-title"></p><h2 aria-hidden="true"></h2><p class="pk-joke" aria-hidden="true"></p><a class="pk-yes" href="golden-ticket.html" hidden>hell yeah!!</a><button class="pk-skip" type="button">Skip animation ↗</button></div>';
    const heading = dialog.querySelector('h2'), text = dialog.querySelector('.pk-joke');
    const yes = dialog.querySelector('.pk-yes'), skip = dialog.querySelector('.pk-skip');
    const greeting = `${String(name || 'You').trim()}?`;
    const punchline = String(joke || 'We thought we recognised someone rather special.');
    dialog.querySelector('#pk-reveal-title').textContent = greeting + ' ' + punchline;
    let timer, finished = false;
    const previousFocus = document.activeElement, previousOverflow = document.body.style.overflow;
    function finish() {
      if (finished) return;
      finished = true; clearTimeout(timer);
      heading.textContent = greeting; text.textContent = punchline;
      yes.hidden = false; skip.hidden = true;
      if (document.activeElement === skip) yes.focus();
    }
    function type(target, value, next) {
      let n = 0;
      const characters = Array.from(value);
      const step = Math.max(1, Math.ceil((greeting.length + punchline.length) / 140));
      const tick = () => {
        if (finished || !dialog.open) return;
        n += step; target.textContent = characters.slice(0,n).join('');
        if (n < characters.length) timer = setTimeout(tick, 32);
        else timer = setTimeout(next, 220);
      };
      tick();
    }
    dialog.querySelector('.pk-dismiss').addEventListener('click', () => dialog.close());
    skip.addEventListener('click', finish);
    dialog.addEventListener('close', () => {
      finished = true; clearTimeout(timer); document.body.style.overflow = previousOverflow;
      activeDialog = null; dialog.remove();
      if (previousFocus?.isConnected) previousFocus.focus({preventScroll:true});
    }, {once:true});
    document.body.append(dialog);
    if (typeof dialog.showModal !== 'function') {
      dialog.remove(); location.assign('golden-ticket.html'); return;
    }
    activeDialog = dialog; document.body.style.overflow = 'hidden'; dialog.showModal();
    if (reduced()) finish();
    else timer = setTimeout(() => type(heading, greeting, () => type(text, punchline, finish)), 500);
  }
  window.WeddingFX = {confetti, observe, reveal};
  observe();
})();
