import SystemSupportPage from './SystemSupportPage';
import { createSystemSupportAdapter } from './systemSupportAdapter';
import './systemSupport.css';

export { SystemSupportPage };

export default function SystemSupportEntry(props) {
  return <SystemSupportPage {...props} createAdapter={props.createAdapter || createSystemSupportAdapter} />;
}
