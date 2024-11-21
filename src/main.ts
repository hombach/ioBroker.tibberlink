// The adapter-core module gives you access to the core ioBroker functions you need to create an adapter
import * as utils from "@iobroker/adapter-core";
import { CronJob } from "cron";
import { format } from "date-fns";
import { IConfig } from "tibber-api";
import { IHomeInfo } from "./lib/projectUtils";
import { TibberAPICaller } from "./lib/tibberAPICaller";
import { TibberCalculator } from "./lib/tibberCalculator";
//import { IHomeInfo } from "./lib/tibberHelper";
import { TibberLocal } from "./lib/tibberLocal";
import { TibberPulse } from "./lib/tibberPulse";

class Tibberlink extends utils.Adapter {
	public constructor(options: Partial<utils.AdapterOptions> = {}) {
		super({
			...options,
			name: "tibberlink",
		});
		this.on("ready", this.onReady.bind(this));
		this.on("stateChange", this.onStateChange.bind(this));
		// this.on("objectChange", this.onObjectChange.bind(this));
		this.on("message", this.onMessage.bind(this));
		this.on("unload", this.onUnload.bind(this));
		this.homeInfoList = [];
		this.cronList = [];
		this.queryUrl = "https://api.tibber.com/v1-beta/gql";
	}

	private cronList: CronJob[];
	private homeInfoList: IHomeInfo[] = [];
	private queryUrl = "";
	private tibberCalculator = new TibberCalculator(this);

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	private async onReady(): Promise<void> {
		// Reset the connection indicator during startup;
		if (!this.config.TibberAPIToken) {
			// No Token defined in configuration
			this.log.error(`Missing API Token - please check configuration`);
			this.setState(`info.connection`, false, true);
		} else {
			// Need 2 configs - API and Feed (feed changed query url)
			const tibberConfigAPI: IConfig = {
				active: true,
				apiEndpoint: {
					apiKey: this.config.TibberAPIToken,
					queryUrl: this.queryUrl,
					userAgent: `${this.config.TibberAPIToken.slice(5, 20).split("").reverse().join("")}${Date.now}`,
				},
			};
			// Now read homes list from API
			const tibberAPICaller = new TibberAPICaller(tibberConfigAPI, this);
			try {
				this.homeInfoList = await tibberAPICaller.updateHomesFromAPI();
				if (this.config.HomesList.length > 0) {
					//are there feeds configured to be used??
					if (this.homeInfoList.length > 0) {
						//set data in homeinfolist according to config data
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
							matchingHomeInfo.PriceDataPollActive = home.priceDataPollActive;
							result.push(matchingHomeInfo);
						}
						for (const index in this.homeInfoList) {
							this.log.debug(
								`Feed Config for Home: ${this.homeInfoList[index].NameInApp} (${this.homeInfoList[index].ID}) - realtime data available: ${this.homeInfoList[index].RealTime} - feed configured as active: ${this.homeInfoList[index].FeedActive}`,
							);
							this.log.debug(
								`Price Poll Config for Home: ${this.homeInfoList[index].NameInApp} (${this.homeInfoList[index].ID}) - poll configured as active: ${this.homeInfoList[index].PriceDataPollActive}`,
							);
						}
					}
				} else {
					this.log.warn(
						`No configuration of Tibber Pulse feeds found! Please configure to get live data - or configure your home(s) to discard live data`,
					);
				}
			} catch (error: unknown) {
				this.log.error(tibberAPICaller.generateErrorMessage(error, `pull of homes from Tibber-Server`));
			}

			// if feed is not used - set info.connection if data received
			if (this.config.HomesList?.every((info) => !info.feedActive)) {
				if (this.homeInfoList.length > 0) {
					this.setState("info.connection", true, true);
					this.log.debug(`Connection Check: Feed not enabled and I received home list from api - good connection`);
				} else {
					this.setState("info.connection", false, true);
					this.log.debug(`Connection Check: Feed not enabled and I do not get home list from api - bad connection`);
				}
			}

			// sentry.io ping
			if (this.supportsFeature && this.supportsFeature("PLUGINS")) {
				const sentryInstance = this.getPluginInstance("sentry");
				const today = new Date();
				const last = await this.getStateAsync("info.LastSentryLogDay");
				const pulseLocal = this.config.UseLocalPulseData ? 1 : 0;
				if (last?.val != (await today.getDate())) {
					await this.tibberCalculator.updateCalculatorUsageStats();
					if (sentryInstance) {
						const Sentry = sentryInstance.getSentryObject();
						// eslint-disable-next-line @typescript-eslint/no-unused-expressions
						Sentry &&
							Sentry.withScope((scope: { setLevel: (arg0: string) => void; setTag: (arg0: string, arg1: number) => void }) => {
								scope.setLevel("info");
								scope.setTag("SentryDay", today.getDate());
								scope.setTag("HomeIDs", this.homeInfoList.length);
								scope.setTag("LocalPulse", pulseLocal);
								scope.setTag("numBestCost", this.tibberCalculator.numBestCost);
								scope.setTag("numBestCostLTF", this.tibberCalculator.numBestCostLTF);
								scope.setTag("numBestHoursBlock", this.tibberCalculator.numBestHoursBlock);
								scope.setTag("numBestHoursBlockLTF", this.tibberCalculator.numBestHoursBlockLTF);
								scope.setTag("numBestSingleHours", this.tibberCalculator.numBestSingleHours);
								scope.setTag("numBestSingleHoursLTF", this.tibberCalculator.numBestSingleHoursLTF);
								scope.setTag("numSmartBatteryBuffer", this.tibberCalculator.numSmartBatteryBuffer);
								Sentry.captureMessage("Adapter TibberLink started", "info");
							});
					}
					this.setState("info.LastSentryLogDay", { val: today.getDate(), ack: true });
				}
			}

			// if no homeIDs available - adapter can't do that much and restarts
			if (this.homeInfoList.length === 0) {
				this.log.warn(`Got no homes in your account - probably by a Tibber Server Error - adapter restarts in 2 minutes`);
				await this.delay(2 * 60 * 1000);
				this.restart();
			}

			// if there are any homes the adapter will do something
			// Init load data and calculator for all homes
			if (this.homeInfoList.length > 0) {
				const tibberCalculator = new TibberCalculator(this);
				// Set up calculation channel states if configured
				if (this.config.UseCalculator) {
					try {
						this.log.info(`Setting up calculator states for ${this.config.CalculatorList.length} channels`);
						for (const channel in this.config.CalculatorList) {
							await tibberCalculator.setupCalculatorStates(this.config.CalculatorList[channel].chHomeID, parseInt(channel));
						}
					} catch (error: unknown) {
						this.log.warn(tibberAPICaller.generateErrorMessage(error, `setup of calculator states`));
					}
				}

				// Local Bridge Call - WiP move this... could be used without Tibber contract
				// Set up Pulse local polls if configured
				const tibberLocal = new TibberLocal(this);
				if (this.config.UseLocalPulseData) {
					try {
						this.log.info(`Setting up local poll of consumption data for ${this.config.PulseList.length} pulse module(s)`);
						for (const pulse in this.config.PulseList) {
							await tibberLocal.setupOnePulseLocal(parseInt(pulse));
						}
					} catch (error: unknown) {
						this.log.warn(tibberAPICaller.generateErrorMessage(error, `setup of local Pulse data poll`));
					}
				}
				//Local Bridge Call

				// (force) get current prices and start calculator tasks once for the FIRST time
				await tibberAPICaller.updateCurrentPriceAllHomes(this.homeInfoList, true);

				this.jobPricesTodayLOOP(tibberAPICaller);
				this.jobPricesTomorrowLOOP(tibberAPICaller);
				tibberCalculator.startCalculatorTasks(false, true);
				// Get consumption data for the first time
				tibberAPICaller.updateConsumptionAllHomes();

				const jobCurrentPrice = CronJob.from({
					cronTime: "20 57 * * * *", //"20 57 * * * *" = 3 minuten vor 00:00:20 jede Stunde
					onTick: async () => {
						let okPrice = false;
						do {
							await this.delay(this.getRandomDelay(3, 5));
							okPrice = await tibberAPICaller.updateCurrentPriceAllHomes(this.homeInfoList);
							this.log.debug(`Cron job CurrentPrice - okPrice: ${okPrice}`);
						} while (!okPrice);
						tibberCalculator.startCalculatorTasks();
						tibberAPICaller.updateConsumptionAllHomes();
					},
					start: true,
					timeZone: "system",
					runOnInit: false,
				});
				if (jobCurrentPrice) this.cronList.push(jobCurrentPrice);

				const jobPricesToday = CronJob.from({
					cronTime: "20 56 23 * * *", //"20 56 23 * * *" = 5 minuten vor 00:01:20
					onTick: async () => {
						let okPrice = false;
						do {
							await this.delay(this.getRandomDelay(4, 6));
							okPrice = await tibberAPICaller.updatePricesTodayAllHomes(this.homeInfoList);
							this.log.debug(`Cron job PricesToday - okPrice: ${okPrice}`);
						} while (!okPrice);
						await tibberAPICaller.updatePricesTomorrowAllHomes(this.homeInfoList);
						tibberCalculator.startCalculatorTasks();
					},
					start: true,
					timeZone: "system",
					runOnInit: true,
				});
				if (jobPricesToday) this.cronList.push(jobPricesToday);

				const jobPricesTomorrow = CronJob.from({
					cronTime: "20 56 12 * * *", //"20 56 12 * * *" = 5 minuten vor 13:01:20
					onTick: async () => {
						let okPrice = false;
						do {
							await this.delay(this.getRandomDelay(4, 6));
							okPrice = await tibberAPICaller.updatePricesTomorrowAllHomes(this.homeInfoList);
							this.log.debug(`Cron job PricesTomorrow - okPrice: ${okPrice}`);
						} while (!okPrice);
						tibberCalculator.startCalculatorTasks();
					},
					start: true,
					timeZone: "system",
					runOnInit: true,
				});
				if (jobPricesTomorrow) this.cronList.push(jobPricesTomorrow);

				//#region *** If user uses live feed - start feed connection ***
				if (this.homeInfoList.some((info) => info.FeedActive)) {
					// array with configs of feeds, init with base data set
					const tibberFeedConfigs: IConfig[] = Array.from({ length: this.homeInfoList.length }, () => {
						return {
							active: true,
							apiEndpoint: {
								apiKey: this.config.TibberAPIToken,
								queryUrl: this.queryUrl,
								userAgent: `${this.config.TibberAPIToken.slice(5, 20).split("").reverse().join("")}${Date.now}`,
							},
							timestamp: true,
						};
					});
					const tibberPulseInstances = new Array(this.homeInfoList.length); // array for TibberPulse-instances

					if (!this.homeInfoList.some((homeInfo) => homeInfo.ID == `None available - restart adapter after entering token`)) {
						await this.delObjectAsync(`Homes.None available - restart adapter after entering token`, { recursive: true });
					}

					for (const index in this.homeInfoList) {
						if (!this.homeInfoList[index].FeedActive || !this.homeInfoList[index].RealTime) {
							this.log.warn(`skipping feed of live data - no Pulse configured for this home according to Tibber server`);
							continue;
						}
						this.log.debug(`Trying to establish feed of live data for home: ${this.homeInfoList[index].ID}`);
						try {
							// define the fields for datafeed
							tibberFeedConfigs[index].homeId = this.homeInfoList[index].ID;
							tibberFeedConfigs[index].power = true;
							if (this.config.FeedConfigLastMeterConsumption) tibberFeedConfigs[index].lastMeterConsumption = true;
							if (this.config.FeedConfigAccumulatedConsumption) tibberFeedConfigs[index].accumulatedConsumption = true;
							if (this.config.FeedConfigAccumulatedProduction) tibberFeedConfigs[index].accumulatedProduction = true;
							if (this.config.FeedConfigAccumulatedConsumptionLastHour) tibberFeedConfigs[index].accumulatedConsumptionLastHour = true;
							if (this.config.FeedConfigAccumulatedProductionLastHour) tibberFeedConfigs[index].accumulatedProductionLastHour = true;
							if (this.config.FeedConfigAccumulatedCost) tibberFeedConfigs[index].accumulatedCost = true;
							if (this.config.FeedConfigAccumulatedCost) tibberFeedConfigs[index].accumulatedReward = true;
							if (this.config.FeedConfigCurrency) tibberFeedConfigs[index].currency = true;
							if (this.config.FeedConfigMinPower) tibberFeedConfigs[index].minPower = true;
							if (this.config.FeedConfigAveragePower) tibberFeedConfigs[index].averagePower = true;
							if (this.config.FeedConfigMaxPower) tibberFeedConfigs[index].maxPower = true;
							if (this.config.FeedConfigPowerProduction) tibberFeedConfigs[index].powerProduction = true;
							if (this.config.FeedConfigMinPowerProduction) tibberFeedConfigs[index].minPowerProduction = true;
							if (this.config.FeedConfigMaxPowerProduction) tibberFeedConfigs[index].maxPowerProduction = true;
							if (this.config.FeedConfigLastMeterProduction) tibberFeedConfigs[index].lastMeterProduction = true;
							if (this.config.FeedConfigPowerFactor) tibberFeedConfigs[index].powerFactor = true;
							if (this.config.FeedConfigVoltagePhase1) tibberFeedConfigs[index].voltagePhase1 = true;
							if (this.config.FeedConfigVoltagePhase2) tibberFeedConfigs[index].voltagePhase2 = true;
							if (this.config.FeedConfigVoltagePhase3) tibberFeedConfigs[index].voltagePhase3 = true;
							if (this.config.FeedConfigCurrentL1) tibberFeedConfigs[index].currentL1 = true;
							if (this.config.FeedConfigCurrentL2) tibberFeedConfigs[index].currentL2 = true;
							if (this.config.FeedConfigCurrentL3) tibberFeedConfigs[index].currentL3 = true;
							if (this.config.FeedConfigSignalStrength) tibberFeedConfigs[index].signalStrength = true;
							tibberPulseInstances[index] = new TibberPulse(tibberFeedConfigs[index], this); // add new instance to array
							tibberPulseInstances[index].ConnectPulseStream();
						} catch (error) {
							this.log.warn((error as Error).message);
						}
					}
				}
				//#endregion
			}
		}
	}

	/**
	 * subfunction to loop till prices today for all homes are got from server - adapter startup-phase
	 */
	private async jobPricesTodayLOOP(tibberAPICaller: TibberAPICaller): Promise<void> {
		let okPrice = false;
		do {
			okPrice = await tibberAPICaller.updatePricesTodayAllHomes(this.homeInfoList, true);
			this.log.debug(`Loop job PricesToday - okPrice: ${okPrice}`);
			await this.delay(this.getRandomDelay(4, 6));
		} while (!okPrice);
	}

	/**
	 * subfunction to loop till prices tomorrow for all homes are got from server - adapter startup-phase
	 */
	private async jobPricesTomorrowLOOP(tibberAPICaller: TibberAPICaller): Promise<void> {
		let okPrice = false;
		do {
			okPrice = await tibberAPICaller.updatePricesTomorrowAllHomes(this.homeInfoList, true);
			this.log.debug(`Loop job PricesTomorrow - okPrice: ${okPrice}`);
			await this.delay(this.getRandomDelay(4, 6));
		} while (!okPrice);
	}

	/**
	 * generates random delay time in milliseconds between min minutes and max minutes
	 *
	 * @param minMinutes - minimum minutes of delay as number
	 * @param maxMinutes - maximum minutes of delay as number
	 * @returns delay - milliseconds as integer
	 */
	private getRandomDelay = (minMinutes: number, maxMinutes: number): number => {
		if (minMinutes >= maxMinutes) throw new Error("minMinutes should be less than maxMinutes");
		const randomMinutes = Math.random() * (maxMinutes - minMinutes) + minMinutes;
		return Math.floor(randomMinutes * 60 * 1000);
	};

	/**
	 * Is called from adapter config screen
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private onMessage(obj: any): void {
		if (obj) {
			switch (obj.command) {
				case "HomesForConfig":
					if (obj.callback) {
						try {
							if (this.homeInfoList.length > 0) {
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
								this.log.warn(`No Homes available to config TibberLink`);
								this.sendTo(obj.from, obj.command, [{ label: "None available", value: "None available" }], obj.callback);
							}
						} catch {
							this.sendTo(obj.from, obj.command, [{ label: "None available", value: "None available" }], obj.callback);
						}
					}
					break;
				case "HomesForCalculator":
					if (obj.callback) {
						try {
							if (this.homeInfoList.length > 0) {
								this.sendTo(
									obj.from,
									obj.command,
									this.homeInfoList.map((item) => ({
										//label: `${item.NameInApp} (${item.ID.substring(item.ID.lastIndexOf("-") + 1)})`,
										label: `${item.NameInApp} (...${item.ID.slice(-8)})`,
										value: item.ID,
									})),
									obj.callback,
								);
							} else {
								this.log.warn(`No Homes available to config TibberLink Calculator`);
								this.sendTo(obj.from, obj.command, [{ label: "None available", value: "None available" }], obj.callback);
							}
						} catch {
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
			for (const cronJob of this.cronList) {
				cronJob.stop();
			}
			if (this.config.UseLocalPulseData) {
				//WiP call shutdown in tibberLocal
			}
			this.setState("info.connection", false, true);
			callback();
		} catch (e) {
			this.log.warn((e as Error).message);
			callback();
		}
	}

	/**
	 * Is called if a subscribed state changes
	 */
	private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
		this.log.debug(`state change detected and parsing for id: ${id} - state: ${state}`);
		try {
			if (state) {
				// The state was changed
				// this.adapter.subscribeStates(`Homes.${homeId}.Calculations.${channel}.*`);
				if (!state.ack) {
					if (id.includes(`.Calculations.`)) {
						const statePath = id.split(".");
						const homeIDToMatch = statePath[3];
						const calcChannel = parseInt(statePath[5]);
						const settingType = statePath[6];
						if (!isNaN(calcChannel) && calcChannel < this.config.CalculatorList.length && settingType !== undefined) {
							if (this.config.CalculatorList[calcChannel].chHomeID === homeIDToMatch) {
								switch (settingType) {
									case "Active":
										// Update .chActive based on state.val if it's a boolean
										if (typeof state.val === "boolean") {
											this.config.CalculatorList[calcChannel].chActive = state.val;
											this.log.debug(
												`calculator settings state in home: ${homeIDToMatch} - channel: ${calcChannel} - changed to Active: ${this.config.CalculatorList[calcChannel].chActive}`,
											);
											this.setState(id, state.val, true); // set acknowledge true
										} else {
											this.log.warn(`Wrong type for channel: ${calcChannel} - chActive: ${state.val}`);
										}
										break;
									case "TriggerPrice":
										// Update .chTriggerPrice based on state.val if it's a number
										if (typeof state.val === "number") {
											this.config.CalculatorList[calcChannel].chTriggerPrice = state.val;
											this.log.debug(
												`calculator settings state in home: ${homeIDToMatch} - channel: ${calcChannel} - changed to TriggerPrice: ${this.config.CalculatorList[calcChannel].chTriggerPrice}`,
											);
											this.setState(id, state.val, true);
										} else {
											this.log.warn(`Wrong type for channel: ${calcChannel} - chTriggerPrice: ${state.val}`);
										}
										break;
									case "AmountHours":
										// Update .chAmountHours based on state.val if it's a number
										if (typeof state.val === "number") {
											this.config.CalculatorList[calcChannel].chAmountHours = state.val;
											this.log.debug(
												`calculator settings state in home: ${homeIDToMatch} - channel: ${calcChannel} - changed to AmountHours: ${this.config.CalculatorList[calcChannel].chAmountHours}`,
											);
											this.setState(id, state.val, true);
										} else {
											this.log.warn(`Wrong type for channel: ${calcChannel} - chAmountHours: ${state.val}`);
										}
										break;
									case "StartTime":
										// Update .chStartTime based on state.val if it's a datetime
										if (typeof state.val === "string") {
											// Check if the string is in ISO-8601 format with a timezone offset
											// like: "2023-11-17T21:00:00.000+01:00"
											const iso8601RegEx = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})[.]\d{3}Z?([+-]\d{2}:\d{2})?$/;
											if (iso8601RegEx.test(state.val)) {
												const dateWithTimeZone = new Date(state.val);
												// floor to hour
												dateWithTimeZone.setMinutes(0, 0, 0);
												this.config.CalculatorList[calcChannel].chStartTime = dateWithTimeZone;
												this.log.debug(
													`calculator settings state in home: ${homeIDToMatch} - channel: ${calcChannel} - changed to StartTime: ${format(
														dateWithTimeZone,
														"yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
													)}`,
												);
												this.setState(id, format(dateWithTimeZone, "yyyy-MM-dd'T'HH:mm:ss.SSSXXX"), true);
											} else {
												this.log.warn(
													`Invalid ISO-8601 format or missing timezone offset for channel: ${calcChannel} - chStartTime: ${state.val}`,
												);
											}
										} else {
											this.log.warn(`Wrong type for channel: ${calcChannel} - chStartTime: ${state.val}`);
										}
										break;
									case "StopTime":
										// Update .chStopTime based on state.val if it's a datetime
										if (typeof state.val === "string") {
											// Check if the string is in ISO-8601 format with a timezone offset
											// like: "2023-11-17T21:00:00.000+01:00"
											const iso8601RegEx = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})[.]\d{3}Z?([+-]\d{2}:\d{2})?$/;
											if (iso8601RegEx.test(state.val)) {
												const dateWithTimeZone = new Date(state.val);
												// floor to hour
												dateWithTimeZone.setMinutes(0, 0, 0);
												this.config.CalculatorList[calcChannel].chStopTime = dateWithTimeZone;
												this.log.debug(
													`calculator settings state in home: ${homeIDToMatch} - channel: ${calcChannel} - changed to StopTime: ${format(
														dateWithTimeZone,
														"yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
													)}`,
												);
												this.setState(id, format(dateWithTimeZone, "yyyy-MM-dd'T'HH:mm:ss.SSSXXX"), true);
											} else {
												this.log.warn(
													`Invalid ISO-8601 format or missing timezone offset for channel: ${calcChannel} - chStopTime: ${state.val}`,
												);
											}
										} else {
											this.log.warn(`Wrong type for channel: ${calcChannel} - chStopTime: ${state.val}`);
										}
										break;
									case "RepeatDays":
										// Update .chRepeatDays based on state.val if it's a number
										if (typeof state.val === "number") {
											this.config.CalculatorList[calcChannel].chRepeatDays = state.val;
											this.log.debug(
												`calculator settings state in home: ${homeIDToMatch} - channel: ${calcChannel} - changed to RepeatDays: ${this.config.CalculatorList[calcChannel].chRepeatDays}`,
											);
											this.setState(id, state.val, true);
										} else {
											this.log.warn(`Wrong type for channel: ${calcChannel} - chRepeatDays: ${state.val}`);
										}
										break;
									case "EfficiencyLoss":
										// Update .chEfficiencyLoss based on state.val if it's a number
										if (typeof state.val === "number") {
											this.config.CalculatorList[calcChannel].chEfficiencyLoss = state.val;
											this.log.debug(
												`calculator settings state in home: ${homeIDToMatch} - channel: ${calcChannel} - changed to EfficiencyLoss: ${this.config.CalculatorList[calcChannel].chEfficiencyLoss}`,
											);
											this.setState(id, state.val, true);
										} else {
											this.log.warn(`Wrong type for channel: ${calcChannel} - chEfficiencyLoss: ${state.val}`);
										}
										break;
									default:
										this.log.debug(`unknown value for setting type: ${settingType}`);
								}
								this.tibberCalculator.startCalculatorTasks(true);
							} else {
								this.log.debug(`wrong index values in state ID or missing value for settingType`);
							}
						}
					}
				}
			} else {
				// The state was deleted
				this.log.warn(`state ${id} deleted`);
			}
		} catch (e) {
			this.log.error(`Unhandled exception processing onstateChange: ${e}`);
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
