"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TibberAPICaller = void 0;
const tibber_api_1 = require("tibber-api");
const tibberHelper_1 = require("./tibberHelper");
class TibberAPICaller extends tibberHelper_1.TibberHelper {
    // currentHomeId: string; // POTENTIAL: needed?
    constructor(tibberConfig, adapter) {
        super(adapter);
        this.tibberConfig = tibberConfig;
        this.tibberQuery = new tibber_api_1.TibberQuery(this.tibberConfig, 60000);
        // this.currentHomeId = ""; // POTENTIAL: needed?
    }
    async updateHomesFromAPI() {
        try {
            const Homes = await this.tibberQuery.getHomes();
            this.adapter.log.debug(`Got homes from tibber api: ${JSON.stringify(Homes)}`);
            const homeInfoList = [];
            for (const index in Homes) {
                const currentHome = Homes[index];
                // this.currentHomeId = currentHome.id; // POTENTIAL: needed?
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
                this.checkAndSetValueBoolean(this.getStatePrefix(currentHome.id, "Features", "RealTimeConsumptionEnabled"), currentHome.features.realTimeConsumptionEnabled);
            }
            return homeInfoList;
        }
        catch (error) {
            this.adapter.log.error(this.generateErrorMessage(error, "fetching homes from Tibber API"));
            return [];
        }
    }
    async updateCurrentPrice(homeId) {
        if (homeId) {
            let exDate = null;
            exDate = new Date(await this.getStateValue(`Homes.${homeId}.CurrentPrice.startsAt`));
            const now = new Date();
            if (!exDate || now.getHours() !== exDate.getHours()) {
                const currentPrice = await this.tibberQuery.getCurrentEnergyPrice(homeId);
                this.adapter.log.debug(`Got current price from tibber api: ${JSON.stringify(currentPrice)}`);
                // this.currentHomeId = homeId; // POTENTIAL: needed?
                await this.fetchPrice(homeId, "CurrentPrice", currentPrice);
                return true;
            }
            else {
                this.adapter.log.debug(`Hour (${exDate.getHours()}) of known current price is already the current hour, polling of current price from Tibber skipped`);
                return false;
            }
        }
        else {
            return false;
        }
    }
    async updatePricesToday(homeId) {
        let exDate = null;
        const exJSON = await this.getStateValue(`Homes.${homeId}.PricesToday.json`);
        const exPricesToday = JSON.parse(exJSON);
        if (Array.isArray(exPricesToday) && exPricesToday[2] && exPricesToday[2].startsAt) {
            exDate = new Date(exPricesToday[2].startsAt);
        }
        const today = new Date();
        today.setHours(0, 0, 0, 0); // sets clock to 0:00
        if (!exDate || exDate <= today) {
            const pricesToday = await this.tibberQuery.getTodaysEnergyPrices(homeId);
            this.adapter.log.debug(`Got prices today from tibber api: ${JSON.stringify(pricesToday)}`);
            //this.currentHomeId = homeId; // POTENTIAL: needed?
            this.checkAndSetValue(this.getStatePrefix(homeId, "PricesToday", "json"), await JSON.stringify(pricesToday), "The prices today as json");
            this.fetchPriceAverage(homeId, `PricesToday.average`, pricesToday);
            for (const i in pricesToday) {
                const price = pricesToday[i];
                const hour = new Date(price.startsAt.substr(0, 19)).getHours();
                this.fetchPrice(homeId, `PricesToday.${hour}`, price);
            }
            if (Array.isArray(pricesToday)) {
                // Sort the array if it is an array - possible type error discovered by sentry
                this.checkAndSetValue(this.getStatePrefix(homeId, "PricesToday", "jsonBYpriceASC"), await JSON.stringify(pricesToday.sort((a, b) => a.total - b.total)), "prices sorted by cost ascending as json");
            }
            else {
                // Handle the case when pricesToday is not an array, it's empty?, so just don't sort
                this.checkAndSetValue(this.getStatePrefix(homeId, "PricesToday", "jsonBYpriceASC"), await JSON.stringify(pricesToday), "prices sorted by cost ascending as json");
            }
        }
        else {
            this.adapter.log.debug(`Existing date (${exDate}) of price info is already the today date, polling of prices today from Tibber skipped`);
        }
    }
    async updatePricesTomorrow(homeId) {
        let exDate = null;
        const exJSON = await this.getStateValue(`Homes.${homeId}.PricesTomorrow.json`);
        const exPricesTomorrow = JSON.parse(exJSON);
        if (Array.isArray(exPricesTomorrow) && exPricesTomorrow[2] && exPricesTomorrow[2].startsAt) {
            exDate = new Date(exPricesTomorrow[2].startsAt);
        }
        const morgen = new Date();
        morgen.setDate(morgen.getDate() + 1);
        morgen.setHours(0, 0, 0, 0); // sets clock to 0:00
        if (!exDate || exDate <= morgen) {
            const pricesTomorrow = await this.tibberQuery.getTomorrowsEnergyPrices(homeId);
            this.adapter.log.debug(`Got prices tomorrow from tibber api: ${JSON.stringify(pricesTomorrow)}`);
            //this.currentHomeId = homeId; // POTENTIAL: needed?
            if (pricesTomorrow.length === 0) {
                // pricing not known, before about 13:00 - delete the states
                this.adapter.log.debug(`Emptying prices tomorrow and average cause existing ones are obsolete...`);
                for (let hour = 0; hour < 24; hour++) {
                    this.emptyingPrice(homeId, `PricesTomorrow.${hour}`);
                }
                this.emptyingPriceAverage(homeId, `PricesTomorrow.average`);
            }
            else if (pricesTomorrow) {
                // pricing known, after about 13:00 - write the states
                for (const i in pricesTomorrow) {
                    const price = pricesTomorrow[i];
                    const hour = new Date(price.startsAt.substr(0, 19)).getHours();
                    this.fetchPrice(homeId, "PricesTomorrow." + hour, price);
                }
            }
            this.checkAndSetValue(this.getStatePrefix(homeId, "PricesTomorrow", "json"), await JSON.stringify(pricesTomorrow), "The prices tomorrow as json");
            if (Array.isArray(pricesTomorrow)) {
                // Sort the array if it is an array - possible type error discovered by sentry
                this.checkAndSetValue(this.getStatePrefix(homeId, "PricesTomorrow", "jsonBYpriceASC"), await JSON.stringify(pricesTomorrow.sort((a, b) => a.total - b.total)), "prices sorted by cost ascending as json");
            }
            else {
                // Handle the case when pricesToday is not an array, it's empty?, so just don't sort
                this.checkAndSetValue(this.getStatePrefix(homeId, "PricesTomorrow", "jsonBYpriceASC"), await JSON.stringify(pricesTomorrow), "prices sorted by cost ascending as json");
            }
            this.fetchPriceAverage(homeId, `PricesTomorrow.average`, pricesTomorrow);
        }
        else {
            this.adapter.log.debug(`Existing date (${exDate}) of price info is already the tomorrow date, polling of prices tomorrow from Tibber skipped`);
        }
    }
    fetchPrice(homeId, objectDestination, price) {
        this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "total"), price.total, "Total price (energy + taxes)");
        this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "energy"), price.energy, "Spotmarket energy price");
        this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "tax"), price.tax, "Tax part of the price (energy, tax, VAT...)");
        this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "startsAt"), price.startsAt, "Start time of the price");
        //this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "currency"), price.currency, "The price currency");
        this.checkAndSetValue(this.getStatePrefix(homeId, objectDestination, "level"), price.level, "Price level compared to recent price values");
    }
    fetchPriceAverage(homeId, objectDestination, price) {
        const totalSum = price.reduce((sum, item) => sum + item.total, 0);
        this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "total"), Math.round(1000 * (totalSum / price.length)) / 1000, "Todays total price average");
        const energySum = price.reduce((sum, item) => sum + item.energy, 0);
        this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "energy"), Math.round(1000 * (energySum / price.length)) / 1000, "Todays avarage spotmarket price");
        const taxSum = price.reduce((sum, item) => sum + item.tax, 0);
        this.checkAndSetValueNumber(this.getStatePrefix(homeId, objectDestination, "tax"), Math.round(1000 * (taxSum / price.length)) / 1000, "Todays avarage tax price");
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
}
exports.TibberAPICaller = TibberAPICaller;
//# sourceMappingURL=tibberAPICaller.js.map