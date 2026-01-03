import type * as utils from "@iobroker/adapter-core";
import { addMinutes } from "date-fns";
import { TibberQuery, type IConfig } from "tibber-api";
import type { IAddress } from "tibber-api/lib/src/models/IAddress.js";
import type { IConsumption } from "tibber-api/lib/src/models/IConsumption.js";
import type { IContactInfo } from "tibber-api/lib/src/models/IContactInfo.js";
import type { ILegalEntity } from "tibber-api/lib/src/models/ILegalEntity.js";
import type { IPrice } from "tibber-api/lib/src/models/IPrice.js";
import { EnergyResolution } from "tibber-api/lib/src/models/enums/EnergyResolution.js";
import type { PriceResolution } from "tibber-api/lib/src/models/enums/PriceResolution.js";
import { ProjectUtils, type IHomeInfo } from "./projectUtils.js";

/**
 * TibberAPICaller
 */
export class TibberAPICaller extends ProjectUtils {
	tibberConfig: IConfig;
	tibberQuery: TibberQuery;

	/**
	 * constructor
	 *
	 * @param tibberConfig - the Tibber configuration object
	 * @param adapter - ioBroker adapter instance
	 */
	constructor(tibberConfig: IConfig, adapter: utils.AdapterInstance) {
		super(adapter);
		this.tibberConfig = tibberConfig;
		this.tibberQuery = new TibberQuery(this.tibberConfig, 60000);
	}

	/**
	 * updateHomesFromAPI
	 */
	async updateHomesFromAPI(): Promise<IHomeInfo[]> {
		try {
			const Homes = await this.tibberQuery.getHomes();
			this.adapter.log.debug(`Got homes from tibber api: ${JSON.stringify(Homes)}`);
			const homeInfoList: IHomeInfo[] = [];
			for (const currentHome of Homes) {
				homeInfoList.push({
					ID: currentHome.id,
					NameInApp: currentHome.appNickname,
					RealTime: currentHome.features.realTimeConsumptionEnabled,
					FeedActive: false,
					PriceDataPollActive: true,
				});
				// Set HomeId in tibberConfig for further API Calls
				this.tibberConfig.homeId = currentHome.id;

				const basePath = `Homes.${currentHome.id}`;
				// Home GENERAL
				void this.checkAndSetValue(`${basePath}.General.Id`, currentHome.id, "ID of your home");
				void this.checkAndSetValue(`${basePath}.General.Timezone`, currentHome.timeZone, "The time zone the home resides in");
				void this.checkAndSetValue(`${basePath}.General.NameInApp`, currentHome.appNickname, "The nickname given to the home");
				void this.checkAndSetValue(`${basePath}.General.AvatarInApp`, currentHome.appAvatar, "The chosen app avatar for the home");
				// Values: APARTMENT, ROWHOUSE, FLOORHOUSE1, FLOORHOUSE2, FLOORHOUSE3, COTTAGE, CASTLE
				void this.checkAndSetValue(`${basePath}.General.Type`, currentHome.type, "The type of home.");
				// Values: APARTMENT, ROWHOUSE, HOUSE, COTTAGE
				void this.checkAndSetValue(
					`${basePath}.General.PrimaryHeatingSource`,
					currentHome.primaryHeatingSource,
					`The primary form of heating in the home`,
				);
				// Values: AIR2AIR_HEATPUMP, ELECTRICITY, GROUND, DISTRICT_HEATING, ELECTRIC_BOILER, AIR2WATER_HEATPUMP, OTHER
				void this.checkAndSetValueNumber(`${basePath}.General.Size`, currentHome.size, "The size of the home in square meters");
				void this.checkAndSetValueNumber(
					`${basePath}.General.NumberOfResidents`,
					currentHome.numberOfResidents,
					`he number of people living in the home`,
				);
				void this.checkAndSetValueNumber(`${basePath}.General.MainFuseSize`, currentHome.mainFuseSize, "The main fuse size");
				void this.checkAndSetValueBoolean(
					`${basePath}.General.HasVentilationSystem`,
					currentHome.hasVentilationSystem,
					`Whether the home has a ventilation system`,
				);

				this.fetchAddress(currentHome.id, "Address", currentHome.address);
				this.fetchLegalEntity(currentHome.id, "Owner", currentHome.owner);

				void this.checkAndSetValueBoolean(
					`${basePath}.Features.RealTimeConsumptionEnabled`,
					currentHome.features.realTimeConsumptionEnabled,
					`Whether Tibber server will send consumption data by API`,
				);
			}
			return homeInfoList;
		} catch (error) {
			this.adapter.log.error(this.generateErrorMessage(error, `fetching homes from Tibber API`));
			return [];
		}
	}

	/**
	 * updates current prices of all homes
	 *
	 * @param homeInfoList - homeInfo list object
	 * @returns okprice - got correct data
	 */
	async updateCurrentPriceAllHomes(homeInfoList: IHomeInfo[]): Promise<boolean> {
		let okprice = true;
		for (const curHomeInfo of homeInfoList) {
			if (!curHomeInfo.PriceDataPollActive) {
				continue;
			}
			if (!(await this.updateCurrentPrice(curHomeInfo.ID))) {
				okprice = false;
			} // single fault sets all false
		}
		return okprice;
	}
	/**
	 * updates current price of one home based on already fetched PricesToday
	 *
	 * @param homeId - homeId string
	 * @returns okprice - got new data
	 */
	private async updateCurrentPrice(homeId: string): Promise<boolean> {
		if (!homeId) {
			return false;
		}
		try {
			const now = new Date();
			const pricesStr = await this.getStateValue(`Homes.${homeId}.PricesToday.json`);
			if (!pricesStr) {
				this.adapter.log.debug(`No PricesToday data found for home ${homeId}`);
				return false;
			}
			const pricesToday: IPrice[] = JSON.parse(pricesStr);
			if (!Array.isArray(pricesToday) || pricesToday.length === 0) {
				this.adapter.log.debug(`PricesToday array empty for home ${homeId}`);
				return false;
			}

			// get price object for current 15 minute period
			const currentPrice = pricesToday.find(p => {
				const start = new Date(p.startsAt);
				const end = addMinutes(start, 15); // 15 minutes interval
				return now >= start && now < end;
			});
			if (!currentPrice) {
				this.adapter.log.warn(`No matching price found for current time in home ${homeId}`);
				return false;
			}

			// use found price info
			await this.fetchPrice(homeId, "CurrentPrice", currentPrice);
			await this.fetchPriceRemainingAverage(homeId, "PricesToday.averageRemaining", pricesToday);
			this.adapter.log.debug(`Updated current price and remaining average for home ${homeId} from PricesToday: ${JSON.stringify(currentPrice)}`);
			return true;
		} catch (error: unknown) {
			const msg = this.generateErrorMessage(error, `update of current price from PricesToday`);
			this.adapter.log.error(msg);
			return false;
		}
	}

	//WiP 6.1.0 new Job - copy prices today to yesterday at 00:00:01
	/**
	 * daily rollover at exactly 00:00:00
	 * copies current PricesToday → PricesYesterday & current PricesTomorrow → PricesToday (if available)
	 * clears PricesTomorrow afterwards
	 * this ensures Yesterday is always filled, even if Tibber API fails shortly after midnight
	 *
	 * @param homeInfoList - homeInfo list object
	 */
	async dailyPriceRolloverAllHomes(homeInfoList: IHomeInfo[]): Promise<void> {
		for (const curHomeInfo of homeInfoList) {
			if (!curHomeInfo.PriceDataPollActive) {
				continue;
			}
			await this.dailyPriceRollover(curHomeInfo.ID);
		}
	}

	/**
	 * daily rollover at exactly 00:00:00 of one home
	 *
	 * @param homeId - homeId string
	 */
	private async dailyPriceRollover(homeId: string): Promise<void> {
		try {
			let currentPricesToday: IPrice[] = [];
			let currentPricesTomorrow: IPrice[] = [];
			try {
				currentPricesToday = JSON.parse((await this.getStateValue(`Homes.${homeId}.PricesToday.json`)) || "[]");
				currentPricesTomorrow = JSON.parse((await this.getStateValue(`Homes.${homeId}.PricesTomorrow.json`)) || "[]");
			} catch {
				currentPricesToday = [];
				currentPricesTomorrow = [];
			}

			this.adapter.log.info(`Performing daily price rollover for home ${homeId}`);

			// yesterday = old today
			await this.checkAndSetValue(`Homes.${homeId}.PricesYesterday.json`, JSON.stringify(currentPricesToday), `The prices yesterday as json`);

			// new today = old tomorrow (if available, otherwise keep current)
			const newPricesToday = currentPricesTomorrow.length > 0 ? currentPricesTomorrow : []; // fallback empty
			await this.checkAndSetValue(`Homes.${homeId}.PricesToday.json`, JSON.stringify(newPricesToday), `The prices today as json`);

			// empty PricesTomorrow (will be filled later if available)
			await this.checkAndSetValue(`Homes.${homeId}.PricesTomorrow.json`, JSON.stringify([]), `The prices tomorrow as json`);

			// recalculate sorted variants and statistics (for yesterday and today)
			if (Array.isArray(currentPricesToday) && currentPricesToday.length > 0) {
				await this.checkAndSetValue(
					`Homes.${homeId}.PricesYesterday.jsonBYpriceASC`,
					JSON.stringify([...currentPricesToday].sort((a, b) => a.total - b.total)),
					`prices yesterday sorted by cost ascending as json`,
				);
				this.fetchPriceAverage(homeId, `PricesYesterday.average`, currentPricesToday);
				this.fetchPriceMaximum(homeId, `PricesYesterday.maximum`, currentPricesToday);
				this.fetchPriceMinimum(homeId, `PricesYesterday.minimum`, currentPricesToday);
			}
			if (Array.isArray(newPricesToday) && newPricesToday.length > 0) {
				await this.checkAndSetValue(
					`Homes.${homeId}.PricesToday.jsonBYpriceASC`,
					JSON.stringify([...newPricesToday].sort((a, b) => a.total - b.total)),
					`prices today sorted by cost ascending as json`,
				);
				this.fetchPriceAverage(homeId, `PricesToday.average`, newPricesToday);
				await this.fetchPriceRemainingAverage(homeId, `PricesToday.averageRemaining`, newPricesToday);
				this.fetchPriceMaximum(homeId, `PricesToday.maximum`, newPricesToday);
				this.fetchPriceMinimum(homeId, `PricesToday.minimum`, newPricesToday);
				for (let i = 0; i < newPricesToday.length; i++) {
					await this.fetchPrice(homeId, `PricesToday.${i}`, newPricesToday[i]);
				}
			}

			// emptying PricesTomorrow states
			this.adapter.log.debug(`Emptying prices tomorrow and average cause existing ones are obsolete after rollover`);
			for (let i = 0; i < 96; i++) {
				this.emptyingPrice(homeId, `PricesTomorrow.${i}`);
			}
			this.emptyingPriceAverage(homeId, `PricesTomorrow.average`);
			this.emptyingPriceMaximum(homeId, `PricesTomorrow.maximum`);
			this.emptyingPriceMinimum(homeId, `PricesTomorrow.minimum`);
			await this.checkAndSetValue(
				`Homes.${homeId}.PricesTomorrow.jsonBYpriceASC`,
				JSON.stringify([]),
				`prices tomorrow sorted by cost ascending as json`,
			);

			this.adapter.log.debug(`daily price rollover completed for home ${homeId}`);
		} catch (error: unknown) {
			this.adapter.log.error(this.generateErrorMessage(error, `daily price rollover for home ${homeId}`));
		}
	}
	// WiP 6.1.0 new Job - copy prices today to yesterday at 00:00:01

	/**
	 * Updates the list of today's prices for all homes.
	 *
	 * @param homeInfoList - List of home information objects.
	 * @param resolution - The resolution of the price data (e.g., HOURLY or QUARTER_HOURLY).
	 * @param forceUpdate - Optional flag to force update even if existing data is valid. Default is false.
	 * @returns A promise that resolves to a boolean indicating whether the update was successful.
	 */
	async updatePricesTodayAllHomes(homeInfoList: IHomeInfo[], resolution: PriceResolution, forceUpdate = false): Promise<boolean> {
		let okprice = true;
		for (const curHomeInfo of homeInfoList) {
			if (!curHomeInfo.PriceDataPollActive) {
				continue;
			}
			if (!(await this.updatePricesToday(curHomeInfo.ID, resolution, forceUpdate))) {
				okprice = false;
			} else {
				const now = new Date();
				void this.checkAndSetValue(`Homes.${curHomeInfo.ID}.PricesToday.lastUpdate`, now.toString(), `last update of prices today`);
			}
		}
		return okprice;
	}
	/**
	 * updates list of todays prices of one home
	 *
	 * @param homeId - homeId string
	 * @param resolution Either HOURLY or QUARTER_HOURLY
	 * @param forceUpdate - OPTIONAL: force mode, without verification if existing data is fitting to current date, default: false
	 * @returns okprice - got correct data
	 */
	private async updatePricesToday(homeId: string, resolution: PriceResolution, forceUpdate = false): Promise<boolean> {
		try {
			let exDate: Date | null = null;
			let exPricesToday: IPrice[] = [];
			if (!forceUpdate) {
				exPricesToday = JSON.parse(await this.getStateValue(`Homes.${homeId}.PricesToday.json`));
			}
			if (Array.isArray(exPricesToday) && exPricesToday[2]?.startsAt) {
				exDate = new Date(exPricesToday[2].startsAt);
			}
			const today = new Date();
			today.setHours(0, 0, 0, 0); // sets clock to 0:00

			if (!exDate || exDate < today || forceUpdate || !Array.isArray(exPricesToday) || exPricesToday.length === 0) {
				const pricesToday = await this.tibberQuery.getTodaysEnergyPrices(homeId, resolution);
				if (!(Array.isArray(pricesToday) && pricesToday.length > 0 && pricesToday[2]?.total)) {
					throw new Error(`Got invalid data structure from Tibber [you might not have a valid (or fully confirmed) contract]`);
				}
				this.adapter.log.debug(`Got prices today from tibber api: ${JSON.stringify(pricesToday)} Force: ${forceUpdate}`);
				void this.checkAndSetValue(`Homes.${homeId}.PricesToday.json`, JSON.stringify(pricesToday), `The prices today as json`);
				this.fetchPriceAverage(homeId, `PricesToday.average`, pricesToday);
				await this.fetchPriceRemainingAverage(homeId, `PricesToday.averageRemaining`, pricesToday);
				this.fetchPriceMaximum(homeId, `PricesToday.maximum`, pricesToday);
				this.fetchPriceMinimum(homeId, `PricesToday.minimum`, pricesToday);
				for (let i = 0; i < pricesToday.length; i++) {
					// states as 0, 1, 2 ... for hourly resolution or 0,1,2...95 for 15 minutes resolution
					await this.fetchPrice(homeId, `PricesToday.${i}`, pricesToday[i]);
				}
				void this.checkAndSetValue(
					`Homes.${homeId}.PricesToday.jsonBYpriceASC`,
					JSON.stringify(pricesToday.sort((a, b) => a.total - b.total)),
					`prices sorted by cost ascending as json`,
				);
				// verify if data is for this day
				if (pricesToday[2]?.startsAt) {
					const newDate = new Date(pricesToday[2].startsAt);
					if (newDate >= today) {
						return true;
					}
				}
				return false;
			} // else if (exDate && exDate >= today) {
			this.adapter.log.debug(`Existing date of price info is already the today date, polling of prices today from Tibber skipped`);
			return true;
		} catch (error: unknown) {
			if (forceUpdate) {
				this.adapter.log.error(this.generateErrorMessage(error, `force pull of prices today`));
			} else {
				this.adapter.log.warn(this.generateErrorMessage(error, `pull of prices today`));
			}
			return false;
		}
	}

	/* WiP 6.1.0 new Job - copy prices today to yesterday at 00:00:01
	private async updatePricesToday(homeId: string, resolution: PriceResolution, forceUpdate = false): Promise<boolean> {
		try {
			let exDate: Date | null = null;
			let exPricesToday: IPrice[] = [];
			if (!forceUpdate) {
				exPricesToday = JSON.parse(await this.getStateValue(`Homes.${homeId}.PricesToday.json`));
			}
			if (Array.isArray(exPricesToday) && exPricesToday[2]?.startsAt) {
				exDate = new Date(exPricesToday[2].startsAt);
			}
			const today = new Date();
			today.setHours(0, 0, 0, 0); // sets clock to 0:00
			if (!exDate || exDate <= today || forceUpdate) {
				const pricesToday = await this.tibberQuery.getTodaysEnergyPrices(homeId, resolution);
				if (!(Array.isArray(pricesToday) && pricesToday.length > 0 && pricesToday[2]?.total)) {
					throw new Error(`Got invalid data structure from Tibber [you might not have a valid (or fully confirmed) contract]`);
				}
				this.adapter.log.debug(`Got prices today from tibber api: ${JSON.stringify(pricesToday)} Force: ${forceUpdate}`);
				void this.checkAndSetValue(`Homes.${homeId}.PricesToday.json`, JSON.stringify(pricesToday), `The prices today as json`); // write also it might be empty
				void this.checkAndSetValue(`Homes.${homeId}.PricesYesterday.json`, JSON.stringify(exPricesToday), `The prices yesterday as json`);
				this.fetchPriceAverage(homeId, `PricesToday.average`, pricesToday);
				await this.fetchPriceRemainingAverage(homeId, `PricesToday.averageRemaining`, pricesToday);
				this.fetchPriceMaximum(homeId, `PricesToday.maximum`, pricesToday);
				this.fetchPriceMinimum(homeId, `PricesToday.minimum`, pricesToday);
				for (let i = 0; i < pricesToday.length; i++) {
					// states as 0, 1, 2 ... for hourly resolution or 0,1,2...95 for 15 minutes resolution
					await this.fetchPrice(homeId, `PricesToday.${i}`, pricesToday[i]);
				}
				if (Array.isArray(pricesToday) && pricesToday[2]?.startsAt) {
					// Got valid pricesToday
					void this.checkAndSetValue(
						`Homes.${homeId}.PricesToday.jsonBYpriceASC`,
						JSON.stringify(pricesToday.sort((a, b) => a.total - b.total)),
						`prices sorted by cost ascending as json`,
					);
					exDate = new Date(pricesToday[2].startsAt);
					if (exDate && exDate >= today) {
						return true;
					}
				} else {
					// Handle the case when pricesToday is not an array, it's empty!, so just don't sort and write
					void this.checkAndSetValue(
						`Homes.${homeId}.PricesToday.jsonBYpriceASC`,
						JSON.stringify(pricesToday),
						`prices sorted by cost ascending as json`,
					);
					return false;
				}
			} else {
				this.adapter.log.debug(`Existing date of price info is already the today date, polling of prices today from Tibber skipped`);
				return true;
			}
		} catch (error: unknown) {
			if (forceUpdate) {
				this.adapter.log.error(this.generateErrorMessage(error, `force pull of prices today`));
			} else {
				this.adapter.log.warn(this.generateErrorMessage(error, `pull of prices today`));
			}
			return false;
		}
	}
	*/ //WiP 6.1.0 new Job - copy prices today to yesterday at 00:00:01

	/**
	 * updates lists of tomorrows prices of all homes
	 *
	 * @param homeInfoList - homeInfo list object
	 * @param resolution Either HOURLY or QUARTER_HOURLY
	 * @param forceUpdate - OPTIONAL: force mode, without verification if existing data is fitting to current date, default: false
	 * @returns okprice - got correct data
	 */
	async updatePricesTomorrowAllHomes(homeInfoList: IHomeInfo[], resolution: PriceResolution, forceUpdate = false): Promise<boolean> {
		let okprice = true;
		for (const curHomeInfo of homeInfoList) {
			if (!curHomeInfo.PriceDataPollActive) {
				continue;
			}
			if (!(await this.updatePricesTomorrow(curHomeInfo.ID, resolution, forceUpdate))) {
				okprice = false; // single fault sets all false
			} else {
				const now = new Date();
				void this.checkAndSetValue(`Homes.${curHomeInfo.ID}.PricesTomorrow.lastUpdate`, now.toString(), `last update of prices tomorrow`);
			}
		}
		return okprice;
	}
	/**
	 * updates list of tomorrows prices of one home
	 *
	 * @param homeId - homeId string
	 * @param resolution Either HOURLY or QUARTER_HOURLY
	 * @param forceUpdate - OPTIONAL: force mode, without verification if existing data is fitting to current date, default: false
	 * @returns okprice - got new data
	 */
	private async updatePricesTomorrow(homeId: string, resolution: PriceResolution, forceUpdate = false): Promise<boolean> {
		try {
			let exDate: Date | null = null;
			let exPricesTomorrow: IPrice[] = [];
			if (!forceUpdate) {
				exPricesTomorrow = JSON.parse(await this.getStateValue(`Homes.${homeId}.PricesTomorrow.json`));
			}
			if (Array.isArray(exPricesTomorrow) && exPricesTomorrow[2]?.startsAt) {
				exDate = new Date(exPricesTomorrow[2].startsAt);
			}
			const morgen = new Date();
			morgen.setDate(morgen.getDate() + 1);
			morgen.setHours(0, 0, 0, 0); // sets clock to 0:00
			if (!exDate || exDate < morgen || forceUpdate) {
				const pricesTomorrow = await this.tibberQuery.getTomorrowsEnergyPrices(homeId, resolution);
				this.adapter.log.debug(`Got prices tomorrow from tibber api: ${JSON.stringify(pricesTomorrow)} Force: ${forceUpdate}`);
				void this.checkAndSetValue(`Homes.${homeId}.PricesTomorrow.json`, JSON.stringify(pricesTomorrow), `The prices tomorrow as json`); // write also it might be empty
				if (pricesTomorrow.length === 0) {
					// pricing not known, before about 13:00 - delete all the states
					this.adapter.log.debug(`Emptying prices tomorrow and average cause existing ones are obsolete...`);
					for (let timeblock = 0; timeblock < 96; timeblock++) {
						this.emptyingPrice(homeId, `PricesTomorrow.${timeblock}`);
					}
					this.emptyingPriceAverage(homeId, `PricesTomorrow.average`);
					this.emptyingPriceMaximum(homeId, `PricesTomorrow.maximum`);
					this.emptyingPriceMinimum(homeId, `PricesTomorrow.minimum`);
					void this.checkAndSetValue(
						`Homes.${homeId}.PricesTomorrow.jsonBYpriceASC`,
						JSON.stringify(pricesTomorrow),
						`prices tomorrow sorted by cost ascending as json`,
					);
					return false;
				} else if (Array.isArray(pricesTomorrow)) {
					// pricing known, after about 13:00 - write the states
					for (let i = 0; i < pricesTomorrow.length; i++) {
						// states as 0, 1, 2 ... for hourly resolution or 0,1,2...95 for 15 minutes resolution
						const price = pricesTomorrow[i];
						await this.fetchPrice(homeId, `PricesTomorrow.${i}`, price);
					}
					this.fetchPriceAverage(homeId, `PricesTomorrow.average`, pricesTomorrow);
					this.fetchPriceMaximum(homeId, `PricesTomorrow.maximum`, pricesTomorrow);
					this.fetchPriceMinimum(homeId, `PricesTomorrow.minimum`, pricesTomorrow);
					void this.checkAndSetValue(
						`Homes.${homeId}.PricesTomorrow.jsonBYpriceASC`,
						JSON.stringify(pricesTomorrow.sort((a, b) => a.total - b.total)),
						`prices sorted by cost ascending as json`,
					);
					exDate = new Date(pricesTomorrow[2].startsAt);
					if (exDate && exDate >= morgen) {
						return true;
					}
					return false;
				}
			} else if (exDate && exDate >= morgen) {
				this.adapter.log.debug(`Existing date of price info is already the tomorrow date, polling of prices tomorrow from Tibber skipped`);
				return true;
			}
			return false;
		} catch (error: unknown) {
			if (forceUpdate) {
				this.adapter.log.error(this.generateErrorMessage(error, `force pull of prices tomorrow`));
			} else {
				this.adapter.log.warn(this.generateErrorMessage(error, `pull of prices tomorrow`));
			}
			return false;
		}
	}

	/**
	 * updates historical consumption data of all homes
	 *
	 * @returns void - data will be written to ioBroker objects as JSON
	 */
	async updateConsumptionAllHomes(): Promise<void> {
		try {
			for (const home of this.adapter.config.HomesList) {
				if (!home.statsActive || !home.homeID) {
					continue;
				}
				const homeID = home.homeID;
				const resolutions = [
					// TODO: add EnergyResolution.QuarterHourly when Tibber API supports it
					{ type: EnergyResolution.HOURLY, state: `jsonHourly`, numCons: home.numberConsHourly, description: `hour` },
					{ type: EnergyResolution.DAILY, state: `jsonDaily`, numCons: home.numberConsDaily, description: `day` },
					{ type: EnergyResolution.WEEKLY, state: `jsonWeekly`, numCons: home.numberConsWeekly, description: `week` },
					{ type: EnergyResolution.MONTHLY, state: `jsonMonthly`, numCons: home.numberConsMonthly, description: `month` },
					{ type: EnergyResolution.ANNUAL, state: `jsonAnnual`, numCons: home.numberConsAnnual, description: `year` },
				];
				for (const { type, state, numCons, description } of resolutions) {
					if (numCons && numCons > 0) {
						/* Obsolete stats again part of tibber-api
						let consumption: IConsumption[];
						if (this.adapter.config.UseObsoleteStats) {
							consumption = await this.getConsumptionObs(type, numCons, homeID);
						} else {
							consumption = await this.tibberQuery.getConsumption(type, numCons, homeID);
						}
						*/
						const consumption: IConsumption[] = await this.tibberQuery.getConsumption(type, numCons, homeID);

						void this.checkAndSetValue(
							`Homes.${homeID}.Consumption.${state}`,
							JSON.stringify(consumption),
							`Historical consumption last ${description}s as json)`,
							`json`,
						);
					} else {
						void this.checkAndSetValue(`Homes.${homeID}.Consumption.${state}`, `[]`);
					}
				}
				this.adapter.log.debug(`Got all consumption data from Tibber Server for home: ${homeID}`);
			}
		} catch (error: unknown) {
			this.adapter.log.error(this.generateErrorMessage(error, `pull of consumption data`));
		}
	}

	/**
	 * Updates the list of tomorrow's prices for one home.
	 *
	 * @param homeId - The unique identifier of the home.
	 * @param objectDestination - The destination object for storing price data.
	 * @param price - The price object containing price information.
	 * @returns Promise<void> - Resolves when the price data is successfully fetched and updated.
	 */
	private async fetchPrice(homeId: string, objectDestination: string, price: IPrice): Promise<void> {
		const basePath = `Homes.${homeId}.${objectDestination}`;
		const date = new Date(price.startsAt);
		const timeLabel = `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
		await this.adapter.setObject(basePath, {
			type: "folder",
			common: {
				name: `valid from ${timeLabel}`,
			},
			native: {},
		});
		await this.checkAndSetValueNumber(`${basePath}.total`, price.total, `Total price (energy + taxes)`);
		void this.checkAndSetValueNumber(`${basePath}.energy`, price.energy, `Spotmarket energy price`);
		void this.checkAndSetValueNumber(`${basePath}.tax`, price.tax, `Tax part of the price (energy, tax, VAT...)`);
		void this.checkAndSetValue(`${basePath}.startsAt`, price.startsAt, `Start time of the price`);
		//void this.checkAndSetValue(`${basePath}.currency`, price.currency, `The price currency`);
		void this.checkAndSetValue(`${basePath}.level`, price.level, `Price level compared to recent price values`);
	}

	private fetchPriceAverage(homeId: string, objectDestination: string, price: IPrice[]): void {
		if (!price || price.length === 0) {
			return;
		}

		const sumValues = (key: keyof IPrice): number => price.reduce((sum, item) => (item && typeof item[key] === "number" ? sum + item[key] : sum), 0);

		const basePath = `Homes.${homeId}.${objectDestination}`;
		void this.checkAndSetValueNumber(`${basePath}.total`, Math.round(1000 * (sumValues("total") / price.length)) / 1000, `Todays total price average`);
		void this.checkAndSetValueNumber(
			`${basePath}.energy`,
			Math.round(1000 * (sumValues("energy") / price.length)) / 1000,
			`Todays average spotmarket price`,
		);
		void this.checkAndSetValueNumber(`${basePath}.tax`, Math.round(1000 * (sumValues("tax") / price.length)) / 1000, `Todays average tax price`);
	}

	/**
	 * calculates the average of remaining prices for today based on 15-minute intervals
	 *
	 * @param homeId - homeId string
	 * @param objectDestination - destination state path
	 * @param price - array of IPrice for today
	 */
	private async fetchPriceRemainingAverage(homeId: string, objectDestination: string, price: IPrice[]): Promise<void> {
		if (!price || price.length === 0) {
			return;
		}
		const now = new Date();
		const filteredPrices = price.filter(item => {
			const start = new Date(item.startsAt);
			return start >= now;
		});
		if (!filteredPrices.length) {
			this.adapter.log.debug(`No remaining prices for today in home ${homeId}`);
			return;
		}
		const totalSum = filteredPrices.reduce((sum, item) => sum + (item.total ?? 0), 0);
		const energySum = filteredPrices.reduce((sum, item) => sum + (item.energy ?? 0), 0);
		const taxSum = filteredPrices.reduce((sum, item) => sum + (item.tax ?? 0), 0);
		const count = filteredPrices.length;
		const basePath = `Homes.${homeId}.${objectDestination}`;
		//new
		const date = new Date(filteredPrices[0].startsAt);
		const timeLabel = `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
		await this.adapter.setObject(basePath, {
			type: "folder",
			common: {
				name: `valid from ${timeLabel}`,
			},
			native: {},
		});
		//new
		await this.checkAndSetValueNumber(`${basePath}.total`, Math.round((totalSum / count) * 1000) / 1000, `Todays total price remaining average`);
		await this.checkAndSetValueNumber(`${basePath}.energy`, Math.round((energySum / count) * 1000) / 1000, `Todays remaining average spot market price`);
		await this.checkAndSetValueNumber(`${basePath}.tax`, Math.round((taxSum / count) * 1000) / 1000, `Todays remaining average tax price`);
	}

	private fetchPriceMaximum(homeId: string, objectDestination: string, price: IPrice[]): void {
		if (!price || price.length === 0) {
			return;
		}
		// find maximum entry
		const maxEntry = price.reduce((max, current) => (current.total > max.total ? current : max));

		const basePath = `Homes.${homeId}.${objectDestination}`;
		void this.checkAndSetValueNumber(`${basePath}.total`, Math.round(1000 * maxEntry.total) / 1000, `Todays total price maximum`);
		void this.checkAndSetValueNumber(`${basePath}.energy`, Math.round(1000 * maxEntry.energy) / 1000, `Todays spotmarket price at total price maximum`);
		void this.checkAndSetValueNumber(`${basePath}.tax`, Math.round(1000 * maxEntry.tax) / 1000, `Todays tax price at total price maximum`);
		void this.checkAndSetValue(`${basePath}.level`, maxEntry.level, `Price level compared to recent price values`);
		void this.checkAndSetValue(`${basePath}.startsAt`, maxEntry.startsAt, `Start time of the price maximum`);
	}
	private fetchPriceMinimum(homeId: string, objectDestination: string, price: IPrice[]): void {
		if (!price || price.length === 0) {
			return;
		}
		// find minimum entry
		const minEntry = price.reduce((min, current) => (current.total < min.total ? current : min));

		const basePath = `Homes.${homeId}.${objectDestination}`;
		void this.checkAndSetValueNumber(`${basePath}.total`, Math.round(1000 * minEntry.total) / 1000, `Todays total price minimum`);
		void this.checkAndSetValueNumber(`${basePath}.energy`, Math.round(1000 * minEntry.energy) / 1000, `Todays spotmarket price at total price minimum`);
		void this.checkAndSetValueNumber(`${basePath}.tax`, Math.round(1000 * minEntry.tax) / 1000, `Todays tax price at total price minimum`);
		void this.checkAndSetValue(`${basePath}.level`, minEntry.level, `Price level compared to recent price values`);
		void this.checkAndSetValue(`${basePath}.startsAt`, minEntry.startsAt, `Start time of the price minimum`);
	}

	private emptyingPrice(homeId: string, objectDestination: string): void {
		const basePath = `Homes.${homeId}.${objectDestination}`;
		void this.checkAndSetValueNumber(`${basePath}.total`, 0, "The total price (energy + taxes)");
		void this.checkAndSetValueNumber(`${basePath}.energy`, 0, "Spotmarket price");
		void this.checkAndSetValueNumber(`${basePath}.tax`, 0, "Tax part of the price (energy tax, VAT, etc.)");
		void this.checkAndSetValue(`${basePath}.level`, "Not known now", "Price level compared to recent price values");
	}
	private emptyingPriceAverage(homeId: string, objectDestination: string): void {
		const basePath = `Homes.${homeId}.${objectDestination}`;
		void this.checkAndSetValueNumber(`${basePath}.total`, 0, "The todays total price average");
		void this.checkAndSetValueNumber(`${basePath}.energy`, 0, "The todays avarage spotmarket price");
		void this.checkAndSetValueNumber(`${basePath}.tax`, 0, "The todays avarage tax price");
	}
	private emptyingPriceMaximum(homeId: string, objectDestination: string): void {
		const basePath = `Homes.${homeId}.${objectDestination}`;
		void this.checkAndSetValueNumber(`${basePath}.total`, 0, "Todays total price maximum");
		void this.checkAndSetValueNumber(`${basePath}.energy`, 0, "Todays spotmarket price at total price maximum");
		void this.checkAndSetValueNumber(`${basePath}.tax`, 0, "Todays tax price at total price maximum");
		void this.checkAndSetValue(`${basePath}.level`, "Not known now", "Price level compared to recent price values");
		void this.checkAndSetValue(`${basePath}.startsAt`, "Not known now", "Start time of the price maximum");
	}
	private emptyingPriceMinimum(homeId: string, objectDestination: string): void {
		const basePath = `Homes.${homeId}.${objectDestination}`;
		void this.checkAndSetValueNumber(`${basePath}.total`, 0, "Todays total price minimum");
		void this.checkAndSetValueNumber(`${basePath}.energy`, 0, "Todays spotmarket price at total price minimum");
		void this.checkAndSetValueNumber(`${basePath}.tax`, 0, "Todays tax price at total price minimum");
		void this.checkAndSetValue(`${basePath}.level`, "Not known now", "Price level compared to recent price values");
		void this.checkAndSetValue(`${basePath}.startsAt`, "Not known now", "Start time of the price minimum");
	}

	private fetchLegalEntity(homeId: string, objectDestination: string, legalEntity: ILegalEntity): void {
		const basePath = `Homes.${homeId}.${objectDestination}`;
		void this.checkAndSetValue(`${basePath}.Id`, legalEntity.id);
		void this.checkAndSetValue(`${basePath}.FirstName`, legalEntity.firstName);
		void this.checkAndSetValueBoolean(`${basePath}.IsCompany`, legalEntity.isCompany);
		void this.checkAndSetValue(`${basePath}.Name`, legalEntity.name);
		void this.checkAndSetValue(`${basePath}.MiddleName`, legalEntity.middleName);
		void this.checkAndSetValue(`${basePath}.LastName`, legalEntity.lastName);
		void this.checkAndSetValue(`${basePath}.OrganizationNo`, legalEntity.organizationNo);
		void this.checkAndSetValue(`${basePath}.Language`, legalEntity.language);
		if (legalEntity.contactInfo) {
			this.fetchContactInfo(homeId, `${objectDestination}.ContactInfo`, legalEntity.contactInfo);
		}
		if (legalEntity.address) {
			this.fetchAddress(homeId, `${objectDestination}.Address`, legalEntity.address);
		}
	}
	private fetchContactInfo(homeId: string, objectDestination: string, contactInfo: IContactInfo): void {
		const basePath = `Homes.${homeId}.${objectDestination}`;
		void this.checkAndSetValue(`${basePath}.Email`, contactInfo.email);
		void this.checkAndSetValue(`${basePath}.Mobile`, contactInfo.mobile);
	}
	private fetchAddress(homeId: string, objectDestination: string, address: IAddress): void {
		const basePath = `Homes.${homeId}.${objectDestination}`;
		void this.checkAndSetValue(`${basePath}.address1`, address.address1);
		void this.checkAndSetValue(`${basePath}.address2`, address.address2);
		void this.checkAndSetValue(`${basePath}.address3`, address.address3);
		void this.checkAndSetValue(`${basePath}.City`, address.city);
		void this.checkAndSetValue(`${basePath}.PostalCode`, address.postalCode);
		void this.checkAndSetValue(`${basePath}.Country`, address.country);
		void this.checkAndSetValue(`${basePath}.Latitude`, address.latitude);
		void this.checkAndSetValue(`${basePath}.Longitude`, address.longitude);
	}

	//#region *** obsolete data poll for consumption data ***

	/**
	 * Get energy consumption for one or more homes.
	 * Returns an array of IConsumption
	 *
	 * @param resolution EnergyResolution. Valid values: HOURLY, DAILY, WEEKLY, MONTHLY, ANNUAL
	 * @param lastCount Return the last number of records
	 * @param homeId Tibber home ID.
	 * @returns Array of IConsumption
	 */
	/*
	async getConsumptionObs(resolution: EnergyResolution, lastCount: number, homeId: string): Promise<IConsumption[]> {
		const gqlHomeConsumptionObs = `
			query getConsumption($homeId:ID! $resolution: EnergyResolution! $lastCount:Int!){
				viewer {
					home(id:$homeId) {
						id
							consumption(resolution: $resolution, last: $lastCount) {
								nodes {
									from
									to
									totalCost
									cost
									unitPrice
									unitPriceVAT
									consumption
									consumptionUnit
									currency
								}
							}
					}
				}
			}
		`;

		const variables = { homeId, resolution, lastCount };
		const result = await this.tibberQuery.query(gqlHomeConsumptionObs, variables);
		if (result?.viewer && result.viewer.home) {
			const home: IHome = result.viewer.home;
			return Object.assign([] as IConsumption[], home.consumption ? home.consumption.nodes : []);
		}
		return result && result.error ? result : { error: "An error occurred while loading obsolete consumption data." };
	}
	*/
	//#endregion
}
