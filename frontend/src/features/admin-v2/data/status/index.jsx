import DataStatusPage from './DataStatusPage';
import { createDataStatusAdapter } from './dataStatusAdapter';
import '../../../admin-v2/operations/data/operationsDataStatus.css';
import './dataStatus.css';

export default function DataStatusRoute({ createAdapter = createDataStatusAdapter }) {
  return <DataStatusPage createAdapter={createAdapter} />;
}
