import ModelPerformancePage from './ModelPerformancePage';
import { createLiveModelPerformanceAdapter } from './modelPerformanceAdapter';

export default function ModelPerformanceRoute({ createAdapter = createLiveModelPerformanceAdapter }) {
  return <ModelPerformancePage createAdapter={createAdapter} />;
}
