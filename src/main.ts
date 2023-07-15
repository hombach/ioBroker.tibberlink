// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from "@iobroker/adapter-core";
import { IConfig } from "tibber-api";
import { TibberAPICaller } from "./lib/tibberAPICaller";
import { TibberPulse } from "./lib/tibberPulse";

class Tibberlink extends utils.Adapter {
	intervallList: ioBroker.Interval[];
	homeIdList: string[];
	queryUrl = "";

	public constructor(options: Partial<utils.AdapterOptions> = {}) {
		super({
			...options,
			name: "tibberlink",
		});
		this.on("ready", this.onReady.bind(this));
		this.on("stateChange", this.onStateChange.bind(this));
		// this.on("objectChange", this.onObjectChange.bind(this));
		// this.on("message", this.onMessage.bind(this));
		this.on("unload", this.onUnload.bind(this));
		this.homeIdList = [];
		this.intervallList = [];
		this.queryUrl = "https://api.tibber.com/v1-beta/gql";
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	private async onReady(): Promise<void> {
		// Reset the connection indicator during startup;
		if (!this.config.TibberAPIToken) {
			// No Token defined in configuration
			this.log.warn("Missing API Token - please check configuration");
			this.setState("info.connection", false, true);
		} else {
			// Need 2 configs - API and Feed (feed changed query url)
			const tibberConfigAPI: IConfig = {
				active: true,
				apiEndpoint: {
					apiKey: this.config.TibberAPIToken,
					queryUrl: this.queryUrl,
				},
			};
			const tibberConfigFeed: IConfig = {
				active: true,
				apiEndpoint: {
					apiKey: this.config.TibberAPIToken,
					queryUrl: this.queryUrl,
				},
			};
			// Now read all Data from API
			const tibberAPICaller = new TibberAPICaller(tibberConfigAPI, this);
			try {
				this.homeIdList = await tibberAPICaller.updateHomesFromAPI();
			} catch (error: any) {
				this.log.warn(tibberAPICaller.generateErrorMessage(error, "Abruf 'homes'"));
			}
			// if feed is not used - set info.connection if data received
			if (!this.config.FeedActive) {
				if (this.homeIdList) {
					this.setState("info.connection", true, true);
					this.log.debug(
						"Connection Check: Feed not enabled and I received home list from api - good connection",
					);
				} else {
					this.setState("info.connection", false, true);
					this.log.debug(
						"Connection Check: Feed not enabled and I do not get home list from api - bad connection",
					);
				}
			}

			// sentry.io ping
			if (this.supportsFeature && this.supportsFeature("PLUGINS")) {
				const sentryInstance = this.getPluginInstance("sentry");
				const today = new Date();
				//var last = await this.getStateAsync('LastSentryLogDay')
				//if (last?.val != await today.getDate()) {
				if (sentryInstance) {
					const Sentry = sentryInstance.getSentryObject();
					Sentry && Sentry.withScope(
						(scope: {
							setLevel: (arg0: string) => void;
							setTag: (arg0: string, arg1: number) => void;
						}) => {
							scope.setLevel("info");
							scope.setTag("SentryDay", today.getDate());
							scope.setTag("HomeIDs", this.homeIdList.length);
							Sentry.captureMessage("Adapter TibberLink started", "info"); // Level "info"
						}
					);
				}
				// this.setStateAsync("LastSentryLoggedError", { val: "unknown", ack: true }); // Clean last error every adapter start
				// this.setStateAsync("LastSentryLogDay", { val: today.getDate(), ack: true });
				// }
			}

			// Init Load Data for home
			if (this.homeIdList.length > 0) {
				for (const index in this.homeIdList) {
					try {
						await tibberAPICaller.updateCurrentPrice(this.homeIdList[index]);
					} catch (error: any) {
						this.log.warn(tibberAPICaller.generateErrorMessage(error, "Abruf 'Aktueller Preis'"));
					}

					try {
						await tibberAPICaller.updatePricesToday(this.homeIdList[index]);
					} catch (error: any) {
						this.log.warn(tibberAPICaller.generateErrorMessage(error, "Abruf 'Preise von heute'"));
					}

					try {
						await tibberAPICaller.updatePricesTomorrow(this.homeIdList[index]);
					} catch (error: any) {
						this.log.warn(tibberAPICaller.generateErrorMessage(error, "Abruf 'Preise von morgen'"));
					}
				}
			}
			const energyPriceCallIntervall = this.setInterval(() => {
				if (this.homeIdList.length > 0) {
					for (const index in this.homeIdList) {
						try {
							tibberAPICaller.updateCurrentPrice(this.homeIdList[index]);
						} catch (error: any) {
							this.log.warn(tibberAPICaller.generateErrorMessage(error, "Abruf 'Aktueller Preis'"));
						}
					}
				}
			}, 300000);
			this.intervallList.push(energyPriceCallIntervall);

			const energyPricesListUpdateInterval = this.setInterval(() => {
				if (this.homeIdList.length > 0) {
					for (const index in this.homeIdList) {
						try {
							tibberAPICaller.updatePricesToday(this.homeIdList[index]);
						} catch (error: any) {
							this.log.warn(tibberAPICaller.generateErrorMessage(error, "Abruf 'Preise von heute'"));
						}

						try {
							tibberAPICaller.updatePricesTomorrow(this.homeIdList[index]);
						} catch (error: any) {
							this.log.warn(tibberAPICaller.generateErrorMessage(error, "Abruf 'Preise von morgen'"));
						}
					}
				}
			}, 300000);
			this.intervallList.push(energyPricesListUpdateInterval);

			// If User uses TibberConfig - start connection
			if (this.config.FeedActive) {
				for (const index in this.homeIdList) {
					try {
						tibberConfigFeed.homeId = this.homeIdList[index];
						// define fields for Datafeed
						tibberConfigFeed.timestamp = true;
						tibberConfigFeed.power = true;
						if (this.config.FeedConfigLastMeterConsumption) {
							tibberConfigFeed.lastMeterConsumption = true;
						}
						if (this.config.FeedConfigAccumulatedConsumption) {
							tibberConfigFeed.accumulatedConsumption = true;
						}
						if (this.config.FeedConfigAccumulatedProduction) {
							tibberConfigFeed.accumulatedProduction = true;
						}
						if (this.config.FeedConfigAccumulatedConsumptionLastHour) {
							tibberConfigFeed.accumulatedConsumptionLastHour = true;
						}
						if (this.config.FeedConfigAccumulatedProductionLastHour) {
							tibberConfigFeed.accumulatedProductionLastHour = true;
						}
						if (this.config.FeedConfigAccumulatedCost) {
							tibberConfigFeed.accumulatedCost = true;
						}
						if (this.config.FeedConfigAccumulatedCost) {
							tibberConfigFeed.accumulatedReward = true;
						}
						if (this.config.FeedConfigCurrency) {
							tibberConfigFeed.currency = true;
						}
						if (this.config.FeedConfigMinPower) {
							tibberConfigFeed.minPower = true;
						}
						if (this.config.FeedConfigAveragePower) {
							tibberConfigFeed.averagePower = true;
						}
						if (this.config.FeedConfigMaxPower) {
							tibberConfigFeed.maxPower = true;
						}
						if (this.config.FeedConfigPowerProduction) {
							tibberConfigFeed.powerProduction = true;
						}
						if (this.config.FeedConfigMinPowerProduction) {
							tibberConfigFeed.minPowerProduction = true;
						}
						if (this.config.FeedConfigMaxPowerProduction) {
							tibberConfigFeed.maxPowerProduction = true;
						}
						if (this.config.FeedConfigLastMeterProduction) {
							tibberConfigFeed.lastMeterProduction = true;
						}
						if (this.config.FeedConfigPowerFactor) {
							tibberConfigFeed.powerFactor = true;
						}
						if (this.config.FeedConfigVoltagePhase1) {
							tibberConfigFeed.voltagePhase1 = true;
						}
						if (this.config.FeedConfigVoltagePhase2) {
							tibberConfigFeed.voltagePhase2 = true;
						}
						if (this.config.FeedConfigVoltagePhase3) {
							tibberConfigFeed.voltagePhase3 = true;
						}
						if (this.config.FeedConfigCurrentL1) {
							tibberConfigFeed.currentL1 = true;
						}
						if (this.config.FeedConfigCurrentL2) {
							tibberConfigFeed.currentL2 = true;
						}
						if (this.config.FeedConfigCurrentL3) {
							tibberConfigFeed.currentL3 = true;
						}
						if (this.config.FeedConfigSignalStrength) {
							tibberConfigFeed.signalStrength = true;
						}
						const tibberPulse = new TibberPulse(tibberConfigFeed, this);
						tibberPulse.ConnectPulseStream();
					} catch (e) {
						this.log.warn((e as Error).message);
					}
				}
			}
		}
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 */
	private onUnload(callback: () => void): void {
		try {
			// Here you must clear all timeouts or intervals that may still be active
			// clearTimeout(timeout1);
			// clearInterval(interval1);
			for (const index in this.intervallList) {
				this.clearInterval(this.intervallList[index]);
			}

			// info.connect to false, if adapter is closed
			this.setState("info.connection", false, true);

			callback();
		} catch (e) {
			callback();
		}
	}

	/**
	 * Is called if a subscribed state changes
	 */
	private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
		if (state) {
			// The state was changed
			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
		}
	}

}

if (require.main !== module) {
	// Export the constructor in compact mode
	module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new Tibberlink(options);
} else {
	// otherwise start the instance directly
	(() => new Tibberlink())();
}