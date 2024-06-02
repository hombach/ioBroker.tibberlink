import * as utils from "@iobroker/adapter-core";
import { IConfig, TibberQuery } from "tibber-api";
import { IAddress } from "tibber-api/lib/src/models/IAddress";
import { IConsumption } from "tibber-api/lib/src/models/IConsumption"; // obsolete data poll for consumption data
import { IContactInfo } from "tibber-api/lib/src/models/IContactInfo";
import { IHome } from "tibber-api/lib/src/models/IHome"; // obsolete data poll for consumption data
import { ILegalEntity } from "tibber-api/lib/src/models/ILegalEntity";
import { IPrice } from "tibber-api/lib/src/models/IPrice";
import { EnergyResolution } from "tibber-api/lib/src/models/enums/EnergyResolution";
import { IHomeInfo, TibberHelper } from "./tibberHelper";

export class TibberAPICaller extends TibberHelper {
	tibberConfig: IConfig;
	tibberQuery: TibberQuery;

	constructor(tibberConfig: IConfig, adapter: utils.AdapterInstance) {
		super(adapter);
		this.tibberConfig = tibberConfig;
		this.tibberQuery = new TibberQuery(this.tibberConfig, 60000);
	}

	async updateHomesFromAPI(): Promise<IHomeInfo[]> {
		try {
			const Homes = await this.tibberQuery.getHomes();
			this.adapter.log.debug(`Got homes from tibber api: ${JSON.stringify(Homes)}`);
			const homeInfoList: IHomeInfo[] = [];
			for (const index in Homes) {
				const currentHome = Homes[index];
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
				this.checkAndSetValue(this.getStatePrefix(currentHome.id, "General", "Id"), currentHome.id, "ID of your home");
				this.checkAndSetValue(this.getStatePrefix(currentHome.id, "General", "Timezone"), currentHome.timeZone, "The time zone the home resides in");
				this.checkAndSetValue(this.getStatePrefix(currentHome.id, "General", "NameInApp"), currentHome.appNickname, "The nickname given to the home");
				this.checkAndSetValue(
					this.getStatePrefix(currentHome.id, "General", "AvatarInApp"),
					currentHome.appAvatar,
					"The chosen app avatar for the home",
				);
				// Values: APARTMENT, ROWHOUSE, FLOORHOUSE1, FLOORHOUSE2, FLOORHOUSE3, COTTAGE, CASTLE
				this.checkAndSetValue(this.getStatePrefix(currentHome.id, "General", "Type"), currentHome.type, "The type of home.");
				// Values: APARTMENT, ROWHOUSE, HOUSE, COTTAGE
				this.checkAndSetValue(
					this.getStatePrefix(currentHome.id, "General", "PrimaryHeatingSource"),
					currentHome.primaryHeatingSource,
					"The primary form of heating in the home",
				);
				// Values: AIR2AIR_HEATPUMP, ELECTRICITY, GROUND, DISTRICT_HEATING, ELECTRIC_BOILER, AIR2WATER_HEATPUMP, OTHER
				this.checkAndSetValueNumber(this.getStatePrefix(currentHome.id, "General", "Size"), currentHome.size, "The size of the home in square meters");
				this.checkAndSetValueNumber(
					this.getStatePrefix(currentHome.id, "General", "NumberOfResidents"),
					currentHome.numberOfResidents,
					"The number of people living in the home",
				);
				this.checkAndSetValueNumber(this.getStatePrefix(currentHome.id, "General", "MainFuseSize"), currentHome.mainFuseSize, "The main fuse size");
				this.checkAndSetValueBoolean(
					this.getStatePrefix(currentHome.id, "General", "HasVentilationSystem"),
					currentHome.hasVentilationSystem,
					"Whether the home has a ventilation system",
				);

				this.fetchAddress(currentHome.id, "Address", currentHome.address);
				this.fetchLegalEntity(currentHome.id, "Owner", currentHome.owner);

				this.checkAndSetValueBoolean(
					this.getStatePrefix(currentHome.id, "Features", "RealTimeConsumptionEnabled"),
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
	async updateCurrentPriceAllHomes(homeInfoList: IHomeInfo[], forceUpdate: boolean = false): Promise<boolean> {
		let okprice = true;
		for (const curHomeInfo of homeInfoList) {
			if (!curHomeInfo.PriceDataPollActive) continue;
			if (!(await this.updateCurrentPrice(curHomeInfo.ID, forceUpdate))) okprice = false; // single fault sets all false
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
	private async updateCurrentPrice(homeId: string, forceUpdate: boolean = false): Promise<boolean> {
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
					if (now.getDate == exDateToday.getDate) this.fetchPriceRemainingAverage(homeId, `PricesToday.averageRemaining`, pricesToday);
				}

				if (!exDateCurrent || now.getHours() !== exDateCurrent.getHours() || forceUpdate) {
					const currentPrice = await this.tibberQuery.getCurrentEnergyPrice(homeId);
					await this.fetchPrice(homeId, "CurrentPrice", currentPrice);
					this.adapter.log.debug(`Got current price from tibber api: ${JSON.stringify(currentPrice)} Force: ${forceUpdate}`);
					exDateCurrent = new Date(currentPrice.startsAt);
					if (exDateCurrent && now.getHours() === exDateCurrent.getHours()) {
						return true;
					}
				} else if (now.getHours() !== exDateCurrent.getHours()) {
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
		} catch (error: any) {
			if (forceUpdate) this.adapter.log.error(this.generateErrorMessage(error, `pull of current price`));
			else this.adapter.log.warn(this.generateErrorMessage(error, `pull of current price`));
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
	async updatePricesTodayAllHomes(homeInfoList: IHomeInfo[], forceUpdate: boolean = false): Promise<boolean> {
		let okprice = true;
		for (const curHomeInfo of homeInfoList) {
			if (!curHomeInfo.PriceDataPollActive) continue;
			if (!(await this.updatePricesToday(curHomeInfo.ID, forceUpdate))) {
				okprice = false;
			} else {
				const now = new Date();
				this.checkAndSetValue(this.getStatePrefix(curHomeInfo.ID, "PricesToday", "lastUpdate"), now.toString(), `last update of prices today`);
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
	private async updatePricesToday(homeId: string, forceUpdate: boolean = false): Promise<boolean> {
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
				// POTENTIAL 2.3.1 better error logging
				if (!(Array.isArray(pricesToday) && pricesToday.length > 0 && pricesToday[2] && pricesToday[2].total)) {
					throw new Error(`Got invalid data structure from Tibber`);
				}
				// WIP
				this.adapter.log.debug(`Got prices today from tibber api: ${JSON.stringify(pricesToday)} Force: ${forceUpdate}`);
				this.checkAndSetValue(this.getStatePrefix(homeId, "PricesToday", "json"), JSON.stringify(pricesToday), "The prices today as json"); // write also it might be empty
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
				for (const i in pricesToday) {
					const price = pricesToday[i];
					const hour = new Date(price.startsAt.substr(0, 19)).getHours();
					await this.fetchPrice(homeId, `PricesToday.${hour}`, price);
				}
				if (Array.isArray(pricesToday) && pricesToday[2] && pricesToday[2].startsAt) {
					this.checkAndSetValue(
						this.getStatePrefix(homeId, "PricesToday", "jsonBYpriceASC"),
						JSON.stringify(pricesToday.sort((a, b) => a.total - b.total)),
						"prices sorted by cost ascending as json",
					);
					exDate = new Date(pricesToday[2].startsAt);
					if (exDate && exDate >= today) {
						return true;
					}
				} else {
					// Handle the case when pricesToday is not an array, it's empty!, so just don't sort and write
					this.checkAndSetValue(
						this.getStatePrefix(homeId, "PricesToday", "jsonBYpriceASC"),
						JSON.stringify(pricesToday),
						"prices sorted by cost ascending as json",
					);
					return false;
				}
			} else {
				this.adapter.log.debug(`Existing date (${exDate}) of price info is already the today date, polling of prices today from Tibber skipped`);
				return true;
			}
		} catch (error: any) {
			if (forceUpdate) this.adapter.log.error(this.generateErrorMessage(error, `force pull of prices today`));
			else this.adapter.log.warn(this.generateErrorMessage(error, `pull of prices today`));
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
	async updatePricesTomorrowAllHomes(homeInfoList: IHomeInfo[], forceUpdate: boolean = false): Promise<boolean> {
		let okprice = true;
		for (const curHomeInfo of homeInfoList) {
			if (!curHomeInfo.PriceDataPollActive) continue;
			if (!(await this.updatePricesTomorrow(curHomeInfo.ID, forceUpdate))) {
				okprice = false; // single fault sets all false
			} else {
				const now = new Date();
				this.checkAndSetValue(this.getStatePrefix(curHomeInfo.ID, "PricesTomorrow", "lastUpdate"), now.toString(), `last update of prices tomorrow`);
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
	private async updatePricesTomorrow(homeId: string, forceUpdate: boolean = false): Promise<boolean> {
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
				this.checkAndSetValue(this.getStatePrefix(homeId, "PricesTomorrow", "json"), JSON.stringify(pricesTomorrow), "The prices tomorrow as json"); // write also it might be empty
				if (pricesTomorrow.length === 0) {
					// pricing not known, before about 13:00 - delete all the states
					this.adapter.log.debug(`Emptying prices tomorrow and average cause existing ones are obsolete...`);
					for (let hour = 0; hour < 24; hour++) {
						this.emptyingPrice(homeId, `PricesTomorrow.${hour}`);
					}
					this.emptyingPriceAverage(homeId, `PricesTomorrow.average`);
					this.emptyingPriceMaximum(homeId, `PricesTomorrow.maximum`);
					this.emptyingPriceMinimum(homeId, `PricesTomorrow.minimum`);
					this.checkAndSetValue(
						this.getStatePrefix(homeId, "PricesTomorrow", "jsonBYpriceASC"),
						JSON.stringify(pricesTomorrow),
						"prices sorted by cost ascending as json",
					);
					return false;
				} else if (Array.isArray(pricesTomorrow)) {
					// pricing known, after about 13:00 - write the states
					for (const i in pricesTomorrow) {
						const price = pricesTomorrow[i];
						const hour = new Date(price.startsAt.substr(0, 19)).getHours();
						await this.fetchPrice(homeId, "PricesTomorrow." + hour, price);
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
					this.checkAndSetValue(
						this.getStatePrefix(homeId, "PricesTomorrow", "jsonBYpriceASC"),
						JSON.stringify(pricesTomorrow.sort((a, b) => a.total - b.total)),
						"prices sorted by cost ascending as json",
					);
					exDate = new Date(pricesTomorrow[2].startsAt);
					if (exDate && exDate >= morgen) {
						return true;
					} else {
						return false;
					}
				}
			} else if (exDate && exDate >= morgen) {
				this.adapter.log.debug(`Existing date (${exDate}) of price info is already the tomorrow date, polling of prices tomorrow from Tibber skipped`);
				return true;
			}
			return false;
		} catch (error: any) {
			if (forceUpdate) this.adapter.log.error(this.generateErrorMessage(error, `force pull of prices tomorrow`));
			else this.adapter.log.warn(this.generateErrorMessage(error, `pull of prices tomorrow`));
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
				if (!home.statsActive || !home.homeID) continue;
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
						//WiP #405 change call to get also obsolete data
						//const consumption = await this.tibberQuery.getConsumption(type, numCons, homeID);
						const consumption = await this.getConsumptionObs(type, numCons, homeID);
						//WiP #405
						this.checkAndSetValue(
							this.getStatePrefix(homeID, `Consumption`, state),
							JSON.stringify(consumption),
							`Historical consumption last ${description}s as json)`,
						);
					} else {
						this.checkAndSetValue(this.getStatePrefix(homeID, `Consumption`, state), `[]`);
					}
				}
				this.adapter.log.debug(`Got all consumption data from Tibber Server for home: ${homeID}`);
			}
		} catch (error: any) {
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
		await this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "total"), price.total, "Total price (energy + taxes)");
		this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "energy"), price.energy, "Spotmarket energy price");
		this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "tax"), price.tax, "Tax part of the price (energy, tax, VAT...)");
		this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "startsAt"), price.startsAt, "Start time of the price");
		//this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "currency"), price.currency, "The price currency");
		this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "level"), price.level, "Price level compared to recent price values");
	}

	private fetchPriceAverage(homeId: string, objectDestination: string, price: IPrice[]): void {
		const totalSum = price.reduce((sum, item) => {
			if (item && typeof item.total === "number") {
				return sum + item.total;
			}
			return sum;
		}, 0);
		this.checkAndSetValueNumber(
			this.getStatePrefix(homeId, objectDestination, "total"),
			Math.round(1000 * (totalSum / price.length)) / 1000,
			"Todays total price average",
		);
		const energySum = price.reduce((sum, item) => sum + item.energy, 0);
		this.checkAndSetValueNumber(
			this.getStatePrefix(homeId, objectDestination, "energy"),
			Math.round(1000 * (energySum / price.length)) / 1000,
			"Todays average spotmarket price",
		);
		const taxSum = price.reduce((sum, item) => sum + item.tax, 0);
		this.checkAndSetValueNumber(
			this.getStatePrefix(homeId, objectDestination, "tax"),
			Math.round(1000 * (taxSum / price.length)) / 1000,
			"Todays average tax price",
		);
	}
	private fetchPriceRemainingAverage(homeId: string, objectDestination: string, price: IPrice[]): void {
		const now = new Date(); // current time
		const currentHour = now.getHours();
		// filter to prices of current and later hours
		const filteredPrices = price.filter((item) => {
			const itemHour = new Date(item.startsAt).getHours();
			return itemHour >= currentHour;
		});

		const remainingTotalSum = filteredPrices.reduce((sum, item) => {
			if (item && typeof item.total === "number") {
				return sum + item.total;
			}
			return sum;
		}, 0);
		this.checkAndSetValueNumber(
			this.getStatePrefix(homeId, objectDestination, "total"),
			Math.round(1000 * (remainingTotalSum / filteredPrices.length)) / 1000,
			"Todays total price remaining average",
		);
		const remainingEnergySum = filteredPrices.reduce((sum, item) => sum + item.energy, 0);
		this.checkAndSetValueNumber(
			this.getStatePrefix(homeId, objectDestination, "energy"),
			Math.round(1000 * (remainingEnergySum / filteredPrices.length)) / 1000,
			"Todays remaining average spot market price",
		);
		const remainingTaxSum = filteredPrices.reduce((sum, item) => sum + item.tax, 0);
		this.checkAndSetValueNumber(
			this.getStatePrefix(homeId, objectDestination, "tax"),
			Math.round(1000 * (remainingTaxSum / filteredPrices.length)) / 1000,
			"Todays remaining average tax price",
		);
	}

	private fetchPriceMaximum(homeId: string, objectDestination: string, price: IPrice[]): void {
		if (!price || typeof price[23].total !== "number") {
			// possible exit 1.4.3 - Sentry discovered possible error in 1.4.1
			// return;
		}
		this.checkAndSetValueNumber(
			this.getStatePrefix(homeId, objectDestination, "total"),
			Math.round(1000 * price[23].total) / 1000,
			"Todays total price maximum",
		);
		this.checkAndSetValueNumber(
			this.getStatePrefix(homeId, objectDestination, "energy"),
			Math.round(1000 * price[23].energy) / 1000,
			"Todays spotmarket price at total price maximum",
		);
		this.checkAndSetValueNumber(
			this.getStatePrefix(homeId, objectDestination, "tax"),
			Math.round(1000 * price[23].tax) / 1000,
			"Todays tax price at total price maximum",
		);
		this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "level"), price[23].level, "Price level compared to recent price values");
		this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "startsAt"), price[23].startsAt, "Start time of the price maximum");
	}
	private fetchPriceMinimum(homeId: string, objectDestination: string, price: IPrice[]): void {
		this.checkAndSetValueNumber(
			this.getStatePrefix(homeId, objectDestination, "total"),
			Math.round(1000 * price[0].total) / 1000,
			"Todays total price minimum",
		);
		this.checkAndSetValueNumber(
			this.getStatePrefix(homeId, objectDestination, "energy"),
			Math.round(1000 * price[0].energy) / 1000,
			"Todays spotmarket price at total price minimum",
		);
		this.checkAndSetValueNumber(
			this.getStatePrefix(homeId, objectDestination, "tax"),
			Math.round(1000 * price[0].tax) / 1000,
			"Todays tax price at total price minimum",
		);
		this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "level"), price[0].level, "Price level compared to recent price values");
		this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "startsAt"), price[0].startsAt, "Start time of the price minimum");
	}

	private emptyingPrice(homeId: string, objectDestination: string): void {
		this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "total"), 0, "The total price (energy + taxes)");
		this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "energy"), 0, "Spotmarket price");
		this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "tax"), 0, "Tax part of the price (energy tax, VAT, etc.)");
		this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "level"), "Not known now", "Price level compared to recent price values");
	}
	private emptyingPriceAverage(homeId: string, objectDestination: string): void {
		this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "total"), 0, "The todays total price average");
		this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "energy"), 0, "The todays avarage spotmarket price");
		this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "tax"), 0, "The todays avarage tax price");
	}
	private emptyingPriceMaximum(homeId: string, objectDestination: string): void {
		this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "total"), 0, "Todays total price maximum");
		this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "energy"), 0, "Todays spotmarket price at total price maximum");
		this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "tax"), 0, "Todays tax price at total price maximum");
		this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "level"), "Not known now", "Price level compared to recent price values");
		this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "startsAt"), "Not known now", "Start time of the price maximum");
	}
	private emptyingPriceMinimum(homeId: string, objectDestination: string): void {
		this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "total"), 0, "Todays total price minimum");
		this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "energy"), 0, "Todays spotmarket price at total price minimum");
		this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "tax"), 0, "Todays tax price at total price minimum");
		this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "level"), "Not known now", "Price level compared to recent price values");
		this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "startsAt"), "Not known now", "Start time of the price minimum");
	}

	private fetchLegalEntity(homeId: string, objectDestination: string, legalEntity: ILegalEntity): void {
		this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "Id"), legalEntity.id);
		this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "FirstName"), legalEntity.firstName);
		this.checkAndSetValueBoolean(this.getStatePrefix(homeId, objectDestination, "IsCompany"), legalEntity.isCompany);
		this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "Name"), legalEntity.name);
		this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "MiddleName"), legalEntity.middleName);
		this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "LastName"), legalEntity.lastName);
		this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "OrganizationNo"), legalEntity.organizationNo);
		this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "Language"), legalEntity.language);
		if (legalEntity.contactInfo) {
			this.fetchContactInfo(homeId, objectDestination + ".ContactInfo", legalEntity.contactInfo);
		}
		if (legalEntity.address) {
			this.fetchAddress(homeId, objectDestination + ".Address", legalEntity.address);
		}
	}
	private fetchContactInfo(homeId: string, objectDestination: string, contactInfo: IContactInfo): void {
		this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "Email"), contactInfo.email);
		this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "Mobile"), contactInfo.mobile);
	}
	private fetchAddress(homeId: string, objectDestination: string, address: IAddress): void {
		this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "address1"), address.address1);
		this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "address2"), address.address2);
		this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "address3"), address.address3);
		this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "City"), address.city);
		this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "PostalCode"), address.postalCode);
		this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "Country"), address.country);
		this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "Latitude"), address.latitude);
		this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "Longitude"), address.longitude);
	}

	//#region *** obsolete data poll for consumption data #405 ***

	/**
	 * Get energy consumption for one or more homes.
	 * Returns an array of IConsumption
	 * @param resolution EnergyResolution. Valid values: HOURLY, DAILY, WEEKLY, MONTHLY, ANNUAL
	 * @param lastCount Return the last number of records
	 * @param homeId Tibber home ID.
	 * @return Array of IConsumption
	 */
	async getConsumptionObs(resolution: EnergyResolution, lastCount: number, homeId: string): Promise<IConsumption[]> {
		const gqlHomesConsumptionObs = `
			query getConsumption($resolution: EnergyResolution! $lastCount:Int!){
				viewer {
					homes {
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

		const result = await this.tibberQuery.query(gqlHomesConsumptionObs, variables);
		if (result && result.viewer && result.viewer.home) {
			const home: IHome = result.viewer.home;
			return Object.assign([] as IConsumption[], home.consumption ? home.consumption.nodes : []);
		}
		return result && result.error ? result : { error: "An error occurred while loading obsolete consumption data." };
	}
	//#endregion
}
