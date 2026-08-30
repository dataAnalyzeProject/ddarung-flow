import RiskMapPage from './RiskMapPage';
import { createDefaultRiskMapAdapter } from './liveRiskMapAdapter';
import './riskMap.css';

export { RiskMapPage };
export default function RiskMapEntry(props) {
  return <RiskMapPage {...props} createDataAdapter={props.createDataAdapter || createDefaultRiskMapAdapter} />;
}
