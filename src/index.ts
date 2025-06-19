import { getConnectedDevices } from "./deviceDetector";

getConnectedDevices().then(devices => {
	console.log(devices);
})