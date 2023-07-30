import { TibberFeed, IConfig, TibberQuery } from "tibber-api";
import * as utils from "@iobroker/adapter-core";
import { ILiveMeasurement } from "tibber-api/lib/src/models/ILiveMeasurement";
import { TibberHelper } from "./tibberHelper";

export class TibberPulse extends TibberHelper {
	tibberConfig: IConfig;
	tibberQuery: TibberQuery;
	tibberFeed: TibberFeed;
	httpQueryUrl: string;

	constructor(tibberConfig: IConfig, adapter: utils.AdapterInstance) {
		super(adapter);
		this.tibberConfig = tibberConfig;
		this.tibberQuery = new TibberQuery(this.tibberConfig);
		this.tibberFeed = new TibberFeed(this.tibberQuery);
		this.httpQueryUrl = tibberConfig.apiEndpoint.queryUrl;
		this.addEventHandlerOnFeed(this.tibberFeed);
	}

	ConnectPulseStream(): void {
		try {
			this.tibberFeed.connect();
		} catch (e) {
			this.adapter.log.warn("Error on connect Feed:" + (e as Error).message);
		}
	}

	DisconnectPulseStream(): void {
		try {
			this.tibberFeed.close();
		} catch (e) {
			this.adapter.log.warn("Error on Feed closed:" + (e as Error).message);
		}

		// reinit Tibberfeed
		this.tibberFeed = new TibberFeed(new TibberQuery(this.tibberConfig));
	}

	private addEventHandlerOnFeed(currentFeed: TibberFeed): void {
		// Set info.connection state
		currentFeed.on("connected", (data) => {
			this.adapter.log.debug("Tibber Feed: " + data.toString());
			this.adapter.setState("info.connection", true, true);
		});

		// Set info.connection state
		currentFeed.on("disconnected", (data) => {
			this.adapter.log.debug("Tibber Feed: " + data.toString());
			this.adapter.setState("info.connection", false, true);
			if (this.adapter.config.FeedActive) {
				this.adapter.log.warn("Feed was disconnected. I try to reconnect in 5s");
				this.reconnect();
			}
		});

		// Add Error Handler on connection
		currentFeed.on("error", (e) => {
			this.adapter.log.error("ERROR on Tibber-Feed: " + e.toString());
		});

		// Add data receiver
		currentFeed.on("data", (data) => {
			const receivedData: ILiveMeasurement = data;
			this.fetchLiveMeasurement("LiveMeasurement", receivedData);
		});
	}

	private fetchLiveMeasurement(objectDestination: string, liveMeasurement: ILiveMeasurement): void {
		let power = 0;
		if (liveMeasurement.power > 0) {
			power = liveMeasurement.power;
		} else if (liveMeasurement.powerProduction > 0) {
			power = liveMeasurement.powerProduction * -1;
		}
		if (this.tibberConfig.homeId !== undefined) {
			this.checkAndSetValue(
				this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "timestamp"),
				liveMeasurement.timestamp,
				"Timestamp when usage occurred",
			);
			this.checkAndSetValueNumberUnit(this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "power"), power, "W", "Powerlevel measured at the moment +/-");
			this.checkAndSetValueNumberUnit(
				this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "lastMeterConsumption"),
				(Math.round(1000 * liveMeasurement.lastMeterConsumption)) / 1000, "kWh",
				"Latest consumption meter state",
			);
			this.checkAndSetValueNumberUnit(
				this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "accumulatedConsumption"),
				(Math.round(1000 * liveMeasurement.accumulatedConsumption)) / 1000, "kWh",
				"Energy consumed since midnight",
			);
			this.checkAndSetValueNumberUnit(
				this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "accumulatedProduction"),
				(Math.round(1000 * liveMeasurement.accumulatedProduction)) / 1000, "kWh",
				"Energy produced since midnight",
			);
			this.checkAndSetValueNumberUnit(
				this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "accumulatedConsumptionLastHour"),
				(Math.round(1000 * liveMeasurement.accumulatedConsumptionLastHour)) / 1000, "kWh",
				"Energy consumed since since last hour shift",
			);
			this.checkAndSetValueNumberUnit(
				this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "accumulatedProductionLastHour"),
				(Math.round(1000 * liveMeasurement.accumulatedProductionLastHour)) / 1000, "kWh",
				"Energy produced since last hour shift",
			);
			this.checkAndSetValueNumber(
				this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "accumulatedCost"),
				liveMeasurement.accumulatedCost,
				"Accumulated cost since midnight; requires active Tibber power deal",
			);
			this.checkAndSetValueNumber(
				this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "accumulatedReward"),
				liveMeasurement.accumulatedReward,
				"Accumulated reward since midnight; requires active Tibber power deal",
			);
			this.checkAndSetValue(
				this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "currency"),
				liveMeasurement.currency,
				"Currency of displayed cost; requires active Tibber power deal",
			);
			this.checkAndSetValueNumberUnit(
				this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "minPower"),
				liveMeasurement.minPower, "W",
				"Min consumption since midnight",
			);
			this.checkAndSetValueNumberUnit(
				this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "averagePower"),
				liveMeasurement.averagePower, "W",
				"Average consumption since midnight",
			);
			this.checkAndSetValueNumberUnit(
				this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "maxPower"),
				liveMeasurement.maxPower, "W",
				"Peak consumption since midnight",
			);
			this.checkAndSetValueNumberUnit(
				this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "powerConsumption"),
				liveMeasurement.power, "W",
				"Net consumption (A+) at the moment",
			);
			this.checkAndSetValueNumberUnit(
				this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "powerProduction"),
				liveMeasurement.powerProduction, "W",
				"Net production (A-) at the moment",
			);
			this.checkAndSetValueNumberUnit(
				this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "minPowerProduction"),
				liveMeasurement.minPowerProduction, "W",
				"Min net production since midnight",
			);
			this.checkAndSetValueNumberUnit(
				this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "maxPowerProduction"),
				liveMeasurement.maxPowerProduction, "W",
				"Max net production since midnight",
			);
			this.checkAndSetValueNumberUnit(
				this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "lastMeterProduction"),
				(Math.round(1000 * liveMeasurement.lastMeterProduction)) / 1000, "kWh",
				"Latest production meter state",
			);
			this.checkAndSetValueNumber(
				this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "powerFactor"),
				liveMeasurement.powerFactor,
				"Power factor (active power / apparent power)",
			);
			this.checkAndSetValueNumberUnit(
				this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "voltagePhase1"),
				liveMeasurement.voltagePhase1, "V", "Voltage on phase 1; on some meters this value is not part of every data frame therefore the value is null at some timestamps");
				// "Voltage on phase 1; on Kaifa and Aidon meters the value is not part of every HAN data frame therefore the value is null at timestamps with second value other than 0, 10, 20, 30, 40, 50. There can be other deviations based on concrete meter firmware."
			this.checkAndSetValueNumberUnit(
				this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "voltagePhase2"),
				liveMeasurement.voltagePhase2, "V", "Voltage on phase 2; on some meters this value is not part of every data frame therefore the value is null at some timestamps");
				// "Voltage on phase 2; on Kaifa and Aidon meters the value is not part of every HAN data frame therefore the value is null at timestamps with second value other than 0, 10, 20, 30, 40, 50. There can be other deviations based on concrete meter firmware."
			this.checkAndSetValueNumberUnit(
				this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "voltagePhase3"),
				liveMeasurement.voltagePhase3, "V", "Voltage on phase 3; on some meters this value is not part of every data frame therefore the value is null at some timestamps");
				// "Voltage on phase 3; on Kaifa and Aidon meters the value is not part of every HAN data frame therefore the value is null at timestamps with second value other than 0, 10, 20, 30, 40, 50. There can be other deviations based on concrete meter firmware."
			this.checkAndSetValueNumberUnit(
				this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "currentL1"),
				liveMeasurement.currentL1, "A", "Current on L1; on some meters this value is not part of every data frame therefore the value is null at some timestamps");
				// "Current on L1; on Kaifa and Aidon meters the value is not part of every HAN data frame therefore the value is null at timestamps with second value other than 0, 10, 20, 30, 40, 50. There can be other deviations based on concrete meter firmware."
			this.checkAndSetValueNumberUnit(
				this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "currentL2"),
				liveMeasurement.currentL2, "A", "Current on L2; on some meters this value is not part of every data frame therefore the value is null at some timestamps");
				// "Current on L2; on Kaifa and Aidon meters the value is not part of every HAN data frame therefore the value is null at timestamps with second value other than 0, 10, 20, 30, 40, 50. There can be other deviations based on concrete meter firmware."
			this.checkAndSetValueNumberUnit(
				this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "currentL3"),
				liveMeasurement.currentL3, "A", "Current on L3; on some meters this value is not part of every data frame therefore the value is null at some timestamps");
				// "Current on L3; on Kaifa and Aidon meters the value is not part of every HAN data frame therefore the value is null at timestamps with second value other than 0, 10, 20, 30, 40, 50. There can be other deviations based on concrete meter firmware."
			this.checkAndSetValueNumber(
				this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "signalStrength"),
				liveMeasurement.signalStrength,
				"Device signal strength (Pulse - dB; Watty - percent)",
			);
		}
	}

	private reconnect(): void {
		const reconnectionInterval: any = this.adapter.setInterval(() => {
			if (!this.tibberFeed.connected) {
				this.adapter.log.debug("No TibberFeed connected try reconnecting now in 5sec interval!");
				this.ConnectPulseStream();
			} else {
				this.adapter.log.debug("Reconnection successful! Interval not necessary (anymore).");
				this.adapter.clearInterval(reconnectionInterval);
			}
		}, 5000);
	}
}