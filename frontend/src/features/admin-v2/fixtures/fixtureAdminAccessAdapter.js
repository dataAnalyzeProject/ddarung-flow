import { permissionsForRoles } from '../permissions/permissions';

const FIXTURE_TIME = '2026-08-28T09:00:00Z';
const READY_FIXTURES = {
  OPS_VIEWER: { adminRoles: ['OPS_VIEWER'], defaultConsole: 'OPS' },
  OPS_OPERATOR: { adminRoles: ['OPS_OPERATOR'], defaultConsole: 'OPS' },
  OPS_MANAGER: { adminRoles: ['OPS_MANAGER'], defaultConsole: 'OPS' },
  DATA_ANALYST: { adminRoles: ['DATA_ANALYST'], defaultConsole: 'OPS' },
  MODEL_ENGINEER: { adminRoles: ['MODEL_ENGINEER'], defaultConsole: 'MODEL' },
  MODEL_APPROVER: { adminRoles: ['MODEL_APPROVER'], defaultConsole: 'MODEL' },
  SUPPORT_OPERATOR: { adminRoles: ['SUPPORT_OPERATOR'], defaultConsole: 'SYSTEM' },
  AUDITOR: { adminRoles: ['AUDITOR'], defaultConsole: 'SYSTEM' },
  ACCESS_ADMIN: { adminRoles: ['ACCESS_ADMIN'], defaultConsole: 'SYSTEM' },
  SUPER_ADMIN: { adminRoles: ['SUPER_ADMIN'], defaultConsole: 'OPS' },
};

function unavailable(state, code) {
  return { state, code, adminRoles: [], permissions: [], defaultConsole: null, generatedAt: null, source: 'FIXTURE' };
}

export function createFixtureAdminAccessAdapter({ fixtureId = 'OPS_VIEWER' } = {}) {
  return {
    load({ signal } = {}) {
      if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
      if (fixtureId === 'AUTH_REQUIRED') return Promise.resolve(unavailable('AUTH_REQUIRED', 'AUTH_REQUIRED'));
      if (fixtureId === 'ADMIN_ACCESS_DENIED') return Promise.resolve(unavailable('ADMIN_ACCESS_DENIED', 'ADMIN_ACCESS_DENIED'));
      if (fixtureId === 'ACCESS_ERROR' || !READY_FIXTURES[fixtureId]) return Promise.resolve(unavailable('ACCESS_ERROR', 'ADMIN_ACCESS_UNAVAILABLE'));
      const fixture = READY_FIXTURES[fixtureId];
      return Promise.resolve({ state: 'READY', adminRoles: fixture.adminRoles, permissions: permissionsForRoles(fixture.adminRoles), defaultConsole: fixture.defaultConsole, generatedAt: FIXTURE_TIME, source: 'FIXTURE' });
    },
  };
}
