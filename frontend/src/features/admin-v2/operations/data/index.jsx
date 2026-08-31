import OperationsDataStatusPage from './OperationsDataStatusPage';
import { createOperationsDataStatusAdapter } from './operationsDataStatusAdapter';
import './operationsDataStatus.css';

export { OperationsDataStatusPage };

export default function OperationsDataStatusEntry(props) {
  return <OperationsDataStatusPage {...props} createAdapter={props.createAdapter || createOperationsDataStatusAdapter} />;
}
