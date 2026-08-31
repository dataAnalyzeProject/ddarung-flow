import SystemAuditPage from './SystemAuditPage';
import { createSystemAuditAdapter } from './systemAuditAdapter';
import './systemAudit.css';

export { SystemAuditPage };

export default function SystemAuditEntry(props) {
  return <SystemAuditPage {...props} createAdapter={props.createAdapter || createSystemAuditAdapter} />;
}
