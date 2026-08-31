import ModelReleasesPage from './ModelReleasesPage';
import { createLiveModelReleasesAdapter } from './modelReleasesAdapter';
import './modelReleases.css';

export default function ModelReleasesRoute(props) {
  return <ModelReleasesPage {...props} createAdapter={props.createAdapter || createLiveModelReleasesAdapter} />;
}
