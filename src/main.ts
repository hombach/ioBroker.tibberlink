// The adapter-core module gives you access to the core ioBroker functions you need to create an adapter
import * as utils from "@iobroker/adapter-core";
import { CronJob } from "cron";
import { addDays, format, isSameDay, roundToNearestMinutes } from "date-fns";
import type { IConfig } from "tibber-api";
import type { PriceResolution } from "tibber-api/lib/src/models/enums/PriceResolution.js";
import type { IHomeInfo } from "./lib/projectUtils.js";
import { TibberAPICaller } from "./lib/tibberAPICaller.js";
import { TibberCalculator } from "./lib/tibberCalculator.js";
import { TibberCharts } from "./lib/tibberCharts.js";
import { TibberLocal } from "./lib/tibberLocal.js";
import { TibberPulse } from "./lib/tibberPulse.js";

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
	private tibberCharts = new TibberCharts(this);
	private tibberLocal = new TibberLocal(this);
	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	private async onReady(): Promise<void> {
		// Reset the connection indicator during startup;
		if (!this.config.TibberAPIToken && !this.config.UseLocalPulseData) {
			// No Token defined in configuration
			this.log.error(`Missing API Token - please check configuration`);
			void this.setState(`info.connection`, false, true);
		}

		// Local Bridge Call ... could be used without Tibber contract
		if (this.config.UseLocalPulseData) {
			// Set up Pulse local polls if configured
			try {
				this.log.info(`Setting up local poll of consumption data for ${this.config.PulseList.length} pulse module(s)`);
				this.config.PulseList.forEach((_pulse, index) => {
					this.tibberLocal.setupOnePulseLocal(index);
				});
			} catch (error: unknown) {
				this.log.warn(`Error in setup of local Pulse data poll: ${error as Error}`);
			}
		}

		if (this.config.TibberAPIToken) {
			// Need 2 configs - API and Feed (feed changed query url)
			const tibberConfigAPI: IConfig = {
				active: true,
				apiEndpoint: {
					apiKey: this.config.TibberAPIToken,
					queryUrl: this.queryUrl,
					userAgent: `${this.config.TibberAPIToken.slice(5, 20).split("").reverse().join("")}${Date.now()}`,
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
						const result: any[] = [];
						for (const home of this.config.HomesList) {
							const matchingHomeInfo = this.homeInfoList.find(info => info.ID === home.homeID);
							if (!matchingHomeInfo) {
								this.log.error(
									`Configured feed for Home ID: ${home.homeID} not found in current data from Tibber server - delete the configuration line or verify any faults in your Tibber connection`,
								);
								continue;
							}
							if (result.some(info => info.ID === matchingHomeInfo.ID)) {
								this.log.warn(
									`Double configuration of Home ID: ${home.homeID} found - please remove obsolete line in config - data of first instance will be used`,
								);
								continue;
							}
							matchingHomeInfo.FeedActive = home.feedActive;
							matchingHomeInfo.PriceDataPollActive = home.priceDataPollActive;
							result.push(matchingHomeInfo);
						}
						for (const homeInfo of this.homeInfoList) {
							this.log.debug(
								`Feed Config for Home: ${homeInfo.NameInApp} (${homeInfo.ID}) - realtime data available: ${homeInfo.RealTime} - feed configured as active: ${homeInfo.FeedActive}`,
							);
							this.log.debug(
								`Price Poll Config for Home: ${homeInfo.NameInApp} (${homeInfo.ID}) - poll configured as active: ${homeInfo.PriceDataPollActive}`,
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
			if (this.config.HomesList?.every(info => !info.feedActive)) {
				if (this.homeInfoList.length > 0) {
					void this.setState("info.connection", true, true);
					this.log.debug(`Connection Check: Feed not enabled but received a home list from api - good connection`);
				} else {
					void this.setState("info.connection", false, true);
					this.log.debug(`Connection Check: Feed not enabled and not got a home list from api - bad connection`);
				}
			}

			// sentry.io ping
			if (this.supportsFeature && this.supportsFeature("PLUGINS")) {
				const sentryInstance = this.getPluginInstance("sentry");
				const pulseLocal = this.config.UseLocalPulseData ? 1 : 0;

				// DEL state info.LastSentryLogDay from old releases
				this.delObject("info.LastSentryLogDay");

				// Fetch the last logged month from state
				const last = await this.getStateAsync("info.LastSentryLogMonth");
				const lastMonth = Number(last?.val) || 0;
				const today = new Date();
				const currentMonth = today.getMonth() + 1; // 1-12

				// Check if a new month has started
				const isNewMonth = currentMonth !== lastMonth;

				// If no month transition, check normal difference
				// If month transition, check if difference is >= 10 days
				if (isNewMonth) {
					// Verified if new month
					this.tibberCalculator.updateCalculatorUsageStats();
					if (sentryInstance) {
						const Sentry = sentryInstance.getSentryObject();
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
								scope.setTag("numBestPercentage", this.tibberCalculator.numBestPercentage);
								scope.setTag("numBestPercentageLTF", this.tibberCalculator.numBestPercentageLTF);
								Sentry.captureMessage("Adapter TibberLink started", "info");
							});
					}
					await this.setState("info.LastSentryLogMonth", { val: currentMonth, ack: true });
				}
			}

			// if no homeIDs available - adapter can't do that much and restarts
			if (this.homeInfoList.length === 0) {
				this.log.warn(`Got no homes in your account - possibly by a Tibber server error - adapter restarts in 5 minutes`);
				await this.delay(5 * 60000);
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

						this.config.CalculatorList.forEach(async (channel, index) => {
							await tibberCalculator.setupCalculatorStates(channel.chHomeID, index);
						});
					} catch (error: unknown) {
						this.log.warn(tibberAPICaller.generateErrorMessage(error, `setup of calculator states`));
					}
				}

				// (force) get current prices and start calculator tasks once for the FIRST time
				void this.jobPricesTodayLOOP(tibberAPICaller);
				void this.jobPricesTomorrowLOOP(tibberAPICaller);
				void tibberCalculator.startCalculatorTasks(false, true);
				// Get consumption data for the first time
				void tibberAPICaller.updateConsumptionAllHomes();
				void this.tibberCharts.generateFlexChartJSONAllHomes(this.homeInfoList);

				const jobCurrentPrice = CronJob.from({
					cronTime: "3 */15 * * * *", // jede 15. Minute, Sekunde 3
					onTick: async () => {
						// get current price from existing (?) PricesToday
						await tibberAPICaller.updateCurrentPriceAllHomes(this.homeInfoList);
						void tibberAPICaller.updateConsumptionAllHomes();
						await tibberCalculator.startCalculatorTasks();
						void this.tibberCharts.generateFlexChartJSONAllHomes(this.homeInfoList);
					},
					start: true,
					runOnInit: false,
				});
				if (jobCurrentPrice) {
					this.cronList.push(jobCurrentPrice);
				}

				const jobPricesToday = CronJob.from({
					cronTime: "20 56 23 * * *", //"20 56 23 * * *" = 23:56:20, every day = 5 minutes before 00:01:20 => 00:00:20 - 00:02:20 for first try
					onTick: async () => {
						let okPrice = false;
						let attempt = 0;
						do {
							attempt++;
							await this.delay(this.getRandomDelay(4, 6));
							await tibberAPICaller.updatePricesTomorrowAllHomes(this.homeInfoList, "QUARTER_HOURLY" as PriceResolution);
							okPrice = await tibberAPICaller.updatePricesTodayAllHomes(this.homeInfoList, "QUARTER_HOURLY" as PriceResolution);
							this.log.debug(`Cron job PricesToday - attempt ${attempt}, okPrice: ${okPrice}`);
						} while (!okPrice && attempt < 15);
						void tibberCalculator.startCalculatorTasks();
						void this.tibberCharts.generateFlexChartJSONAllHomes(this.homeInfoList);
					},
					start: true,
					runOnInit: true,
				});
				if (jobPricesToday) {
					this.cronList.push(jobPricesToday);
				}

				const jobPricesTomorrow = CronJob.from({
					cronTime: "20 56 12 * * *", //"20 56 12 * * *" = 12:56:20, every day5 minutes before 13:01:20 => 13:00:20 - 13:02:20 for first try
					onTick: async () => {
						let okPrice = false;
						let attempt = 0;
						do {
							attempt++;
							await this.delay(this.getRandomDelay(4, 6));
							okPrice = await tibberAPICaller.updatePricesTomorrowAllHomes(this.homeInfoList, "QUARTER_HOURLY" as PriceResolution);
							this.log.debug(`Cron job PricesTomorrow - attempt ${attempt}, okPrice: ${okPrice}`);
						} while (!okPrice && attempt < 8);
						void tibberCalculator.startCalculatorTasks();
						void this.tibberCharts.generateFlexChartJSONAllHomes(this.homeInfoList);
					},
					start: true,
					runOnInit: true,
				});
				if (jobPricesTomorrow) {
					this.cronList.push(jobPricesTomorrow);
				}

				const jobDailyPriceRollover = CronJob.from({
					cronTime: "01 0 0 * * *", //"01 0 0 * * *" = 00:00:01, every day
					onTick: async () => {
						await tibberAPICaller.dailyPriceRolloverAllHomes(this.homeInfoList);
						this.log.debug(`Cron job DailyPriceRollover done`);
					},
					start: true,
					runOnInit: false,
				});
				if (jobDailyPriceRollover) {
					this.cronList.push(jobDailyPriceRollover);
				}

				// finally start live data feed if configured
				//#region *** If user uses live feed - start feed connection ***
				if (this.homeInfoList.some(info => info.FeedActive)) {
					// array with configs of feeds, init with base data set
					const tibberFeedConfigs: IConfig[] = Array.from({ length: this.homeInfoList.length }, () => {
						return {
							active: true,
							apiEndpoint: {
								apiKey: this.config.TibberAPIToken,
								queryUrl: this.queryUrl,
								userAgent: `${this.config.TibberAPIToken.slice(5, 20).split("").reverse().join("")}${Date.now()}`,
							},
							timestamp: true,
						};
					});
					const tibberPulseInstances = new Array(this.homeInfoList.length); // array for TibberPulse-instances

					if (!this.homeInfoList.some(homeInfo => homeInfo.ID == `None available - restart adapter after entering token`)) {
						await this.delObjectAsync(`Homes.None available - restart adapter after entering token`, { recursive: true });
					}

					this.homeInfoList.forEach((homeInfo, index) => {
						if (!homeInfo.ID || !homeInfo.RealTime) {
							this.log.warn(`skipping feed of live data - no Pulse configured for this home ${homeInfo.ID} according to Tibber server`);
							return;
						}
						this.log.debug(`Trying to establish feed of live data for home: ${homeInfo.ID}`);
						try {
							// define the fields for datafeed
							tibberFeedConfigs[index].homeId = homeInfo.ID;
							tibberFeedConfigs[index].power = true;
							tibberFeedConfigs[index].powerProduction = true;

							if (this.config.FeedConfigLastMeterConsumption) {
								tibberFeedConfigs[index].lastMeterConsumption = true;
							}
							if (this.config.FeedConfigAccumulatedConsumption) {
								tibberFeedConfigs[index].accumulatedConsumption = true;
							}
							if (this.config.FeedConfigAccumulatedProduction) {
								tibberFeedConfigs[index].accumulatedProduction = true;
							}
							if (this.config.FeedConfigAccumulatedConsumptionLastHour) {
								tibberFeedConfigs[index].accumulatedConsumptionLastHour = true;
							}
							if (this.config.FeedConfigAccumulatedProductionLastHour) {
								tibberFeedConfigs[index].accumulatedProductionLastHour = true;
							}
							if (this.config.FeedConfigAccumulatedCost) {
								tibberFeedConfigs[index].accumulatedCost = true;
							}
							if (this.config.FeedConfigAccumulatedCost) {
								tibberFeedConfigs[index].accumulatedReward = true;
							}
							if (this.config.FeedConfigCurrency) {
								tibberFeedConfigs[index].currency = true;
							}
							if (this.config.FeedConfigMinPower) {
								tibberFeedConfigs[index].minPower = true;
							}
							if (this.config.FeedConfigAveragePower) {
								tibberFeedConfigs[index].averagePower = true;
							}
							if (this.config.FeedConfigMaxPower) {
								tibberFeedConfigs[index].maxPower = true;
							}
							if (this.config.FeedConfigMinPowerProduction) {
								tibberFeedConfigs[index].minPowerProduction = true;
							}
							if (this.config.FeedConfigMaxPowerProduction) {
								tibberFeedConfigs[index].maxPowerProduction = true;
							}
							if (this.config.FeedConfigLastMeterProduction) {
								tibberFeedConfigs[index].lastMeterProduction = true;
							}
							if (this.config.FeedConfigPowerFactor) {
								tibberFeedConfigs[index].powerFactor = true;
							}
							if (this.config.FeedConfigVoltagePhase1) {
								tibberFeedConfigs[index].voltagePhase1 = true;
							}
							if (this.config.FeedConfigVoltagePhase2) {
								tibberFeedConfigs[index].voltagePhase2 = true;
							}
							if (this.config.FeedConfigVoltagePhase3) {
								tibberFeedConfigs[index].voltagePhase3 = true;
							}
							if (this.config.FeedConfigCurrentL1) {
								tibberFeedConfigs[index].currentL1 = true;
							}
							if (this.config.FeedConfigCurrentL2) {
								tibberFeedConfigs[index].currentL2 = true;
							}
							if (this.config.FeedConfigCurrentL3) {
								tibberFeedConfigs[index].currentL3 = true;
							}
							if (this.config.FeedConfigSignalStrength) {
								tibberFeedConfigs[index].signalStrength = true;
							}
							tibberPulseInstances[index] = new TibberPulse(tibberFeedConfigs[index], this); // add new instance to array
							tibberPulseInstances[index].connectPulseStream();
						} catch (error) {
							this.log.warn((error as Error).message);
						}
						//}
					});
				}
				//#endregion
			}
		}
	}

	/**
	 * subfunction to loop till prices today for all homes are got from server - adapter startup-phase
	 *
	 * @param tibberAPICaller - TibberAPICaller
	 */
	private async jobPricesTodayLOOP(tibberAPICaller: TibberAPICaller): Promise<void> {
		let okPrice = false;
		let attempt = 0;
		do {
			attempt++;
			okPrice = await tibberAPICaller.updatePricesTodayAllHomes(this.homeInfoList, "QUARTER_HOURLY" as PriceResolution, true);
			this.log.debug(`Loop job PricesToday - attempt ${attempt}, okPrice: ${okPrice}`);
			await this.delay(this.getRandomDelay(4, 6));
		} while (!okPrice && attempt < 10);
		if (okPrice) {
			await tibberAPICaller.updateCurrentPriceAllHomes(this.homeInfoList);
		}
	}

	/**
	 * subfunction to loop till prices tomorrow for all homes are got from server - adapter startup-phase
	 *
	 * @param tibberAPICaller - TibberAPICaller
	 */
	private async jobPricesTomorrowLOOP(tibberAPICaller: TibberAPICaller): Promise<void> {
		let okPrice = false;
		let attempt = 0;
		do {
			attempt++;
			okPrice = await tibberAPICaller.updatePricesTomorrowAllHomes(this.homeInfoList, "QUARTER_HOURLY" as PriceResolution, true);
			this.log.debug(`Loop job PricesTomorrow - attempt ${attempt}, okPrice: ${okPrice}`);
			await this.delay(this.getRandomDelay(4, 6));
		} while (!okPrice && attempt < 8);
	}

	/**
	 * generates random delay time in milliseconds between min minutes and max minutes
	 *
	 * @param minMinutes - minimum minutes of delay as number
	 * @param maxMinutes - maximum minutes of delay as number
	 * @returns delay - milliseconds as integer
	 */
	private getRandomDelay = (minMinutes: number, maxMinutes: number): number => {
		if (minMinutes >= maxMinutes) {
			throw new Error("minMinutes should be less than maxMinutes");
		}
		const randomMinutes = Math.random() * (maxMinutes - minMinutes) + minMinutes;
		return Math.floor(randomMinutes * 60 * 1000);
	};

	/**
	 * Is called from adapter config screen
	 *
	 * @param obj - any
	 */
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
									this.homeInfoList.map(item => ({
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
									this.homeInfoList.map(item => ({
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
	 *
	 * @param callback - void
	 */
	private async onUnload(callback: () => void): Promise<void> {
		try {
			for (const cronJob of this.cronList) {
				await cronJob.stop();
			}
			if (this.config.UseLocalPulseData) {
				this.tibberLocal.clearIntervals();
			}
			await this.setState("info.connection", false, true);
			callback();
		} catch (e) {
			this.log.warn((e as Error).message);
			callback();
		}
	}

	/**
	 * Is called if a subscribed state changes
	 *
	 * @param id - state ID
	 * @param state - ioBroker state object
	 */
	private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
		try {
			if (state) {
				// The state was changed
				// this.adapter.subscribeStates(`Homes.${homeId}.Calculations.${channel}.*`);
				if (!state.ack) {
					this.log.debug(`state change detected and parsing for id: ${id} - state: ${state.val}`);
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
											void this.setState(id, state.val, true); // set acknowledge true
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
											void this.setState(id, state.val, true);
										} else {
											this.log.warn(`Wrong type for channel: ${calcChannel} - chTriggerPrice: ${state.val}`);
										}
										break;
									case "AmountHours":
										// Update .chAmountHours based on state.val if it's a number
										if (typeof state.val === "number") {
											// TODO remove after test: this.config.CalculatorList[calcChannel].chAmountHours = state.val;
											const roundedValue = Math.round(state.val * 4) / 4;
											this.config.CalculatorList[calcChannel].chAmountHours = roundedValue * 4; // hours to quarter hour blocks
											this.log.debug(
												//`calculator settings state in home: ${homeIDToMatch} - channel: ${calcChannel} - changed to AmountHours: ${roundedValue}`,
												`calculator settings state in home: ${homeIDToMatch} - channel: ${calcChannel} - changed to AmountHours-15min-blocks: ${this.config.CalculatorList[calcChannel].chAmountHours}`,
											);
											void this.setState(id, roundedValue, true);
											// TODO remove after test: void this.setState(id, state.val, true);
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
												// floor to nearest 15-minute interval
												// TODO remove after test: const minutes = dateWithTimeZone.getMinutes();
												// TODO remove after test: dateWithTimeZone.setMinutes(Math.floor(minutes / 15) * 15, 0, 0);
												const roundedDate = roundToNearestMinutes(dateWithTimeZone, { nearestTo: 15, roundingMethod: "floor" });
												// floor to hour
												// TODO remove after test: dateWithTimeZone.setMinutes(0, 0, 0);

												// TODO remove after test: this.config.CalculatorList[calcChannel].chStartTime = dateWithTimeZone;
												this.config.CalculatorList[calcChannel].chStartTime = roundedDate;
												this.log.debug(
													`calculator settings state in home: ${homeIDToMatch} - channel: ${calcChannel} - changed to StartTime: ${format(
														// TODO remove after test: dateWithTimeZone,
														roundedDate,
														"yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
													)}`,
												);
												// TODO remove after test: void this.setState(id, format(dateWithTimeZone, "yyyy-MM-dd'T'HH:mm:ss.SSSXXX"), true);
												void this.setState(id, format(roundedDate, "yyyy-MM-dd'T'HH:mm:ss.SSSXXX"), true);
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
												// floor to nearest 15-minute interval
												// TODO remove after test: const minutes = dateWithTimeZone.getMinutes();
												// TODO remove after test: dateWithTimeZone.setMinutes(Math.floor(minutes / 15) * 15, 0, 0);
												const roundedDate = roundToNearestMinutes(dateWithTimeZone, { nearestTo: 15, roundingMethod: "floor" });
												// floor to hour
												// TODO remove after test:  dateWithTimeZone.setMinutes(0, 0, 0);

												// TODO remove after test:  this.config.CalculatorList[calcChannel].chStopTime = dateWithTimeZone;
												this.config.CalculatorList[calcChannel].chStopTime = roundedDate;
												// START Warn long LTF
												// Get StartTime directly as a Date object
												const startTime = this.config.CalculatorList[calcChannel].chStartTime;
												// Check if StopTime is not the same day or the next day as StartTime
												// TODO remove after test:  if (!isSameDay(dateWithTimeZone, startTime) && !isSameDay(dateWithTimeZone, addDays(startTime, 1))) {
												if (!isSameDay(roundedDate, startTime) && !isSameDay(roundedDate, addDays(startTime, 1))) {
													this.log.warn(
														// TODO remove after test:  `StopTime for channel ${calcChannel} is not the same or next day as StartTime! StartTime: ${startTime.toISOString()}, StopTime: ${dateWithTimeZone.toISOString()}`,
														`StopTime for channel ${calcChannel} is not the same or next day as StartTime! StartTime: ${startTime.toISOString()}, StopTime: ${roundedDate.toISOString()}`,
													);
													this.log.warn(
														`Setting StopTime outside the feasible range (same or next day as StartTime) can lead to errors in calculations or unexpected behavior. Please verify your configuration.`,
													);
												}
												// STOP Warn long LTF

												this.log.debug(
													`calculator settings state in home: ${homeIDToMatch} - channel: ${calcChannel} - changed to StopTime: ${format(
														// TODO remove after test: dateWithTimeZone,
														roundedDate,
														"yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
													)}`,
												);
												void this.setState(id, format(dateWithTimeZone, "yyyy-MM-dd'T'HH:mm:ss.SSSXXX"), true);
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
											void this.setState(id, state.val, true);
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
											void this.setState(id, state.val, true);
										} else {
											this.log.warn(`Wrong type for channel: ${calcChannel} - chEfficiencyLoss: ${state.val}`);
										}
										break;
									case "Percentage":
										// Update .chPercentage based on state.val if it's a number
										if (typeof state.val === "number") {
											this.config.CalculatorList[calcChannel].chPercentage = state.val;
											this.log.debug(
												`calculator settings state in home: ${homeIDToMatch} - channel: ${calcChannel} - changed to Percentage: ${this.config.CalculatorList[calcChannel].chPercentage}`,
											);
											void this.setState(id, state.val, true);
										} else {
											this.log.warn(`Wrong type for channel: ${calcChannel} - chPercentage: ${state.val}`);
										}
										break;
									default:
										this.log.debug(`unknown value for setting type: ${settingType}`);
								}
								this.tibberCalculator
									.startCalculatorTasks(true)
									.then(() => this.tibberCharts.generateFlexChartJSONAllHomes(this.homeInfoList))
									.catch(error => this.log.error(`unknown error calling tasks after parameter update: ${error}`));
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
