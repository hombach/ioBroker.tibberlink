import * as utils from "@iobroker/adapter-core";
import { IConfig, TibberQuery } from "tibber-api";
import { IAddress } from "tibber-api/lib/src/models/IAddress";
import { IContactInfo } from "tibber-api/lib/src/models/IContactInfo";
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
	 * @param forceUpdate - force mode, without verification if existing data is fitting to current date
	 * @returns okprice - got correct data
	 */
	async updateCurrentPriceAllHomes(homeInfoList: IHomeInfo[], forceUpdate?: boolean): Promise<boolean> {
		let okprice = true;
		for (const index in homeInfoList) {
			if (!(await this.updateCurrentPrice(homeInfoList[index].ID, forceUpdate))) okprice = false;
		}
		return okprice;
	}
	/**
	 * updates current price of one home
	 *
	 * @param homeId - homeId string
	 * @param forceUpdate - force mode, without verification if existing data is fitting to current date
	 * @returns newPrice - got new data
	 */
	async updateCurrentPrice(homeId: string, forceUpdate?: boolean): Promise<boolean> {
		//CHANGE!!
		try {
			if (homeId) {
				let exDate: Date | null = null;
				exDate = new Date(await this.getStateValue(`Homes.${homeId}.CurrentPrice.startsAt`));
				const now = new Date();
				if (!exDate || now.getHours() !== exDate.getHours() || forceUpdate) {
					const currentPrice = await this.tibberQuery.getCurrentEnergyPrice(homeId);
					await this.fetchPrice(homeId, "CurrentPrice", currentPrice);
					this.adapter.log.debug(`Got current price from tibber api: ${JSON.stringify(currentPrice)}`);
					return true;
				} else if (now.getHours() !== exDate.getHours()) {
					this.adapter.log.debug(
						`Hour (${exDate.getHours()}) of known current price is already the current hour, polling of current price from Tibber skipped`,
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
	}

	/**
	 * updates lists of todays prices of all homes
	 *
	 * @param homeInfoList - homeInfo list object
	 * @param forceUpdate - force mode, without verification if existing data is fitting to current date
	 * @returns okprice - got correct data
	 */
	async updatePricesTodayAllHomes(homeInfoList: IHomeInfo[], forceUpdate?: boolean): Promise<boolean> {
		let okprice = true;
		for (const index in homeInfoList) {
			if (!(await this.updatePricesToday(homeInfoList[index].ID, forceUpdate))) okprice = false;
		}
		return okprice;
	}
	/**
	 * updates list of todays prices of one home
	 *
	 * @param homeId - homeId string
	 * @param forceUpdate - force mode, without verification if existing data is fitting to current date
	 * @returns okprice - got correct data
	 */
	async updatePricesToday(homeId: string, forceUpdate?: boolean): Promise<boolean> {
		try {
			let exDate: Date | null = null;
			const exJSON = await this.getStateValue(`Homes.${homeId}.PricesToday.json`);
			const exPricesToday: IPrice[] = JSON.parse(exJSON);
			if (Array.isArray(exPricesToday) && exPricesToday[2] && exPricesToday[2].startsAt) {
				exDate = new Date(exPricesToday[2].startsAt);
			}
			const today = new Date();
			today.setHours(0, 0, 0, 0); // sets clock to 0:00
			if (!exDate || exDate <= today || forceUpdate) {
				const pricesToday = await this.tibberQuery.getTodaysEnergyPrices(homeId);
				this.adapter.log.debug(`Got prices today from tibber api: ${JSON.stringify(pricesToday)}`);
				if (Array.isArray(pricesToday) && pricesToday[2] && pricesToday[2].startsAt) {
					exDate = new Date(pricesToday[2].startsAt);
					this.checkAndSetValue(this.getStatePrefix(homeId, "PricesToday", "json"), JSON.stringify(pricesToday), "The prices today as json");
					this.fetchPriceAverage(homeId, `PricesToday.average`, pricesToday);
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
					this.checkAndSetValue(
						this.getStatePrefix(homeId, "PricesToday", "jsonBYpriceASC"),
						JSON.stringify(pricesToday.sort((a, b) => a.total - b.total)),
						"prices sorted by cost ascending as json",
					);
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
				}
			} else {
				this.adapter.log.debug(`Existing date (${exDate}) of price info is already the today date, polling of prices today from Tibber skipped`);
				return true;
			}
		} catch (error: any) {
			if (forceUpdate) this.adapter.log.error(this.generateErrorMessage(error, `pull of prices today`));
			else this.adapter.log.warn(this.generateErrorMessage(error, `pull of prices today`));
		}
		return false;
	}

	/**
	 * updates lists of tomorrows prices of all homes
	 *
	 * @param homeInfoList - homeInfo list object
	 * @param forceUpdate - force mode, without verification if existing data is fitting to current date
	 * @returns okprice - got correct data
	 */
	async updatePricesTomorrowAllHomes(homeInfoList: IHomeInfo[], forceUpdate?: boolean): Promise<boolean> {
		let okprice = true;
		for (const index in homeInfoList) {
			// potential problems with multihome??
			if (!(await this.updatePricesTomorrow(homeInfoList[index].ID, forceUpdate))) okprice = false;
		}
		return okprice;
	}
	/**
	 * updates list of tomorrows prices of one home
	 *
	 * @param homeId - homeId string
	 * @param forceUpdate - force mode, without verification if existing data is fitting to current date
	 * @returns newPrice - got new data
	 */
	async updatePricesTomorrow(homeId: string, forceUpdate?: boolean): Promise<boolean> {
		//CHANGE!!
		try {
			let exDate: Date | null = null;
			const exJSON = await this.getStateValue(`Homes.${homeId}.PricesTomorrow.json`);
			const exPricesTomorrow: IPrice[] = JSON.parse(exJSON);
			if (Array.isArray(exPricesTomorrow) && exPricesTomorrow[2] && exPricesTomorrow[2].startsAt) {
				exDate = new Date(exPricesTomorrow[2].startsAt);
			}
			const morgen = new Date();
			morgen.setDate(morgen.getDate() + 1);
			morgen.setHours(0, 0, 0, 0); // sets clock to 0:00
			if (!exDate || exDate <= morgen || forceUpdate) {
				const pricesTomorrow = await this.tibberQuery.getTomorrowsEnergyPrices(homeId);
				this.adapter.log.debug(`Got prices tomorrow from tibber api: ${JSON.stringify(pricesTomorrow)}`);
				this.checkAndSetValue(this.getStatePrefix(homeId, "PricesTomorrow", "json"), JSON.stringify(pricesTomorrow), "The prices tomorrow as json"); //write, also JSON is empty
				if (pricesTomorrow.length === 0) {
					// pricing not known, before about 13:00 - delete the states
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
					return true;
				}
			} else if (exDate == morgen) {
				this.adapter.log.debug(`Existing date (${exDate}) of price info is already the tomorrow date, polling of prices tomorrow from Tibber skipped`);
				return true;
			} else {
				return false;
			}
			return false;
		} catch (error: any) {
			if (forceUpdate) this.adapter.log.error(this.generateErrorMessage(error, `pull of prices tomorrow`));
			else this.adapter.log.warn(this.generateErrorMessage(error, `pull of prices tomorrow`));
			return false;
		}
	}

	/**
	 * yet not used in public revisions
	 *
	 * @param homeId - homeId string
	 * @returns void
	 */
	async getConsumption(homeId: string): Promise<void> {
		try {
			if (homeId) {
				const dailyConsumption = await this.tibberQuery.getConsumption(EnergyResolution.DAILY, 7, homeId);
				const weeklyConsumption = await this.tibberQuery.getConsumption(EnergyResolution.WEEKLY, 4, homeId);
				const monthlyConsumption = await this.tibberQuery.getConsumption(EnergyResolution.MONTHLY, 4, homeId);
				const annualConsumption = await this.tibberQuery.getConsumption(EnergyResolution.ANNUAL, 2, homeId);
				this.adapter.log.debug(`dailyConsumption ${JSON.stringify(dailyConsumption)}`);
				this.adapter.log.debug(`weeklyConsumption ${JSON.stringify(weeklyConsumption)}`);
				this.adapter.log.debug(`monthlyConsumption ${JSON.stringify(monthlyConsumption)}`);
				this.adapter.log.debug(`annualConsumption ${JSON.stringify(annualConsumption)}`);
				this.adapter.log.debug(`dailyConsumption ${dailyConsumption[0].consumption}`);
				this.adapter.log.debug(`weeklyConsumption ${weeklyConsumption[0].consumption}`);
				this.adapter.log.debug(`monthlyConsumption ${monthlyConsumption[0].consumption}`);
				this.adapter.log.debug(`annualConsumption ${annualConsumption[0].consumption}`);
				this.adapter.log.debug(`dailyConsumption cost ${dailyConsumption[0].cost}`);
				this.adapter.log.debug(`weeklyConsumption cost ${weeklyConsumption[0].cost}`);
				this.adapter.log.debug(`monthlyConsumption cost ${monthlyConsumption[0].cost}`);
				this.adapter.log.debug(`annualConsumption cost ${annualConsumption[0].cost}`);

				/*DEMO results
				annualConsumption [
					{"from":"2021-01-01T00:00:00.000+01:00","to":"2022-01-01T00:00:00.000+01:00","cost":18724.9354599375,"unitPrice":0.957861,"unitPriceVAT":0.191572,"consumption":19548.706,"consumptionUnit":"kWh","currency":"SEK"},
					{"from":"2022-01-01T00:00:00.000+01:00","to":"2023-01-01T00:00:00.000+01:00","cost":26246.8039997125,"unitPrice":1.594865,"unitPriceVAT":0.318973,"consumption":16457.069,"consumptionUnit":"kWh","currency":"SEK"}
				]
				monthlyConsumption [
					{"from":"2023-06-01T00:00:00.000+02:00","to":"2023-07-01T00:00:00.000+02:00","cost":314.7847971125,"unitPrice":0.576087,"unitPriceVAT":0.115217,"consumption":546.419,"consumptionUnit":"kWh","currency":"SEK"},
					{"from":"2023-07-01T00:00:00.000+02:00","to":"2023-08-01T00:00:00.000+02:00","cost":303.3428907125,"unitPrice":0.536517,"unitPriceVAT":0.107303,"consumption":565.393,"consumptionUnit":"kWh","currency":"SEK"},
					{"from":"2023-08-01T00:00:00.000+02:00","to":"2023-09-01T00:00:00.000+02:00","cost":334.8228185875,"unitPrice":0.47777,"unitPriceVAT":0.095554,"consumption":700.804,"consumptionUnit":"kWh","currency":"SEK"},
					{"from":"2023-09-01T00:00:00.000+02:00","to":"2023-10-01T00:00:00.000+02:00","cost":213.2174193625,"unitPrice":0.311208,"unitPriceVAT":0.062242,"consumption":685.129,"consumptionUnit":"kWh","currency":"SEK"}
				]
				weeklyConsumption [
					{"from":"2023-10-02T00:00:00.000+02:00","to":"2023-10-02T00:00:00.000+02:00","cost":31.87599515,"unitPrice":0.152634,"unitPriceVAT":0.030527,"consumption":208.84,"consumptionUnit":"kWh","currency":"SEK"},
					{"from":"2023-10-09T00:00:00.000+02:00","to":"2023-10-09T00:00:00.000+02:00","cost":58.7682522,"unitPrice":0.178189,"unitPriceVAT":0.035638,"consumption":329.808,"consumptionUnit":"kWh","currency":"SEK"},
					{"from":"2023-10-16T00:00:00.000+02:00","to":"2023-10-16T00:00:00.000+02:00","cost":93.24510705,"unitPrice":0.301353,"unitPriceVAT":0.060271,"consumption":309.422,"consumptionUnit":"kWh","currency":"SEK"},
					{"from":"2023-10-23T00:00:00.000+02:00","to":"2023-10-23T00:00:00.000+02:00","cost":150.1804269,"unitPrice":0.368239,"unitPriceVAT":0.073648,"consumption":407.834,"consumptionUnit":"kWh","currency":"SEK"}
				]
				dailyConsumption [
					{"from":"2023-10-22T00:00:00.000+02:00","to":"2023-10-23T00:00:00.000+02:00","cost":30.167938475,"unitPrice":0.531032,"unitPriceVAT":0.106206,"consumption":56.81,"consumptionUnit":"kWh","currency":"SEK"},
					{"from":"2023-10-23T00:00:00.000+02:00","to":"2023-10-24T00:00:00.000+02:00","cost":63.6176248,"unitPrice":1.190828,"unitPriceVAT":0.238166,"consumption":53.423,"consumptionUnit":"kWh","currency":"SEK"},
					{"from":"2023-10-24T00:00:00.000+02:00","to":"2023-10-25T00:00:00.000+02:00","cost":39.1912734625,"unitPrice":0.754418,"unitPriceVAT":0.150884,"consumption":51.949,"consumptionUnit":"kWh","currency":"SEK"},
					{"from":"2023-10-25T00:00:00.000+02:00","to":"2023-10-26T00:00:00.000+02:00","cost":41.3920498875,"unitPrice":0.644034,"unitPriceVAT":0.128807,"consumption":64.27,"consumptionUnit":"kWh","currency":"SEK"},
					{"from":"2023-10-26T00:00:00.000+02:00","to":"2023-10-27T00:00:00.000+02:00","cost":67.9109407375,"unitPrice":0.698248,"unitPriceVAT":0.13965,"consumption":97.259,"consumptionUnit":"kWh","currency":"SEK"},
					{"from":"2023-10-27T00:00:00.000+02:00","to":"2023-10-28T00:00:00.000+02:00","cost":65.7115841375,"unitPrice":1.309596,"unitPriceVAT":0.261919,"consumption":50.177,"consumptionUnit":"kWh","currency":"SEK"},
					{"from":"2023-10-28T00:00:00.000+02:00","to":"2023-10-29T00:00:00.000+02:00","cost":78.08023065,"unitPrice":1.112523,"unitPriceVAT":0.222505,"consumption":70.183,"consumptionUnit":"kWh","currency":"SEK"}
				]
				END results*/
			}
		} catch (error: any) {
			this.adapter.log.error(this.generateErrorMessage(error, `pull of consumption data`));
		}
	}

	private async fetchPrice(homeId: string, objectDestination: string, price: IPrice): Promise<void> {
		await this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "total"), price.total, "Total price (energy + taxes)");
		this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "energy"), price.energy, "Spotmarket energy price");
		this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "tax"), price.tax, "Tax part of the price (energy, tax, VAT...)");
		this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "startsAt"), price.startsAt, "Start time of the price");
		//this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "currency"), price.currency, "The price currency");
		this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "level"), price.level, "Price level compared to recent price values");
	}

	private fetchPriceAverage(homeId: string, objectDestination: string, price: IPrice[]): void {
		//const totalSum = price.reduce((sum, item) => sum + item.total, 0); // Verify 1.4.2 - Sentry error
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
}
