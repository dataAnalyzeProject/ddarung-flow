import CandidatesPage from './CandidatesPage';
import { createLiveCandidatesAdapter } from './liveCandidatesAdapter';
import './candidates.css';

export { CandidatesPage };

export default function CandidatesEntry(props) {
  return <CandidatesPage {...props} createAdapter={props.createAdapter || createLiveCandidatesAdapter} />;
}
