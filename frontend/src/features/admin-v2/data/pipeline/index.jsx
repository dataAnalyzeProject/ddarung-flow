import DataPipelinePage from './DataPipelinePage';
import { createDataPipelineAdapter } from './dataPipelineAdapter';
import '../../operations/data/operationsDataStatus.css';
import './dataPipeline.css';

export default function DataPipelineRoute({ createAdapter = createDataPipelineAdapter }) {
  return <DataPipelinePage createAdapter={createAdapter} />;
}
