// The adapter-core module gives you access to the core ioBroker functions you need to create an adapter
import * as utils from "@iobroker/adapter-core";
import { IConfig } from "tibber-api";
import { TibberAPICaller } from "./lib/tibberAPICaller";
import { TibberPulse } from "./lib/tibberPulse";
import { TibberCalculator } from "./lib/tibberCalculator";
import { isNullOrUndefined } from "node:util";

class Tibberlink extends utils.Adapter {
	intervalList: any[]; // intervalList: ioBroker.Interval[]; - - ERROR not working with adapter-core 3.x; has to be any
	homeInfoList: { ID: string; NameInApp: string; RealTime: boolean; FeedActive: boolean }[] = [];
	queryUrl: string = "";

	public constructor(options: Partial<utils.AdapterOptions> = {}) {
		super({
			...options,
			name: "tibberlink",
		});
		this.on("ready", this.onReady.bind(this));
		// this.on("stateChange", this.onStateChange.bind(this));
		// this.on("objectChange", this.onObjectChange.bind(this));
		this.on("message", this.onMessage.bind(this));
		this.on("unload", this.onUnload.bind(this));
		this.homeInfoList = [];
		this.intervalList = [];
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
				if (!isNullOrUndefined(this.config.HomesList)) {
					this.log.debug("da")
				} else {
					this.log.debug("nicht da")
                }

				if (this.config.HomesList.length > 0) {
					//are there feeds configured to be used??
					if (this.homeInfoList.length > 0) {
						//set data in homeinfolist according to config data
						const result: any[] = [];
						for (const home of this.config.HomesList) {
							const matchingHomeInfo = this.homeInfoList.find((info) => info.ID === home.homeID);
							if (!matchingHomeInfo) {
								this.log.error(
									`Configured feed for Home ID: ${home.homeID} not found in current data from Tibber server - delete the configuration line or verify any faults in your Tibber connection`,
								);
								continue;
							}
							if (result.some((info) => info.ID === matchingHomeInfo.ID)) {
								this.log.warn(
									`Double configuration of Home ID: ${home.homeID} found - please remove obsolete line in config - data of first instance will be used`,
								);
								continue;
							}
							matchingHomeInfo.FeedActive = home.feedActive;
							result.push(matchingHomeInfo);
						}
						for (const index in this.homeInfoList) {
							this.log.debug(
								`FeedConfig for Home: ${this.homeInfoList[index].NameInApp} (${this.homeInfoList[index].ID}) - realtime data available: ${this.homeInfoList[index].RealTime} - feed configured as active: ${this.homeInfoList[index].FeedActive}`,
							);
						}
					}
				} else {
					this.log.warn(
						`No configuration of Tibber Pulse feeds found! Please configure to get live data - or configure your home(s) to discard live data`,
					);
				}
			} catch (error: any) {
				this.log.error(tibberAPICaller.generateErrorMessage(error, "pull of homes from Tibber-Server"));
			}

			// if feed is not used - set info.connection if data received
			if (this.config.HomesList?.every((info) => !info.feedActive)) {
				if (this.homeInfoList) {
					this.setState("info.connection", true, true);
					this.log.debug("Connection Check: Feed not enabled and I received home list from api - good connection");
				} else {
					this.setState("info.connection", false, true);
					this.log.debug("Connection Check: Feed not enabled and I do not get home list from api - bad connection");
				}
			}
			/* OLD // REMOVED in 0.3.0
			if (!this.config.FeedActive) {
				if (this.homeInfoList) {
					this.setState("info.connection", true, true);
					this.log.debug("Connection Check: Feed not enabled and I received home list from api - good connection");
				} else {
					this.setState("info.connection", false, true);
					this.log.debug("Connection Check: Feed not enabled and I do not get home list from api - bad connection");
				}
			}
			*/

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

			// if no homeIDs available - adapter can't do that much and restarts
			if (!(this.homeInfoList.length > 0)) {
				this.log.warn("Got no homes in your account - probably by a Tibber Server Error- adapter restarts in 2 minutes");
				const adapterrestart = this.setInterval(() => {
					this.restart();
				}, 120000);
				this.intervalList.push(adapterrestart);
			}

			// if there are any homes the adapter will do something
			// Init load data and calculator for all homes
			if (this.homeInfoList.length > 0) {
				const tibberCalculator = new TibberCalculator(this);
				// Set up calculation channel 1 states if channel is configured
				if (this.config.CalCh01Configured) {
					try {
						for (const index in this.config.CalculatorList) {
							await tibberCalculator.setupCalculatorStates(this.config.CalculatorList[index].chHomeID, index);
						}
						this.log.debug(`Setting up calculator states for ${this.config.CalculatorList.length} channels`);
					} catch (error: any) {
						this.log.warn(tibberAPICaller.generateErrorMessage(error, "setup of calculator states"));
					}
				}
				// Get prices for the first time
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
				this.intervalList.push(energyPriceCallIntervall);

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
				this.intervalList.push(energyPricesListUpdateInterval);

				// If user uses live feed - start feed connection
				if (this.homeInfoList.some((info) => info.FeedActive)) {
					//if (this.config.FeedActive) { // REMOVED in 0.3.0
					const tibberPulseInstances = new Array(this.homeInfoList.length); // array for TibberPulse-instances
					for (const index in this.homeInfoList) {
						if (this.homeInfoList[index].FeedActive && this.homeInfoList[index].RealTime) {
							this.log.debug(`Trying to establish feed of live data for home: ${this.homeInfoList[index].ID}`);
							try {
								// define the fields for datafeed
								tibberConfigFeed.homeId = this.homeInfoList[index].ID;
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
	}

	/**
	 * Is called from adapter config screen
	 */
	private onMessage(obj: any): void {
		if (obj) {
			switch (obj.command) {
				case "HomesForConfig":
					if (obj.callback) {
						try {
							this.sendTo(obj.from, obj.command, [{ label: "None available", value: "None available" }], obj.callback);
							/*if (!isNullOrUndefined(this.homeInfoList) && this.homeInfoList.length > 0) {
								this.sendTo(
									obj.from,
									obj.command,
									this.homeInfoList.map((item) => ({
										label: `${item.NameInApp} (${item.ID})`,
										value: item.ID,
									})),
									obj.callback,
								);
							} else {
								this.log.warn(`No Homes available to config TibberLink Calculator`);
								this.sendTo(obj.from, obj.command, [{ label: "None available", value: "None available" }], obj.callback);
							}*/
						} catch (error) {
							this.sendTo(obj.from, obj.command, [{ label: "None available", value: "None available" }], obj.callback);
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
			for (const index in this.intervalList) {
				this.clearInterval(this.intervalList[index]);
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
