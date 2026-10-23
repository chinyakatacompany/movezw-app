import MapProviderSwitch from '@/components/MapProviderSwitch';
import OpenMap from '@/components/PinDropMapOpen';
import { GooglePinDropMap } from '@/components/GoogleMapsViews';

export default function PinDropMap(props) {
  return <MapProviderSwitch google={GooglePinDropMap} fallback={OpenMap} mapProps={props} />;
}
