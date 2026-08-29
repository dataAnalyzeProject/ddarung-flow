import { dashboardFixture } from './dashboardFixtures.js';

export function createFixtureOpsDashboardAdapter({ fixtureName }) {
  return { load: () => Promise.resolve().then(() => dashboardFixture(fixtureName)) };
}
