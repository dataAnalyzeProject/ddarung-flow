import OpsDashboard from './OpsDashboard';
import { createFixtureOpsDashboardAdapter } from './fixtureOpsDashboardAdapter';
import { createLiveOpsDashboardAdapter } from './liveOpsDashboardAdapter';
import './opsDashboard.css';

function fixtureName() {
  if (process.env.NODE_ENV === 'production') return null;
  return new URLSearchParams(window.location.search).get('opsFixture');
}

export function createDashboardAdapter() {
  const requestedFixture = fixtureName();
  return requestedFixture ? () => createFixtureOpsDashboardAdapter({ fixtureName: requestedFixture }) : createLiveOpsDashboardAdapter;
}

export default function OpsDashboardEntry(props) {
  return <OpsDashboard {...props} createAdapter={props.createAdapter || createDashboardAdapter()} />;
}
