import OpsDashboard from './OpsDashboard';
import { createFixtureOpsDashboardAdapter } from './fixtureOpsDashboardAdapter';
import { createLiveOpsDashboardAdapter } from './liveOpsDashboardAdapter';
import './opsDashboard.css';

function fixtureName() {
  if (process.env.NODE_ENV === 'production' && process.env.REACT_APP_STATIC_DEMO !== 'true') return null;
  return new URLSearchParams(window.location.search).get('opsFixture');
}

export function createDashboardAdapter() {
  const requestedFixture = process.env.REACT_APP_STATIC_DEMO === 'true' ? 'SUCCESS' : fixtureName();
  return requestedFixture ? () => createFixtureOpsDashboardAdapter({ fixtureName: requestedFixture }) : createLiveOpsDashboardAdapter;
}

export default function OpsDashboardEntry(props) {
  return <OpsDashboard {...props} createAdapter={props.createAdapter || createDashboardAdapter()} />;
}
