import MapProviderSwitch from '@/components/MapProviderSwitch';
import OpenMap from '@/components/ShipmentMapOpen';
import { GoogleShipmentMap } from '@/components/GoogleMapsViews';

export default function ShipmentMap(props) {
  return <MapProviderSwitch google={GoogleShipmentMap} fallback={OpenMap} mapProps={props} />;
}
