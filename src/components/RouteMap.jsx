import MapProviderSwitch from '@/components/MapProviderSwitch';
import OpenMap from '@/components/RouteMapOpen';
import { GoogleRouteMap } from '@/components/GoogleMapsViews';

export default function RouteMap(props) {
  return <MapProviderSwitch google={GoogleRouteMap} fallback={OpenMap} mapProps={props} />;
}
