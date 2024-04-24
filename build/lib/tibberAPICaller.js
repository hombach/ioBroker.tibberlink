"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TibberAPICaller = void 0;
const tibber_api_1 = require("tibber-api");
const EnergyResolution_1 = require("tibber-api/lib/src/models/enums/EnergyResolution");
const tibberHelper_1 = require("./tibberHelper");
class TibberAPICaller extends tibberHelper_1.TibberHelper {
    constructor(tibberConfig, adapter) {
        super(adapter);
        this.tibberConfig = tibberConfig;
        this.tibberQuery = new tibber_api_1.TibberQuery(this.tibberConfig, 60000);
    }
    async updateHomesFromAPI() {
        try {
            const Homes = await this.tibberQuery.getHomes();
            this.adapter.log.debug(`Got homes from tibber api: ${JSON.stringify(Homes)}`);
            const homeInfoList = [];
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
                this.checkAndSetValue(this.getStatePrefix(currentHome.id, "General", "AvatarInApp"), currentHome.appAvatar, "The chosen app avatar for the home");
                // Values: APARTMENT, ROWHOUSE, FLOORHOUSE1, FLOORHOUSE2, FLOORHOUSE3, COTTAGE, CASTLE
                this.checkAndSetValue(this.getStatePrefix(currentHome.id, "General", "Type"), currentHome.type, "The type of home.");
                // Values: APARTMENT, ROWHOUSE, HOUSE, COTTAGE
                this.checkAndSetValue(this.getStatePrefix(currentHome.id, "General", "PrimaryHeatingSource"), currentHome.primaryHeatingSource, "The primary form of heating in the home");
                // Values: AIR2AIR_HEATPUMP, ELECTRICITY, GROUND, DISTRICT_HEATING, ELECTRIC_BOILER, AIR2WATER_HEATPUMP, OTHER
                this.checkAndSetValueNumber(this.getStatePrefix(currentHome.id, "General", "Size"), currentHome.size, "The size of the home in square meters");
                this.checkAndSetValueNumber(this.getStatePrefix(currentHome.id, "General", "NumberOfResidents"), currentHome.numberOfResidents, "The number of people living in the home");
                this.checkAndSetValueNumber(this.getStatePrefix(currentHome.id, "General", "MainFuseSize"), currentHome.mainFuseSize, "The main fuse size");
                this.checkAndSetValueBoolean(this.getStatePrefix(currentHome.id, "General", "HasVentilationSystem"), currentHome.hasVentilationSystem, "Whether the home has a ventilation system");
                this.fetchAddress(currentHome.id, "Address", currentHome.address);
                this.fetchLegalEntity(currentHome.id, "Owner", currentHome.owner);
                this.checkAndSetValueBoolean(this.getStatePrefix(currentHome.id, "Features", "RealTimeConsumptionEnabled"), currentHome.features.realTimeConsumptionEnabled, "Whether Tibber server will send consumption data by API");
            }
            return homeInfoList;
        }
        catch (error) {
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
    async updateCurrentPriceAllHomes(homeInfoList, forceUpdate = false) {
        let okprice = true;
        for (const curHomeInfo of homeInfoList) {
            if (!curHomeInfo.PriceDataPollActive)
                continue;
            if (!(await this.updateCurrentPrice(curHomeInfo.ID, forceUpdate)))
                okprice = false; // single fault sets all false
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
    async updateCurrentPrice(homeId, forceUpdate = false) {
        try {
            if (homeId) {
                let exDateCurrent = null;
                let pricesToday = [];
                const now = new Date();
                if (!forceUpdate) {
                    exDateCurrent = new Date(await this.getStateValue(`Homes.${homeId}.CurrentPrice.startsAt`));
                    pricesToday = JSON.parse(await this.getStateValue(`Homes.${homeId}.PricesToday.json`));
                }
                // update remaining average
                if (Array.isArray(pricesToday) && pricesToday[2] && pricesToday[2].startsAt) {
                    const exDateToday = new Date(pricesToday[2].startsAt);
                    if (now.getDate == exDateToday.getDate)
                        this.fetchPriceRemainingAverage(homeId, `PricesToday.averageRemaining`, pricesToday);
                }
                if (!exDateCurrent || now.getHours() !== exDateCurrent.getHours() || forceUpdate) {
                    const currentPrice = await this.tibberQuery.getCurrentEnergyPrice(homeId);
                    await this.fetchPrice(homeId, "CurrentPrice", currentPrice);
                    this.adapter.log.debug(`Got current price from tibber api: ${JSON.stringify(currentPrice)} Force: ${forceUpdate}`);
                    exDateCurrent = new Date(currentPrice.startsAt);
                    if (exDateCurrent && now.getHours() === exDateCurrent.getHours()) {
                        return true;
                    }
                }
                else if (now.getHours() !== exDateCurrent.getHours()) {
                    this.adapter.log.debug(`Hour (${exDateCurrent.getHours()}) of known current price is already the current hour, polling of current price from Tibber skipped`);
                    return true;
                }
                else {
                    return false;
                }
            }
            else {
                return false;
            }
        }
        catch (error) {
            if (forceUpdate)
                this.adapter.log.error(this.generateErrorMessage(error, `pull of current price`));
            else
                this.adapter.log.warn(this.generateErrorMessage(error, `pull of current price`));
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
    async updatePricesTodayAllHomes(homeInfoList, forceUpdate = false) {
        let okprice = true;
        for (const curHomeInfo of homeInfoList) {
            if (!curHomeInfo.PriceDataPollActive)
                continue;
            if (!(await this.updatePricesToday(curHomeInfo.ID, forceUpdate))) {
                okprice = false;
            }
            else {
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
    async updatePricesToday(homeId, forceUpdate = false) {
        try {
            let exDate = null;
            let exPricesToday = [];
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
                this.fetchPriceMaximum(homeId, `PricesToday.maximum`, pricesToday.sort((a, b) => a.total - b.total));
                this.fetchPriceMinimum(homeId, `PricesToday.minimum`, pricesToday.sort((a, b) => a.total - b.total));
                for (const i in pricesToday) {
                    const price = pricesToday[i];
                    const hour = new Date(price.startsAt.substr(0, 19)).getHours();
                    await this.fetchPrice(homeId, `PricesToday.${hour}`, price);
                }
                if (Array.isArray(pricesToday) && pricesToday[2] && pricesToday[2].startsAt) {
                    this.checkAndSetValue(this.getStatePrefix(homeId, "PricesToday", "jsonBYpriceASC"), JSON.stringify(pricesToday.sort((a, b) => a.total - b.total)), "prices sorted by cost ascending as json");
                    exDate = new Date(pricesToday[2].startsAt);
                    if (exDate && exDate >= today) {
                        return true;
                    }
                }
                else {
                    // Handle the case when pricesToday is not an array, it's empty!, so just don't sort and write
                    this.checkAndSetValue(this.getStatePrefix(homeId, "PricesToday", "jsonBYpriceASC"), JSON.stringify(pricesToday), "prices sorted by cost ascending as json");
                    return false;
                }
            }
            else {
                this.adapter.log.debug(`Existing date (${exDate}) of price info is already the today date, polling of prices today from Tibber skipped`);
                return true;
            }
        }
        catch (error) {
            if (forceUpdate)
                this.adapter.log.error(this.generateErrorMessage(error, `force pull of prices today`));
            else
                this.adapter.log.warn(this.generateErrorMessage(error, `pull of prices today`));
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
    async updatePricesTomorrowAllHomes(homeInfoList, forceUpdate = false) {
        let okprice = true;
        for (const curHomeInfo of homeInfoList) {
            if (!curHomeInfo.PriceDataPollActive)
                continue;
            if (!(await this.updatePricesTomorrow(curHomeInfo.ID, forceUpdate))) {
                okprice = false; // single fault sets all false
            }
            else {
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
    async updatePricesTomorrow(homeId, forceUpdate = false) {
        try {
            let exDate = null;
            let exPricesTomorrow = [];
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
                    this.checkAndSetValue(this.getStatePrefix(homeId, "PricesTomorrow", "jsonBYpriceASC"), JSON.stringify(pricesTomorrow), "prices sorted by cost ascending as json");
                    return false;
                }
                else if (Array.isArray(pricesTomorrow)) {
                    // pricing known, after about 13:00 - write the states
                    for (const i in pricesTomorrow) {
                        const price = pricesTomorrow[i];
                        const hour = new Date(price.startsAt.substr(0, 19)).getHours();
                        await this.fetchPrice(homeId, "PricesTomorrow." + hour, price);
                    }
                    this.fetchPriceAverage(homeId, `PricesTomorrow.average`, pricesTomorrow);
                    this.fetchPriceMaximum(homeId, `PricesTomorrow.maximum`, pricesTomorrow.sort((a, b) => a.total - b.total));
                    this.fetchPriceMinimum(homeId, `PricesTomorrow.minimum`, pricesTomorrow.sort((a, b) => a.total - b.total));
                    this.checkAndSetValue(this.getStatePrefix(homeId, "PricesTomorrow", "jsonBYpriceASC"), JSON.stringify(pricesTomorrow.sort((a, b) => a.total - b.total)), "prices sorted by cost ascending as json");
                    exDate = new Date(pricesTomorrow[2].startsAt);
                    if (exDate && exDate >= morgen) {
                        return true;
                    }
                    else {
                        return false;
                    }
                }
            }
            else if (exDate && exDate >= morgen) {
                this.adapter.log.debug(`Existing date (${exDate}) of price info is already the tomorrow date, polling of prices tomorrow from Tibber skipped`);
                return true;
            }
            return false;
        }
        catch (error) {
            if (forceUpdate)
                this.adapter.log.error(this.generateErrorMessage(error, `force pull of prices tomorrow`));
            else
                this.adapter.log.warn(this.generateErrorMessage(error, `pull of prices tomorrow`));
            return false;
        }
    }
    /**
     * updates historical consumption data of all homes
     *
     * @returns void - data will be written to ioBroker objects as JSON
     */
    async updateConsumptionAllHomes() {
        try {
            for (const home of this.adapter.config.HomesList) {
                if (!home.statsActive || !home.homeID)
                    continue;
                const homeID = home.homeID;
                const resolutions = [
                    { type: EnergyResolution_1.EnergyResolution.HOURLY, state: `jsonHourly`, numCons: home.numberConsHourly, description: `hour` },
                    { type: EnergyResolution_1.EnergyResolution.DAILY, state: `jsonDaily`, numCons: home.numberConsDaily, description: `day` },
                    { type: EnergyResolution_1.EnergyResolution.WEEKLY, state: `jsonWeekly`, numCons: home.numberConsWeekly, description: `week` },
                    { type: EnergyResolution_1.EnergyResolution.MONTHLY, state: `jsonMonthly`, numCons: home.numberConsMonthly, description: `month` },
                    { type: EnergyResolution_1.EnergyResolution.ANNUAL, state: `jsonAnnual`, numCons: home.numberConsAnnual, description: `year` },
                ];
                for (const { type, state, numCons, description } of resolutions) {
                    if (numCons && numCons > 0) {
                        const consumption = await this.tibberQuery.getConsumption(type, numCons, homeID);
                        this.checkAndSetValue(this.getStatePrefix(homeID, `Consumption`, state), JSON.stringify(consumption), `Historical consumption last ${description}s as json)`);
                        // WiP
                        if (type == EnergyResolution_1.EnergyResolution.HOURLY) {
                            /*
                            export interface IConsumption {
                                homeId?: string;
                                from: string;
                                to: string;
                                unitPrice: number;
                                unitPriceVAT: number;
                                consumption: number;
                                consumptionUnit: string;
                                cost: number;
                                currency: string; }
                                */
                            this.adapter.log.info(`Got hourly consumption raw data 0: ${consumption[0].consumption}`);
                            this.adapter.log.info(`Got hourly consumption raw data 0: ${consumption[0].cost}`);
                            this.adapter.log.info(`Got hourly consumption raw data 1: ${consumption[1].consumption}`);
                            this.adapter.log.info(`Got hourly consumption raw data 1: ${consumption[1].cost}`);
                            this.adapter.log.info(`Got hourly consumption data stringified: ${JSON.stringify(consumption)}`);
                        }
                        // WiP
                    }
                    else {
                        this.checkAndSetValue(this.getStatePrefix(homeID, `Consumption`, state), `[]`);
                    }
                }
                this.adapter.log.debug(`Got allconsumption data from Tibber Server for home: ${homeID}`);
            }
        }
        catch (error) {
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
    async fetchPrice(homeId, objectDestination, price) {
        await this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "total"), price.total, "Total price (energy + taxes)");
        this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "energy"), price.energy, "Spotmarket energy price");
        this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "tax"), price.tax, "Tax part of the price (energy, tax, VAT...)");
        this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "startsAt"), price.startsAt, "Start time of the price");
        //this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "currency"), price.currency, "The price currency");
        this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "level"), price.level, "Price level compared to recent price values");
    }
    fetchPriceAverage(homeId, objectDestination, price) {
        const totalSum = price.reduce((sum, item) => {
            if (item && typeof item.total === "number") {
                return sum + item.total;
            }
            return sum;
        }, 0);
        this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "total"), Math.round(1000 * (totalSum / price.length)) / 1000, "Todays total price average");
        const energySum = price.reduce((sum, item) => sum + item.energy, 0);
        this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "energy"), Math.round(1000 * (energySum / price.length)) / 1000, "Todays average spotmarket price");
        const taxSum = price.reduce((sum, item) => sum + item.tax, 0);
        this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "tax"), Math.round(1000 * (taxSum / price.length)) / 1000, "Todays average tax price");
    }
    fetchPriceRemainingAverage(homeId, objectDestination, price) {
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
        this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "total"), Math.round(1000 * (remainingTotalSum / filteredPrices.length)) / 1000, "Todays total price remaining average");
        const remainingEnergySum = filteredPrices.reduce((sum, item) => sum + item.energy, 0);
        this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "energy"), Math.round(1000 * (remainingEnergySum / filteredPrices.length)) / 1000, "Todays remaining average spot market price");
        const remainingTaxSum = filteredPrices.reduce((sum, item) => sum + item.tax, 0);
        this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "tax"), Math.round(1000 * (remainingTaxSum / filteredPrices.length)) / 1000, "Todays remaining average tax price");
    }
    fetchPriceMaximum(homeId, objectDestination, price) {
        if (!price || typeof price[23].total !== "number") {
            // possible exit 1.4.3 - Sentry discovered possible error in 1.4.1
            // return;
        }
        this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "total"), Math.round(1000 * price[23].total) / 1000, "Todays total price maximum");
        this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "energy"), Math.round(1000 * price[23].energy) / 1000, "Todays spotmarket price at total price maximum");
        this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "tax"), Math.round(1000 * price[23].tax) / 1000, "Todays tax price at total price maximum");
        this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "level"), price[23].level, "Price level compared to recent price values");
        this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "startsAt"), price[23].startsAt, "Start time of the price maximum");
    }
    fetchPriceMinimum(homeId, objectDestination, price) {
        this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "total"), Math.round(1000 * price[0].total) / 1000, "Todays total price minimum");
        this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "energy"), Math.round(1000 * price[0].energy) / 1000, "Todays spotmarket price at total price minimum");
        this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "tax"), Math.round(1000 * price[0].tax) / 1000, "Todays tax price at total price minimum");
        this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "level"), price[0].level, "Price level compared to recent price values");
        this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "startsAt"), price[0].startsAt, "Start time of the price minimum");
    }
    emptyingPrice(homeId, objectDestination) {
        this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "total"), 0, "The total price (energy + taxes)");
        this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "energy"), 0, "Spotmarket price");
        this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "tax"), 0, "Tax part of the price (energy tax, VAT, etc.)");
        this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "level"), "Not known now", "Price level compared to recent price values");
    }
    emptyingPriceAverage(homeId, objectDestination) {
        this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "total"), 0, "The todays total price average");
        this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "energy"), 0, "The todays avarage spotmarket price");
        this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "tax"), 0, "The todays avarage tax price");
    }
    emptyingPriceMaximum(homeId, objectDestination) {
        this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "total"), 0, "Todays total price maximum");
        this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "energy"), 0, "Todays spotmarket price at total price maximum");
        this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "tax"), 0, "Todays tax price at total price maximum");
        this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "level"), "Not known now", "Price level compared to recent price values");
        this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "startsAt"), "Not known now", "Start time of the price maximum");
    }
    emptyingPriceMinimum(homeId, objectDestination) {
        this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "total"), 0, "Todays total price minimum");
        this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "energy"), 0, "Todays spotmarket price at total price minimum");
        this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "tax"), 0, "Todays tax price at total price minimum");
        this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "level"), "Not known now", "Price level compared to recent price values");
        this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "startsAt"), "Not known now", "Start time of the price minimum");
    }
    fetchLegalEntity(homeId, objectDestination, legalEntity) {
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
    fetchContactInfo(homeId, objectDestination, contactInfo) {
        this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "Email"), contactInfo.email);
        this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "Mobile"), contactInfo.mobile);
    }
    fetchAddress(homeId, objectDestination, address) {
        this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "address1"), address.address1);
        this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "address2"), address.address2);
        this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "address3"), address.address3);
        this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "City"), address.city);
        this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "PostalCode"), address.postalCode);
        this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "Country"), address.country);
        this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "Latitude"), address.latitude);
        this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "Longitude"), address.longitude);
    }
}
exports.TibberAPICaller = TibberAPICaller;
//# sourceMappingURL=tibberAPICaller.js.map