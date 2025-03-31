"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TibberAPICaller = void 0;
const tibber_api_1 = require("tibber-api");
const EnergyResolution_js_1 = require("tibber-api/lib/src/models/enums/EnergyResolution.js");
const projectUtils_js_1 = require("./projectUtils.js");
class TibberAPICaller extends projectUtils_js_1.ProjectUtils {
    tibberConfig;
    tibberQuery;
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
            for (const currentHome of Homes) {
                homeInfoList.push({
                    ID: currentHome.id,
                    NameInApp: currentHome.appNickname,
                    RealTime: currentHome.features.realTimeConsumptionEnabled,
                    FeedActive: false,
                    PriceDataPollActive: true,
                });
                this.tibberConfig.homeId = currentHome.id;
                const basePath = `Homes.${currentHome.id}`;
                void this.checkAndSetValue(`${basePath}.General.Id`, currentHome.id, "ID of your home");
                void this.checkAndSetValue(`${basePath}.General.Timezone`, currentHome.timeZone, "The time zone the home resides in");
                void this.checkAndSetValue(`${basePath}.General.NameInApp`, currentHome.appNickname, "The nickname given to the home");
                void this.checkAndSetValue(`${basePath}.General.AvatarInApp`, currentHome.appAvatar, "The chosen app avatar for the home");
                void this.checkAndSetValue(`${basePath}.General.Type`, currentHome.type, "The type of home.");
                void this.checkAndSetValue(`${basePath}.General.PrimaryHeatingSource`, currentHome.primaryHeatingSource, "The primary form of heating in the home");
                void this.checkAndSetValueNumber(`${basePath}.General.Size`, currentHome.size, "The size of the home in square meters");
                void this.checkAndSetValueNumber(`${basePath}.General.NumberOfResidents`, currentHome.numberOfResidents, "The number of people living in the home");
                void this.checkAndSetValueNumber(`${basePath}.General.MainFuseSize`, currentHome.mainFuseSize, "The main fuse size");
                void this.checkAndSetValueBoolean(`${basePath}.General.HasVentilationSystem`, currentHome.hasVentilationSystem, "Whether the home has a ventilation system");
                this.fetchAddress(currentHome.id, "Address", currentHome.address);
                this.fetchLegalEntity(currentHome.id, "Owner", currentHome.owner);
                void this.checkAndSetValueBoolean(`${basePath}.Features.RealTimeConsumptionEnabled`, currentHome.features.realTimeConsumptionEnabled, "Whether Tibber server will send consumption data by API");
            }
            return homeInfoList;
        }
        catch (error) {
            this.adapter.log.error(this.generateErrorMessage(error, "fetching homes from Tibber API"));
            return [];
        }
    }
    async updateCurrentPriceAllHomes(homeInfoList, forceUpdate = false) {
        let okprice = true;
        for (const curHomeInfo of homeInfoList) {
            if (!curHomeInfo.PriceDataPollActive) {
                continue;
            }
            if (!(await this.updateCurrentPrice(curHomeInfo.ID, forceUpdate))) {
                okprice = false;
            }
        }
        return okprice;
    }
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
                if (Array.isArray(pricesToday) && pricesToday[2]?.startsAt) {
                    const exDateToday = new Date(pricesToday[2].startsAt);
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
                }
                else if (now.getHours() == exDateCurrent.getHours()) {
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
            if (forceUpdate) {
                this.adapter.log.error(this.generateErrorMessage(error, `pull of current price`));
            }
            else {
                this.adapter.log.warn(this.generateErrorMessage(error, `pull of current price`));
            }
            return false;
        }
        return false;
    }
    async updatePricesTodayAllHomes(homeInfoList, forceUpdate = false) {
        let okprice = true;
        for (const curHomeInfo of homeInfoList) {
            if (!curHomeInfo.PriceDataPollActive) {
                continue;
            }
            if (!(await this.updatePricesToday(curHomeInfo.ID, forceUpdate))) {
                okprice = false;
            }
            else {
                const now = new Date();
                void this.checkAndSetValue(`Homes.${curHomeInfo.ID}.PricesToday.lastUpdate`, now.toString(), `last update of prices today`);
            }
        }
        return okprice;
    }
    async updatePricesToday(homeId, forceUpdate = false) {
        try {
            let exDate = null;
            let exPricesToday = [];
            if (!forceUpdate) {
                exPricesToday = JSON.parse(await this.getStateValue(`Homes.${homeId}.PricesToday.json`));
            }
            if (Array.isArray(exPricesToday) && exPricesToday[2]?.startsAt) {
                exDate = new Date(exPricesToday[2].startsAt);
            }
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (!exDate || exDate <= today || forceUpdate) {
                const pricesToday = await this.tibberQuery.getTodaysEnergyPrices(homeId);
                if (!(Array.isArray(pricesToday) && pricesToday.length > 0 && pricesToday[2]?.total)) {
                    throw new Error(`Got invalid data structure from Tibber [you might not have a valid (or fully confirmed) contract]`);
                }
                this.adapter.log.debug(`Got prices today from tibber api: ${JSON.stringify(pricesToday)} Force: ${forceUpdate}`);
                void this.checkAndSetValue(`Homes.${homeId}.PricesToday.json`, JSON.stringify(pricesToday), "The prices today as json");
                void this.checkAndSetValue(`Homes.${homeId}.PricesYesterday.json`, JSON.stringify(exPricesToday), "The prices yesterday as json");
                this.fetchPriceAverage(homeId, `PricesToday.average`, pricesToday);
                this.fetchPriceRemainingAverage(homeId, `PricesToday.averageRemaining`, pricesToday);
                this.fetchPriceMaximum(homeId, `PricesToday.maximum`, pricesToday.sort((a, b) => a.total - b.total));
                this.fetchPriceMinimum(homeId, `PricesToday.minimum`, pricesToday.sort((a, b) => a.total - b.total));
                for (const price of pricesToday) {
                    const hour = new Date(price.startsAt.substr(0, 19)).getHours();
                    await this.fetchPrice(homeId, `PricesToday.${hour}`, price);
                }
                if (Array.isArray(pricesToday) && pricesToday[2]?.startsAt) {
                    void this.checkAndSetValue(`Homes.${homeId}.PricesToday.jsonBYpriceASC`, JSON.stringify(pricesToday.sort((a, b) => a.total - b.total)), "prices sorted by cost ascending as json");
                    exDate = new Date(pricesToday[2].startsAt);
                    if (exDate && exDate >= today) {
                        return true;
                    }
                }
                else {
                    void this.checkAndSetValue(`Homes.${homeId}.PricesToday.jsonBYpriceASC`, JSON.stringify(pricesToday), "prices sorted by cost ascending as json");
                    return false;
                }
            }
            else {
                this.adapter.log.debug(`Existing date of price info is already the today date, polling of prices today from Tibber skipped`);
                return true;
            }
        }
        catch (error) {
            if (forceUpdate) {
                this.adapter.log.error(this.generateErrorMessage(error, `force pull of prices today`));
            }
            else {
                this.adapter.log.warn(this.generateErrorMessage(error, `pull of prices today`));
            }
            return false;
        }
        return false;
    }
    async updatePricesTomorrowAllHomes(homeInfoList, forceUpdate = false) {
        let okprice = true;
        for (const curHomeInfo of homeInfoList) {
            if (!curHomeInfo.PriceDataPollActive) {
                continue;
            }
            if (!(await this.updatePricesTomorrow(curHomeInfo.ID, forceUpdate))) {
                okprice = false;
            }
            else {
                const now = new Date();
                void this.checkAndSetValue(`Homes.${curHomeInfo.ID}.PricesTomorrow.lastUpdate`, now.toString(), `last update of prices tomorrow`);
            }
        }
        return okprice;
    }
    async updatePricesTomorrow(homeId, forceUpdate = false) {
        try {
            let exDate = null;
            let exPricesTomorrow = [];
            if (!forceUpdate) {
                exPricesTomorrow = JSON.parse(await this.getStateValue(`Homes.${homeId}.PricesTomorrow.json`));
            }
            if (Array.isArray(exPricesTomorrow) && exPricesTomorrow[2]?.startsAt) {
                exDate = new Date(exPricesTomorrow[2].startsAt);
            }
            const morgen = new Date();
            morgen.setDate(morgen.getDate() + 1);
            morgen.setHours(0, 0, 0, 0);
            if (!exDate || exDate < morgen || forceUpdate) {
                const pricesTomorrow = await this.tibberQuery.getTomorrowsEnergyPrices(homeId);
                this.adapter.log.debug(`Got prices tomorrow from tibber api: ${JSON.stringify(pricesTomorrow)} Force: ${forceUpdate}`);
                void this.checkAndSetValue(`Homes.${homeId}.PricesTomorrow.json`, JSON.stringify(pricesTomorrow), "The prices tomorrow as json");
                if (pricesTomorrow.length === 0) {
                    this.adapter.log.debug(`Emptying prices tomorrow and average cause existing ones are obsolete...`);
                    for (let hour = 0; hour < 24; hour++) {
                        this.emptyingPrice(homeId, `PricesTomorrow.${hour}`);
                    }
                    this.emptyingPriceAverage(homeId, `PricesTomorrow.average`);
                    this.emptyingPriceMaximum(homeId, `PricesTomorrow.maximum`);
                    this.emptyingPriceMinimum(homeId, `PricesTomorrow.minimum`);
                    void this.checkAndSetValue(`Homes.${homeId}.PricesTomorrow.jsonBYpriceASC`, JSON.stringify(pricesTomorrow), "prices sorted by cost ascending as json");
                    return false;
                }
                else if (Array.isArray(pricesTomorrow)) {
                    for (const price of pricesTomorrow) {
                        const hour = new Date(price.startsAt.substr(0, 19)).getHours();
                        await this.fetchPrice(homeId, `PricesTomorrow.${hour}`, price);
                    }
                    this.fetchPriceAverage(homeId, `PricesTomorrow.average`, pricesTomorrow);
                    this.fetchPriceMaximum(homeId, `PricesTomorrow.maximum`, pricesTomorrow.sort((a, b) => a.total - b.total));
                    this.fetchPriceMinimum(homeId, `PricesTomorrow.minimum`, pricesTomorrow.sort((a, b) => a.total - b.total));
                    void this.checkAndSetValue(`Homes.${homeId}.PricesTomorrow.jsonBYpriceASC`, JSON.stringify(pricesTomorrow.sort((a, b) => a.total - b.total)), "prices sorted by cost ascending as json");
                    exDate = new Date(pricesTomorrow[2].startsAt);
                    if (exDate && exDate >= morgen) {
                        return true;
                    }
                    return false;
                }
            }
            else if (exDate && exDate >= morgen) {
                this.adapter.log.debug(`Existing date of price info is already the tomorrow date, polling of prices tomorrow from Tibber skipped`);
                return true;
            }
            return false;
        }
        catch (error) {
            if (forceUpdate) {
                this.adapter.log.error(this.generateErrorMessage(error, `force pull of prices tomorrow`));
            }
            else {
                this.adapter.log.warn(this.generateErrorMessage(error, `pull of prices tomorrow`));
            }
            return false;
        }
    }
    async updateConsumptionAllHomes() {
        try {
            for (const home of this.adapter.config.HomesList) {
                if (!home.statsActive || !home.homeID) {
                    continue;
                }
                const homeID = home.homeID;
                const resolutions = [
                    { type: EnergyResolution_js_1.EnergyResolution.HOURLY, state: `jsonHourly`, numCons: home.numberConsHourly, description: `hour` },
                    { type: EnergyResolution_js_1.EnergyResolution.DAILY, state: `jsonDaily`, numCons: home.numberConsDaily, description: `day` },
                    { type: EnergyResolution_js_1.EnergyResolution.WEEKLY, state: `jsonWeekly`, numCons: home.numberConsWeekly, description: `week` },
                    { type: EnergyResolution_js_1.EnergyResolution.MONTHLY, state: `jsonMonthly`, numCons: home.numberConsMonthly, description: `month` },
                    { type: EnergyResolution_js_1.EnergyResolution.ANNUAL, state: `jsonAnnual`, numCons: home.numberConsAnnual, description: `year` },
                ];
                for (const { type, state, numCons, description } of resolutions) {
                    if (numCons && numCons > 0) {
                        const consumption = await this.tibberQuery.getConsumption(type, numCons, homeID);
                        void this.checkAndSetValue(`Homes.${homeID}.Consumption.${state}`, JSON.stringify(consumption), `Historical consumption last ${description}s as json)`, `json`);
                    }
                    else {
                        void this.checkAndSetValue(`Homes.${homeID}.Consumption.${state}`, `[]`);
                    }
                }
                this.adapter.log.debug(`Got all consumption data from Tibber Server for home: ${homeID}`);
            }
        }
        catch (error) {
            this.adapter.log.error(this.generateErrorMessage(error, `pull of consumption data`));
        }
    }
    async fetchPrice(homeId, objectDestination, price) {
        const basePath = `Homes.${homeId}.${objectDestination}`;
        await this.checkAndSetValueNumber(`${basePath}.total`, price.total, "Total price (energy + taxes)");
        void this.checkAndSetValueNumber(`${basePath}.energy`, price.energy, "Spotmarket energy price");
        void this.checkAndSetValueNumber(`${basePath}.tax`, price.tax, "Tax part of the price (energy, tax, VAT...)");
        void this.checkAndSetValue(`${basePath}.startsAt`, price.startsAt, "Start time of the price");
        void this.checkAndSetValue(`${basePath}.level`, price.level, "Price level compared to recent price values");
    }
    fetchPriceAverage(homeId, objectDestination, price) {
        const totalSum = price.reduce((sum, item) => {
            if (item && typeof item.total === "number") {
                return sum + item.total;
            }
            return sum;
        }, 0);
        const basePath = `Homes.${homeId}.${objectDestination}`;
        void this.checkAndSetValueNumber(`${basePath}.total`, Math.round(1000 * (totalSum / price.length)) / 1000, "Todays total price average");
        const energySum = price.reduce((sum, item) => sum + item.energy, 0);
        void this.checkAndSetValueNumber(`${basePath}.energy`, Math.round(1000 * (energySum / price.length)) / 1000, "Todays average spotmarket price");
        const taxSum = price.reduce((sum, item) => sum + item.tax, 0);
        void this.checkAndSetValueNumber(`${basePath}.tax`, Math.round(1000 * (taxSum / price.length)) / 1000, "Todays average tax price");
    }
    fetchPriceRemainingAverage(homeId, objectDestination, price) {
        const now = new Date();
        const currentHour = now.getHours();
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
        const basePath = `Homes.${homeId}.${objectDestination}`;
        void this.checkAndSetValueNumber(`${basePath}.total`, Math.round(1000 * (remainingTotalSum / filteredPrices.length)) / 1000, "Todays total price remaining average");
        const remainingEnergySum = filteredPrices.reduce((sum, item) => sum + item.energy, 0);
        void this.checkAndSetValueNumber(`${basePath}.energy`, Math.round(1000 * (remainingEnergySum / filteredPrices.length)) / 1000, "Todays remaining average spot market price");
        const remainingTaxSum = filteredPrices.reduce((sum, item) => sum + item.tax, 0);
        void this.checkAndSetValueNumber(`${basePath}.tax`, Math.round(1000 * (remainingTaxSum / filteredPrices.length)) / 1000, "Todays remaining average tax price");
    }
    fetchPriceMaximum(homeId, objectDestination, price) {
        if (!price || typeof price[23].total !== "number") {
        }
        const basePath = `Homes.${homeId}.${objectDestination}`;
        void this.checkAndSetValueNumber(`${basePath}.total`, Math.round(1000 * price[23].total) / 1000, "Todays total price maximum");
        void this.checkAndSetValueNumber(`${basePath}.energy`, Math.round(1000 * price[23].energy) / 1000, "Todays spotmarket price at total price maximum");
        void this.checkAndSetValueNumber(`${basePath}.tax`, Math.round(1000 * price[23].tax) / 1000, "Todays tax price at total price maximum");
        void this.checkAndSetValue(`${basePath}.level`, price[23].level, "Price level compared to recent price values");
        void this.checkAndSetValue(`${basePath}.startsAt`, price[23].startsAt, "Start time of the price maximum");
    }
    fetchPriceMinimum(homeId, objectDestination, price) {
        const basePath = `Homes.${homeId}.${objectDestination}`;
        void this.checkAndSetValueNumber(`${basePath}.total`, Math.round(1000 * price[0].total) / 1000, "Todays total price minimum");
        void this.checkAndSetValueNumber(`${basePath}.energy`, Math.round(1000 * price[0].energy) / 1000, "Todays spotmarket price at total price minimum");
        void this.checkAndSetValueNumber(`${basePath}.tax`, Math.round(1000 * price[0].tax) / 1000, "Todays tax price at total price minimum");
        void this.checkAndSetValue(`${basePath}.level`, price[0].level, "Price level compared to recent price values");
        void this.checkAndSetValue(`${basePath}.startsAt`, price[0].startsAt, "Start time of the price minimum");
    }
    emptyingPrice(homeId, objectDestination) {
        const basePath = `Homes.${homeId}.${objectDestination}`;
        void this.checkAndSetValueNumber(`${basePath}.total`, 0, "The total price (energy + taxes)");
        void this.checkAndSetValueNumber(`${basePath}.energy`, 0, "Spotmarket price");
        void this.checkAndSetValueNumber(`${basePath}.tax`, 0, "Tax part of the price (energy tax, VAT, etc.)");
        void this.checkAndSetValue(`${basePath}.level`, "Not known now", "Price level compared to recent price values");
    }
    emptyingPriceAverage(homeId, objectDestination) {
        const basePath = `Homes.${homeId}.${objectDestination}`;
        void this.checkAndSetValueNumber(`${basePath}.total`, 0, "The todays total price average");
        void this.checkAndSetValueNumber(`${basePath}.energy`, 0, "The todays avarage spotmarket price");
        void this.checkAndSetValueNumber(`${basePath}.tax`, 0, "The todays avarage tax price");
    }
    emptyingPriceMaximum(homeId, objectDestination) {
        const basePath = `Homes.${homeId}.${objectDestination}`;
        void this.checkAndSetValueNumber(`${basePath}.total`, 0, "Todays total price maximum");
        void this.checkAndSetValueNumber(`${basePath}.energy`, 0, "Todays spotmarket price at total price maximum");
        void this.checkAndSetValueNumber(`${basePath}.tax`, 0, "Todays tax price at total price maximum");
        void this.checkAndSetValue(`${basePath}.level`, "Not known now", "Price level compared to recent price values");
        void this.checkAndSetValue(`${basePath}.startsAt`, "Not known now", "Start time of the price maximum");
    }
    emptyingPriceMinimum(homeId, objectDestination) {
        const basePath = `Homes.${homeId}.${objectDestination}`;
        void this.checkAndSetValueNumber(`${basePath}.total`, 0, "Todays total price minimum");
        void this.checkAndSetValueNumber(`${basePath}.energy`, 0, "Todays spotmarket price at total price minimum");
        void this.checkAndSetValueNumber(`${basePath}.tax`, 0, "Todays tax price at total price minimum");
        void this.checkAndSetValue(`${basePath}.level`, "Not known now", "Price level compared to recent price values");
        void this.checkAndSetValue(`${basePath}.startsAt`, "Not known now", "Start time of the price minimum");
    }
    fetchLegalEntity(homeId, objectDestination, legalEntity) {
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
    fetchContactInfo(homeId, objectDestination, contactInfo) {
        const basePath = `Homes.${homeId}.${objectDestination}`;
        void this.checkAndSetValue(`${basePath}.Email`, contactInfo.email);
        void this.checkAndSetValue(`${basePath}.Mobile`, contactInfo.mobile);
    }
    fetchAddress(homeId, objectDestination, address) {
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
}
exports.TibberAPICaller = TibberAPICaller;
//# sourceMappingURL=tibberAPICaller.js.map