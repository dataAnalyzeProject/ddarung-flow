import AnalysisPage from './AnalysisPage';
import { createLiveAnalysisAdapter } from './liveAnalysisAdapter';
import './analysis.css';
import './analysisLayout.css';

export { AnalysisPage };

export default function AnalysisEntry(props) {
  return <AnalysisPage {...props} createAdapter={props.createAdapter || createLiveAnalysisAdapter} />;
}
