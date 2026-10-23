import MapProviderSwitch from '@/components/MapProviderSwitch';
import OpenMap from '@/components/HomeMapOpen';
import { GoogleHomeMap } from '@/components/GoogleMapsViews';

export default function HomeMap(props) {
  return <MapProviderSwitch google={GoogleHomeMap} fallback={OpenMap} mapProps={props} />;
}
