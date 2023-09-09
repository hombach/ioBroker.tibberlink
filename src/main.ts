// The adapter-core module gives you access to the core ioBroker functions you need to create an adapter
import * as utils from "@iobroker/adapter-core";
import { IConfig } from "tibber-api";
import { TibberAPICaller } from "./lib/tibberAPICaller";
import { TibberPulse } from "./lib/tibberPulse";
import { TibberCalculator } from "./lib/tibberCalculator";

class Tibberlink extends utils.Adapter {
	intervallList: any[]; // intervallList: ioBroker.Interval[]; - - ERROR not working with adapter-core 3.x; has to be any
	homeInfoList: { ID: string; RealTime: boolean }[] = [];
	queryUrl: string = "";

	public constructor(options: Partial<utils.AdapterOptions> = {}) {
		super({
			...options,
			name: "tibberlink",
		});
		this.on("ready", this.onReady.bind(this));
		// this.on("stateChange", this.onStateChange.bind(this));
		// this.on("objectChange", this.onObjectChange.bind(this));
		// this.on("message", this.onMessage.bind(this));
		this.on("unload", this.onUnload.bind(this));
		this.on("message", this.onMessage.bind(this)); // NEW NEW NEW
		this.homeInfoList = [];
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
			this.log.warn(`Missing API Token - please check configuration`);
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
			// Now read homes list from API
			const tibberAPICaller = new TibberAPICaller(tibberConfigAPI, this);
			try {
				this.homeInfoList = await tibberAPICaller.updateHomesFromAPI();
			} catch (error: any) {
				this.log.error(tibberAPICaller.generateErrorMessage(error, "pull of homes from Tibber-Server"));
			}
			// if feed is not used - set info.connection if data received
			if (!this.config.FeedActive) {
				if (this.homeInfoList) {
					this.setState("info.connection", true, true);
					this.log.debug("Connection Check: Feed not enabled and I received home list from api - good connection");
				} else {
					this.setState("info.connection", false, true);
					this.log.debug("Connection Check: Feed not enabled and I do not get home list from api - bad connection");
				}
			}

			// sentry.io ping
			if (this.supportsFeature && this.supportsFeature("PLUGINS")) {
				const sentryInstance = this.getPluginInstance("sentry");
				const today = new Date();
				const last = await this.getStateAsync("info.LastSentryLogDay");
				if (last?.val != (await today.getDate())) {
					if (sentryInstance) {
						const Sentry = sentryInstance.getSentryObject();
						Sentry &&
							Sentry.withScope((scope: { setLevel: (arg0: string) => void; setTag: (arg0: string, arg1: number) => void }) => {
								scope.setLevel("info");
								scope.setTag("SentryDay", today.getDate());
								scope.setTag("HomeIDs", this.homeInfoList.length);
								Sentry.captureMessage("Adapter TibberLink started", "info"); // Level "info"
							});
					}
					// this.setStateAsync("LastSentryLoggedError", { val: "unknown", ack: true }); // Clean last error every adapter start
					this.setStateAsync("info.LastSentryLogDay", { val: today.getDate(), ack: true });
				}
			}

			if (!(this.homeInfoList.length > 0)) {
				// if no homeIDs available - adapter can't do that much and restarts
				this.log.warn("Got no homes in your account - probably by a Tibber Server Error- adapter restarts in 2 minutes");
				const adapterrestart = this.setInterval(() => {
					this.restart();
				}, 120000);
				this.intervallList.push(adapterrestart);
			}

			// Init load data and calculator for all homes
			if (this.homeInfoList.length > 0) {
				// only if there are any homes the adapter will do something
				const tibberCalculator = new TibberCalculator(this);

				// Set up calculation channel 1 states if channel is configured
				if (this.config.CalCh01Configured && this.config.CalCh01Home?.length > 5) {
					try {
						await tibberCalculator.setupCalculatorStates(this.config.CalCh01Home, 1);
						this.log.debug("Setting up calculation channel 1 states");
					} catch (error: any) {
						this.log.warn(tibberAPICaller.generateErrorMessage(error, "setup of calculation states for channel 01"));
					}
				}

				for (const index in this.homeInfoList) {
					// Get current price for the first time
					try {
						await tibberAPICaller.updateCurrentPrice(this.homeInfoList[index].ID);
					} catch (error: any) {
						this.log.error(tibberAPICaller.generateErrorMessage(error, "first pull of current price"));
					}

					// Get today prices for the first time
					try {
						await tibberAPICaller.updatePricesToday(this.homeInfoList[index].ID);
					} catch (error: any) {
						this.log.error(tibberAPICaller.generateErrorMessage(error, "first pull of prices today"));
					}

					// Get tomorrow prices for the first time
					try {
						await tibberAPICaller.updatePricesTomorrow(this.homeInfoList[index].ID);
					} catch (error: any) {
						this.log.error(tibberAPICaller.generateErrorMessage(error, "first pull of prices tomorrow"));
					}
				}

				const energyPriceCallIntervall = this.setInterval(() => {
					for (const index in this.homeInfoList) {
						try {
							tibberAPICaller.updateCurrentPrice(this.homeInfoList[index].ID);
						} catch (error: any) {
							this.log.warn(tibberAPICaller.generateErrorMessage(error, "pull of current price"));
						}
					}
				}, 300000);
				this.intervallList.push(energyPriceCallIntervall);

				const energyPricesListUpdateInterval = this.setInterval(() => {
					for (const index in this.homeInfoList) {
						try {
							tibberAPICaller.updatePricesToday(this.homeInfoList[index].ID);
						} catch (error: any) {
							this.log.warn(tibberAPICaller.generateErrorMessage(error, "pull of prices today"));
						}
						try {
							tibberAPICaller.updatePricesTomorrow(this.homeInfoList[index].ID);
						} catch (error: any) {
							this.log.warn(tibberAPICaller.generateErrorMessage(error, "pull of prices tomorrow"));
						}
					}
				}, 1500000);
				this.intervallList.push(energyPricesListUpdateInterval);
			}

			// If user uses live feed - start feed connection
			if (this.config.FeedActive) {
				const tibberPulseInstances = new Array(this.homeInfoList.length); // array for TibberPulse-instances
				for (const index in this.homeInfoList) {
					this.log.debug(`Trying to establish feed of live data for home: ${this.homeInfoList[index].ID}`);
					if (this.homeInfoList[index].RealTime) {
						try {
							// define the fields for datafeed
							tibberConfigFeed.homeId = this.homeInfoList[index].ID; // ERROR: Only latest homeID will be used at this point
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
							tibberPulseInstances[index] = new TibberPulse(tibberConfigFeed, this); // add instance to array
							tibberPulseInstances[index].ConnectPulseStream();
						} catch (e) {
							this.log.warn((e as Error).message);
						}
					} else {
						this.log.warn("skipping feed of live data - no Pulse configured for this home according to Tibber server");
					}
				}
			}
		}
	}

	/**
	 * Is called from adapter config screen
	 */
	private onMessage(obj: any): void {
		this.log.debug("Got message from config screen");
		if (obj) {
			switch (obj.command) {
				case "CalHomes":
					if (obj.callback) {
						try {
							if (this.homeInfoList.length > 0) {
								this.log.info(`List of homes: ${this.homeInfoList.map((item) => ({ label: item.ID }))}`);
								this.sendTo(
									obj.from,
									obj.command,
									this.homeInfoList.map((item) => ({ label: item.ID, value: item.ID })),
									obj.callback,
								);
							} else {
								this.log.warn(`No Homes available to config TibberLink Calculator`);
								this.sendTo(obj.from, obj.command, [{ label: "None available", value: "" }], obj.callback);
							}
						} catch (error) {
							this.sendTo(obj.from, obj.command, [{ label: "None available", value: "" }], obj.callback);
						}
					}
					break;
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
	/*
	private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
		if (state) {
			// The state was changed
			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
		} else {
			// The state was deleted
			this.log.error(`state ${id} deleted`);
		}
	}
	*/
}

if (require.main !== module) {
	// Export the constructor in compact mode
	module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new Tibberlink(options);
} else {
	// otherwise start the instance directly
	(() => new Tibberlink())();
}
