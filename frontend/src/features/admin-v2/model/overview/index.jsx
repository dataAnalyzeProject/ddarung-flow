import ModelOverview from './ModelOverview';
import { createLiveModelOverviewAdapter } from './modelOverviewAdapter';

export default function ModelOverviewRoute({ createAdapter = createLiveModelOverviewAdapter }) {
  return <ModelOverview createAdapter={createAdapter} />;
}
