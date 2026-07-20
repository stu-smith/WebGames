/* Shared "How to Play" flyout behaviour.
 * Progressive enhancement: the panel content is in the DOM (crawlable);
 * this just toggles the open/closed state. */
(function () {
  var flyout = document.getElementById('flyout');
  if (!flyout) return;

  var tab = flyout.querySelector('.flyout__tab');
  var scrim = document.getElementById('flyout-scrim');

  function setOpen(open) {
    flyout.classList.toggle('is-open', open);
    if (scrim) scrim.classList.toggle('is-visible', open);
    if (tab) tab.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  if (tab) {
    tab.addEventListener('click', function () {
      setOpen(!flyout.classList.contains('is-open'));
    });
  }

  if (scrim) {
    scrim.addEventListener('click', function () {
      setOpen(false);
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && flyout.classList.contains('is-open')) {
      setOpen(false);
    }
  });
})();
