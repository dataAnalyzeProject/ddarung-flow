const ROUTES = new Set(['home', 'search', 'candidates', 'station', 'guide', 'planner', 'admin', 'evidence']);
const FLOW = ['search', 'candidates', 'station', 'guide'];

function currentRoute() {
  const route = location.hash.replace(/^#\/?/, '').split('?')[0];
  return ROUTES.has(route) ? route : 'home';
}

function render(route = currentRoute(), { focus = true } = {}) {
  document.querySelectorAll('[data-view]').forEach((view) => {
    const active = view.dataset.view === route;
    view.classList.toggle('is-active', active);
    view.hidden = !active;
  });

  document.querySelectorAll('.site-header nav [data-route]').forEach((link) => {
    const active = link.dataset.route === route;
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });

  const flowIndex = FLOW.indexOf(route);
  document.querySelectorAll('.route-rail [data-step]').forEach((step, index) => {
    step.classList.toggle('is-current', index === flowIndex);
    step.classList.toggle('is-done', flowIndex >= 0 && index < flowIndex);
  });

  document.querySelector('#site-nav').classList.remove('is-open');
  document.querySelector('.menu-toggle').setAttribute('aria-expanded', 'false');
  document.title = `따라가요 — ${document.querySelector(`[data-view="${route}"] h1`)?.textContent || 'Portfolio Demo'}`;
  if (focus) {
    window.scrollTo({ top: 0, behavior: 'auto' });
    document.querySelector('#app-main').focus({ preventScroll: true });
  }
}

function navigate(route) {
  const next = ROUTES.has(route) ? route : 'home';
  if (location.hash === `#${next}`) render(next);
  else location.hash = next;
}

document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-route]');
  if (!trigger) return;
  event.preventDefault();
  navigate(trigger.dataset.route);
});

document.querySelector('.menu-toggle').addEventListener('click', (event) => {
  const open = document.querySelector('#site-nav').classList.toggle('is-open');
  event.currentTarget.setAttribute('aria-expanded', String(open));
});

document.querySelector('#search-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const destination = String(data.get('destination') || '여의도공원');
  const horizon = String(data.get('horizon') || '120');
  const count = String(data.get('count') || '2대');
  document.querySelector('#candidate-summary').textContent = `${destination} · ${horizon}분 후 · ${count} 필요 · ${data.get('weather')} 예시`;
  navigate('candidates');
});

window.addEventListener('hashchange', () => render());
render(currentRoute(), { focus: false });
