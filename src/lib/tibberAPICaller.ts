import type * as utils from "@iobroker/adapter-core";
import { TibberQuery, type IConfig } from "tibber-api";
import type { IAddress } from "tibber-api/lib/src/models/IAddress";
import type { IConsumption } from "tibber-api/lib/src/models/IConsumption"; // obsolete data poll for consumption data
import type { IContactInfo } from "tibber-api/lib/src/models/IContactInfo";
import type { IHome } from "tibber-api/lib/src/models/IHome"; // obsolete data poll for consumption data
import type { ILegalEntity } from "tibber-api/lib/src/models/ILegalEntity";
import type { IPrice } from "tibber-api/lib/src/models/IPrice";
import { EnergyResolution } from "tibber-api/lib/src/models/enums/EnergyResolution";
import { ProjectUtils, type IHomeInfo } from "./projectUtils";

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
			//for (const index in Homes) {
			//const currentHome = Homes[index];
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
				// Home GENERAL
				void this.checkAndSetValue(`Homes.${currentHome.id}.General.Id`, currentHome.id, "ID of your home");
				void this.checkAndSetValue(`Homes.${currentHome.id}.General.Timezone`, currentHome.timeZone, "The time zone the home resides in");
				void this.checkAndSetValue(`Homes.${currentHome.id}.General.NameInApp`, currentHome.appNickname, "The nickname given to the home");
				void this.checkAndSetValue(`Homes.${currentHome.id}.General.AvatarInApp`, currentHome.appAvatar, "The chosen app avatar for the home");
				// Values: APARTMENT, ROWHOUSE, FLOORHOUSE1, FLOORHOUSE2, FLOORHOUSE3, COTTAGE, CASTLE
				void this.checkAndSetValue(`Homes.${currentHome.id}.General.Type`, currentHome.type, "The type of home.");
				// Values: APARTMENT, ROWHOUSE, HOUSE, COTTAGE
				void this.checkAndSetValue(
					`Homes.${currentHome.id}.General.PrimaryHeatingSource`,
					currentHome.primaryHeatingSource,
					"The primary form of heating in the home",
				);
				// Values: AIR2AIR_HEATPUMP, ELECTRICITY, GROUND, DISTRICT_HEATING, ELECTRIC_BOILER, AIR2WATER_HEATPUMP, OTHER
				void this.checkAndSetValueNumber(`Homes.${currentHome.id}.General.Size`, currentHome.size, "The size of the home in square meters");
				void this.checkAndSetValueNumber(
					`Homes.${currentHome.id}.General.NumberOfResidents`,
					currentHome.numberOfResidents,
					"The number of people living in the home",
				);
				void this.checkAndSetValueNumber(`Homes.${currentHome.id}.General.MainFuseSize`, currentHome.mainFuseSize, "The main fuse size");
				void this.checkAndSetValueBoolean(
					`Homes.${currentHome.id}.General.HasVentilationSystem`,
					currentHome.hasVentilationSystem,
					"Whether the home has a ventilation system",
				);

				this.fetchAddress(currentHome.id, "Address", currentHome.address);
				this.fetchLegalEntity(currentHome.id, "Owner", currentHome.owner);

				void this.checkAndSetValueBoolean(
					`Homes.${currentHome.id}.Features.RealTimeConsumptionEnabled`,
					currentHome.features.realTimeConsumptionEnabled,
					"Whether Tibber server will send consumption data by API",
				);
			}
			return homeInfoList;
		} catch (error) {
			this.adapter.log.error(this.generateErrorMessage(error, "fetching homes from Tibber API"));
			return [];
		}
	}

	/**
	 * updates current prices of all homes
	 *
	 * @param homeInfoList - homeInfo list object
	 * @param forceUpdate - OPTIONAL: force mode, without verification if existing data is fitting to current date, default: false
	 * @returns okprice - got correct data
	 */
	async updateCurrentPriceAllHomes(homeInfoList: IHomeInfo[], forceUpdate = false): Promise<boolean> {
		let okprice = true;
		for (const curHomeInfo of homeInfoList) {
			if (!curHomeInfo.PriceDataPollActive) {
				continue;
			}
			if (!(await this.updateCurrentPrice(curHomeInfo.ID, forceUpdate))) {
				okprice = false;
			} // single fault sets all false
		}
		return okprice;
	}
	/**
	 * updates current price of one home
	 *
	 * @param homeId - homeId string
	 * @param forceUpdate - OPTIONAL: force mode, without verification if existing data is fitting to current date, default: false
	 * @returns okprice - got new data
	 */
	private async updateCurrentPrice(homeId: string, forceUpdate = false): Promise<boolean> {
		try {
			if (homeId) {
				let exDateCurrent: Date | null = null;
				let pricesToday: IPrice[] = [];
				const now = new Date();
				if (!forceUpdate) {
					exDateCurrent = new Date(await this.getStateValue(`Homes.${homeId}.CurrentPrice.startsAt`));
					pricesToday = JSON.parse(await this.getStateValue(`Homes.${homeId}.PricesToday.json`));
				}
				// update remaining average
				if (Array.isArray(pricesToday) && pricesToday[2] && pricesToday[2].startsAt) {
					const exDateToday: Date = new Date(pricesToday[2].startsAt);
					if (now.getDate == exDateToday.getDate) {
						this.fetchPriceRemainingAverage(homeId, `PricesToday.averageRemaining`, pricesToday);
					}
				}

				if (!exDateCurrent || now.getHours() !== exDateCurrent.getHours() || forceUpdate) {
					const currentPrice = await this.tibberQuery.getCurrentEnergyPrice(homeId);
					await this.fetchPrice(homeId, "CurrentPrice", currentPrice);
					this.adapter.log.debug(`Got current price from tibber api: ${JSON.stringify(currentPrice)} Force: ${forceUpdate}`);
					exDateCurrent = new Date(currentPrice.startsAt);
					if (exDateCurrent && now.getHours() === exDateCurrent.getHours()) {
						return true;
					}
				} else if (now.getHours() == exDateCurrent.getHours()) {
					this.adapter.log.debug(
						`Hour (${exDateCurrent.getHours()}) of known current price is already the current hour, polling of current price from Tibber skipped`,
					);
					return true;
				} else {
					return false;
				}
			} else {
				return false;
			}
		} catch (error: unknown) {
			if (forceUpdate) {
				this.adapter.log.error(this.generateErrorMessage(error, `pull of current price`));
			} else {
				this.adapter.log.warn(this.generateErrorMessage(error, `pull of current price`));
			}
			return false;
		}
		return false;
	}

	/**
	 * updates lists of todays prices of all homes
	 *
	 * @param homeInfoList - homeInfo list object
	 * @param forceUpdate - OPTIONAL: force mode, without verification if existing data is fitting to current date, default: false
	 * @returns okprice - got correct data
	 */
	async updatePricesTodayAllHomes(homeInfoList: IHomeInfo[], forceUpdate = false): Promise<boolean> {
		let okprice = true;
		for (const curHomeInfo of homeInfoList) {
			if (!curHomeInfo.PriceDataPollActive) {
				continue;
			}
			if (!(await this.updatePricesToday(curHomeInfo.ID, forceUpdate))) {
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
	 * @param forceUpdate - OPTIONAL: force mode, without verification if existing data is fitting to current date, default: false
	 * @returns okprice - got correct data
	 */
	private async updatePricesToday(homeId: string, forceUpdate = false): Promise<boolean> {
		try {
			let exDate: Date | null = null;
			let exPricesToday: IPrice[] = [];
			if (!forceUpdate) {
				exPricesToday = JSON.parse(await this.getStateValue(`Homes.${homeId}.PricesToday.json`));
			}
			if (Array.isArray(exPricesToday) && exPricesToday[2] && exPricesToday[2].startsAt) {
				exDate = new Date(exPricesToday[2].startsAt);
			}
			const today = new Date();
			today.setHours(0, 0, 0, 0); // sets clock to 0:00
			if (!exDate || exDate <= today || forceUpdate) {
				const pricesToday = await this.tibberQuery.getTodaysEnergyPrices(homeId);
				if (!(Array.isArray(pricesToday) && pricesToday.length > 0 && pricesToday[2] && pricesToday[2].total)) {
					throw new Error(`Got invalid data structure from Tibber [you might not have a valid (or fully confirmed) contract]`);
				}
				this.adapter.log.debug(`Got prices today from tibber api: ${JSON.stringify(pricesToday)} Force: ${forceUpdate}`);
				void this.checkAndSetValue(`Homes.${homeId}.PricesToday.json`, JSON.stringify(pricesToday), "The prices today as json"); // write also it might be empty
				this.fetchPriceAverage(homeId, `PricesToday.average`, pricesToday);
				this.fetchPriceRemainingAverage(homeId, `PricesToday.averageRemaining`, pricesToday);
				this.fetchPriceMaximum(
					homeId,
					`PricesToday.maximum`,
					pricesToday.sort((a, b) => a.total - b.total),
				);
				this.fetchPriceMinimum(
					homeId,
					`PricesToday.minimum`,
					pricesToday.sort((a, b) => a.total - b.total),
				);
				//for (const i in pricesToday) {
				for (const price of pricesToday) {
					//const price = pricesToday[i];
					const hour = new Date(price.startsAt.substr(0, 19)).getHours();
					await this.fetchPrice(homeId, `PricesToday.${hour}`, price);
				}
				if (Array.isArray(pricesToday) && pricesToday[2] && pricesToday[2].startsAt) {
					void this.checkAndSetValue(
						`Homes.${homeId}.PricesToday.jsonBYpriceASC`,
						JSON.stringify(pricesToday.sort((a, b) => a.total - b.total)),
						"prices sorted by cost ascending as json",
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
						"prices sorted by cost ascending as json",
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
		return false;
	}

	/**
	 * updates lists of tomorrows prices of all homes
	 *
	 * @param homeInfoList - homeInfo list object
	 * @param forceUpdate - OPTIONAL: force mode, without verification if existing data is fitting to current date, default: false
	 * @returns okprice - got correct data
	 */
	async updatePricesTomorrowAllHomes(homeInfoList: IHomeInfo[], forceUpdate = false): Promise<boolean> {
		let okprice = true;
		for (const curHomeInfo of homeInfoList) {
			if (!curHomeInfo.PriceDataPollActive) {
				continue;
			}
			if (!(await this.updatePricesTomorrow(curHomeInfo.ID, forceUpdate))) {
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
	 * @param forceUpdate - OPTIONAL: force mode, without verification if existing data is fitting to current date, default: false
	 * @returns okprice - got new data
	 */
	private async updatePricesTomorrow(homeId: string, forceUpdate = false): Promise<boolean> {
		try {
			let exDate: Date | null = null;
			let exPricesTomorrow: IPrice[] = [];
			if (!forceUpdate) {
				exPricesTomorrow = JSON.parse(await this.getStateValue(`Homes.${homeId}.PricesTomorrow.json`));
			}
			if (Array.isArray(exPricesTomorrow) && exPricesTomorrow[2] && exPricesTomorrow[2].startsAt) {
				exDate = new Date(exPricesTomorrow[2].startsAt);
			}
			const morgen = new Date();
			morgen.setDate(morgen.getDate() + 1);
			morgen.setHours(0, 0, 0, 0); // sets clock to 0:00
			if (!exDate || exDate < morgen || forceUpdate) {
				const pricesTomorrow = await this.tibberQuery.getTomorrowsEnergyPrices(homeId);
				this.adapter.log.debug(`Got prices tomorrow from tibber api: ${JSON.stringify(pricesTomorrow)} Force: ${forceUpdate}`);
				void this.checkAndSetValue(`Homes.${homeId}.PricesTomorrow.json`, JSON.stringify(pricesTomorrow), "The prices tomorrow as json"); // write also it might be empty
				if (pricesTomorrow.length === 0) {
					// pricing not known, before about 13:00 - delete all the states
					this.adapter.log.debug(`Emptying prices tomorrow and average cause existing ones are obsolete...`);
					for (let hour = 0; hour < 24; hour++) {
						this.emptyingPrice(homeId, `PricesTomorrow.${hour}`);
					}
					this.emptyingPriceAverage(homeId, `PricesTomorrow.average`);
					this.emptyingPriceMaximum(homeId, `PricesTomorrow.maximum`);
					this.emptyingPriceMinimum(homeId, `PricesTomorrow.minimum`);
					void this.checkAndSetValue(
						`Homes.${homeId}.PricesTomorrow.jsonBYpriceASC`,
						JSON.stringify(pricesTomorrow),
						"prices sorted by cost ascending as json",
					);
					return false;
				} else if (Array.isArray(pricesTomorrow)) {
					// pricing known, after about 13:00 - write the states
					//for (const i in pricesTomorrow) {
					for (const price of pricesTomorrow) {
						//const price = pricesTomorrow[i];
						const hour = new Date(price.startsAt.substr(0, 19)).getHours();
						await this.fetchPrice(homeId, `PricesTomorrow.${hour}`, price);
					}
					this.fetchPriceAverage(homeId, `PricesTomorrow.average`, pricesTomorrow);
					this.fetchPriceMaximum(
						homeId,
						`PricesTomorrow.maximum`,
						pricesTomorrow.sort((a, b) => a.total - b.total),
					);
					this.fetchPriceMinimum(
						homeId,
						`PricesTomorrow.minimum`,
						pricesTomorrow.sort((a, b) => a.total - b.total),
					);
					void this.checkAndSetValue(
						`Homes.${homeId}.PricesTomorrow.jsonBYpriceASC`,
						JSON.stringify(pricesTomorrow.sort((a, b) => a.total - b.total)),
						"prices sorted by cost ascending as json",
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
					{ type: EnergyResolution.HOURLY, state: `jsonHourly`, numCons: home.numberConsHourly, description: `hour` },
					{ type: EnergyResolution.DAILY, state: `jsonDaily`, numCons: home.numberConsDaily, description: `day` },
					{ type: EnergyResolution.WEEKLY, state: `jsonWeekly`, numCons: home.numberConsWeekly, description: `week` },
					{ type: EnergyResolution.MONTHLY, state: `jsonMonthly`, numCons: home.numberConsMonthly, description: `month` },
					{ type: EnergyResolution.ANNUAL, state: `jsonAnnual`, numCons: home.numberConsAnnual, description: `year` },
				];
				for (const { type, state, numCons, description } of resolutions) {
					if (numCons && numCons > 0) {
						let consumption: IConsumption[];
						if (this.adapter.config.UseObsoleteStats) {
							consumption = await this.getConsumptionObs(type, numCons, homeID);
						} else {
							consumption = await this.tibberQuery.getConsumption(type, numCons, homeID);
						}
						void this.checkAndSetValue(
							`Homes.${homeID}.Consumption.${state}`,
							JSON.stringify(consumption),
							`Historical consumption last ${description}s as json)`,
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
		await this.checkAndSetValueNumber(`Homes.${homeId}.${objectDestination}.total`, price.total, "Total price (energy + taxes)");
		void this.checkAndSetValueNumber(`Homes.${homeId}.${objectDestination}.energy`, price.energy, "Spotmarket energy price");
		void this.checkAndSetValueNumber(`Homes.${homeId}.${objectDestination}.tax`, price.tax, "Tax part of the price (energy, tax, VAT...)");
		void this.checkAndSetValue(`Homes.${homeId}.${objectDestination}.startsAt`, price.startsAt, "Start time of the price");
		//void this.checkAndSetValue(`Homes.${homeId}.${objectDestination}.currency`, price.currency, "The price currency");
		void this.checkAndSetValue(`Homes.${homeId}.${objectDestination}.level`, price.level, "Price level compared to recent price values");
	}

	private fetchPriceAverage(homeId: string, objectDestination: string, price: IPrice[]): void {
		const totalSum = price.reduce((sum, item) => {
			if (item && typeof item.total === "number") {
				return sum + item.total;
			}
			return sum;
		}, 0);
		void this.checkAndSetValueNumber(
			`Homes.${homeId}.${objectDestination}.total`,
			Math.round(1000 * (totalSum / price.length)) / 1000,
			"Todays total price average",
		);
		const energySum = price.reduce((sum, item) => sum + item.energy, 0);
		void this.checkAndSetValueNumber(
			`Homes.${homeId}.${objectDestination}.energy`,
			Math.round(1000 * (energySum / price.length)) / 1000,
			"Todays average spotmarket price",
		);
		const taxSum = price.reduce((sum, item) => sum + item.tax, 0);
		void this.checkAndSetValueNumber(
			`Homes.${homeId}.${objectDestination}.tax`,
			Math.round(1000 * (taxSum / price.length)) / 1000,
			"Todays average tax price",
		);
	}
	private fetchPriceRemainingAverage(homeId: string, objectDestination: string, price: IPrice[]): void {
		const now = new Date(); // current time
		const currentHour = now.getHours();
		// filter to prices of current and later hours
		const filteredPrices = price.filter(item => {
			const itemHour = new Date(item.startsAt).getHours();
			return itemHour >= currentHour;
		});

		const remainingTotalSum = filteredPrices.reduce((sum, item) => {
			if (item && typeof item.total === "number") {
				return sum + item.total;
			}
			return sum;
		}, 0);
		void this.checkAndSetValueNumber(
			`Homes.${homeId}.${objectDestination}.total`,
			Math.round(1000 * (remainingTotalSum / filteredPrices.length)) / 1000,
			"Todays total price remaining average",
		);
		const remainingEnergySum = filteredPrices.reduce((sum, item) => sum + item.energy, 0);
		void this.checkAndSetValueNumber(
			`Homes.${homeId}.${objectDestination}.energy`,
			Math.round(1000 * (remainingEnergySum / filteredPrices.length)) / 1000,
			"Todays remaining average spot market price",
		);
		const remainingTaxSum = filteredPrices.reduce((sum, item) => sum + item.tax, 0);
		void this.checkAndSetValueNumber(
			`Homes.${homeId}.${objectDestination}.tax`,
			Math.round(1000 * (remainingTaxSum / filteredPrices.length)) / 1000,
			"Todays remaining average tax price",
		);
	}

	private fetchPriceMaximum(homeId: string, objectDestination: string, price: IPrice[]): void {
		if (!price || typeof price[23].total !== "number") {
			// possible exit 1.4.3 - Sentry discovered possible error in 1.4.1
			// return;
		}
		void this.checkAndSetValueNumber(`Homes.${homeId}.${objectDestination}.total`, Math.round(1000 * price[23].total) / 1000, "Todays total price maximum");
		void this.checkAndSetValueNumber(
			`Homes.${homeId}.${objectDestination}.energy`,
			Math.round(1000 * price[23].energy) / 1000,
			"Todays spotmarket price at total price maximum",
		);
		void this.checkAndSetValueNumber(
			`Homes.${homeId}.${objectDestination}.tax`,
			Math.round(1000 * price[23].tax) / 1000,
			"Todays tax price at total price maximum",
		);
		void this.checkAndSetValue(`Homes.${homeId}.${objectDestination}.level`, price[23].level, "Price level compared to recent price values");
		void this.checkAndSetValue(`Homes.${homeId}.${objectDestination}.startsAt`, price[23].startsAt, "Start time of the price maximum");
	}
	private fetchPriceMinimum(homeId: string, objectDestination: string, price: IPrice[]): void {
		void this.checkAndSetValueNumber(`Homes.${homeId}.${objectDestination}.total`, Math.round(1000 * price[0].total) / 1000, "Todays total price minimum");
		void this.checkAndSetValueNumber(
			`Homes.${homeId}.${objectDestination}.energy`,
			Math.round(1000 * price[0].energy) / 1000,
			"Todays spotmarket price at total price minimum",
		);
		void this.checkAndSetValueNumber(
			`Homes.${homeId}.${objectDestination}.tax`,
			Math.round(1000 * price[0].tax) / 1000,
			"Todays tax price at total price minimum",
		);
		void this.checkAndSetValue(`Homes.${homeId}.${objectDestination}.level`, price[0].level, "Price level compared to recent price values");
		void this.checkAndSetValue(`Homes.${homeId}.${objectDestination}.startsAt`, price[0].startsAt, "Start time of the price minimum");
	}

	private emptyingPrice(homeId: string, objectDestination: string): void {
		void this.checkAndSetValueNumber(`Homes.${homeId}.${objectDestination}.total`, 0, "The total price (energy + taxes)");
		void this.checkAndSetValueNumber(`Homes.${homeId}.${objectDestination}.energy`, 0, "Spotmarket price");
		void this.checkAndSetValueNumber(`Homes.${homeId}.${objectDestination}.tax`, 0, "Tax part of the price (energy tax, VAT, etc.)");
		void this.checkAndSetValue(`Homes.${homeId}.${objectDestination}.level`, "Not known now", "Price level compared to recent price values");
	}
	private emptyingPriceAverage(homeId: string, objectDestination: string): void {
		void this.checkAndSetValueNumber(`Homes.${homeId}.${objectDestination}.total`, 0, "The todays total price average");
		void this.checkAndSetValueNumber(`Homes.${homeId}.${objectDestination}.energy`, 0, "The todays avarage spotmarket price");
		void this.checkAndSetValueNumber(`Homes.${homeId}.${objectDestination}.tax`, 0, "The todays avarage tax price");
	}
	private emptyingPriceMaximum(homeId: string, objectDestination: string): void {
		void this.checkAndSetValueNumber(`Homes.${homeId}.${objectDestination}.total`, 0, "Todays total price maximum");
		void this.checkAndSetValueNumber(`Homes.${homeId}.${objectDestination}.energy`, 0, "Todays spotmarket price at total price maximum");
		void this.checkAndSetValueNumber(`Homes.${homeId}.${objectDestination}.tax`, 0, "Todays tax price at total price maximum");
		void this.checkAndSetValue(`Homes.${homeId}.${objectDestination}.level`, "Not known now", "Price level compared to recent price values");
		void this.checkAndSetValue(`Homes.${homeId}.${objectDestination}.startsAt`, "Not known now", "Start time of the price maximum");
	}
	private emptyingPriceMinimum(homeId: string, objectDestination: string): void {
		void this.checkAndSetValueNumber(`Homes.${homeId}.${objectDestination}.total`, 0, "Todays total price minimum");
		void this.checkAndSetValueNumber(`Homes.${homeId}.${objectDestination}.energy`, 0, "Todays spotmarket price at total price minimum");
		void this.checkAndSetValueNumber(`Homes.${homeId}.${objectDestination}.tax`, 0, "Todays tax price at total price minimum");
		void this.checkAndSetValue(`Homes.${homeId}.${objectDestination}.level`, "Not known now", "Price level compared to recent price values");
		void this.checkAndSetValue(`Homes.${homeId}.${objectDestination}.startsAt`, "Not known now", "Start time of the price minimum");
	}

	private fetchLegalEntity(homeId: string, objectDestination: string, legalEntity: ILegalEntity): void {
		void this.checkAndSetValue(`Homes.${homeId}.${objectDestination}.Id`, legalEntity.id);
		void this.checkAndSetValue(`Homes.${homeId}.${objectDestination}.FirstName`, legalEntity.firstName);
		void this.checkAndSetValueBoolean(`Homes.${homeId}.${objectDestination}.IsCompany`, legalEntity.isCompany);
		void this.checkAndSetValue(`Homes.${homeId}.${objectDestination}.Name`, legalEntity.name);
		void this.checkAndSetValue(`Homes.${homeId}.${objectDestination}.MiddleName`, legalEntity.middleName);
		void this.checkAndSetValue(`Homes.${homeId}.${objectDestination}.LastName`, legalEntity.lastName);
		void this.checkAndSetValue(`Homes.${homeId}.${objectDestination}.OrganizationNo`, legalEntity.organizationNo);
		void this.checkAndSetValue(`Homes.${homeId}.${objectDestination}.Language`, legalEntity.language);
		if (legalEntity.contactInfo) {
			this.fetchContactInfo(homeId, `${objectDestination}.ContactInfo`, legalEntity.contactInfo);
		}
		if (legalEntity.address) {
			this.fetchAddress(homeId, `${objectDestination}.Address`, legalEntity.address);
		}
	}
	private fetchContactInfo(homeId: string, objectDestination: string, contactInfo: IContactInfo): void {
		void this.checkAndSetValue(`Homes.${homeId}.${objectDestination}.Email`, contactInfo.email);
		void this.checkAndSetValue(`Homes.${homeId}.${objectDestination}.Mobile`, contactInfo.mobile);
	}
	private fetchAddress(homeId: string, objectDestination: string, address: IAddress): void {
		void this.checkAndSetValue(`Homes.${homeId}.${objectDestination}.address1`, address.address1);
		void this.checkAndSetValue(`Homes.${homeId}.${objectDestination}.address2`, address.address2);
		void this.checkAndSetValue(`Homes.${homeId}.${objectDestination}.address3`, address.address3);
		void this.checkAndSetValue(`Homes.${homeId}.${objectDestination}.City`, address.city);
		void this.checkAndSetValue(`Homes.${homeId}.${objectDestination}.PostalCode`, address.postalCode);
		void this.checkAndSetValue(`Homes.${homeId}.${objectDestination}.Country`, address.country);
		void this.checkAndSetValue(`Homes.${homeId}.${objectDestination}.Latitude`, address.latitude);
		void this.checkAndSetValue(`Homes.${homeId}.${objectDestination}.Longitude`, address.longitude);
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
		if (result && result.viewer && result.viewer.home) {
			const home: IHome = result.viewer.home;
			return Object.assign([] as IConsumption[], home.consumption ? home.consumption.nodes : []);
		}
		return result && result.error ? result : { error: "An error occurred while loading obsolete consumption data." };
	}
	//#endregion
}
