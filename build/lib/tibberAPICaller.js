"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TibberAPICaller = void 0;
const tibber_api_1 = require("tibber-api");
const tibberHelper_1 = require("./tibberHelper");
class TibberAPICaller extends tibberHelper_1.TibberHelper {
    constructor(tibberConfig, adapter) {
        super(adapter);
        this.tibberConfig = tibberConfig;
        this.tibberQuery = new tibber_api_1.TibberQuery(this.tibberConfig, 60000);
        this.currentHomeId = "";
    }
    async updateHomesFromAPI() {
        try {
            const Homes = await this.tibberQuery.getHomes();
            this.adapter.log.debug(`Got homes from tibber api: ${JSON.stringify(Homes)}`);
            const homeInfoList = [];
            for (const index in Homes) {
                const currentHome = Homes[index];
                this.currentHomeId = currentHome.id;
                homeInfoList.push({ ID: this.currentHomeId, RealTime: currentHome.features.realTimeConsumptionEnabled });
                // Set HomeId in tibberConfig for further API Calls
                this.tibberConfig.homeId = this.currentHomeId;
                // Home GENERAL
                this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, "General", "Id"), currentHome.id, "ID of your home");
                this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, "General", "Timezone"), currentHome.timeZone, "The time zone the home resides in");
                this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, "General", "NameInApp"), currentHome.appNickname, "The nickname given to the home");
                this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, "General", "AvatarInApp"), currentHome.appAvatar, "The chosen app avatar for the home");
                // Values: APARTMENT, ROWHOUSE, FLOORHOUSE1, FLOORHOUSE2, FLOORHOUSE3, COTTAGE, CASTLE
                this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, "General", "Type"), currentHome.type, "The type of home.");
                // Values: APARTMENT, ROWHOUSE, HOUSE, COTTAGE
                this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, "General", "PrimaryHeatingSource"), currentHome.primaryHeatingSource, "The primary form of heating in the home");
                // Values: AIR2AIR_HEATPUMP, ELECTRICITY, GROUND, DISTRICT_HEATING, ELECTRIC_BOILER, AIR2WATER_HEATPUMP, OTHER
                this.checkAndSetValueNumber(this.getStatePrefix(this.currentHomeId, "General", "Size"), currentHome.size, "The size of the home in square meters");
                this.checkAndSetValueNumber(this.getStatePrefix(this.currentHomeId, "General", "NumberOfResidents"), currentHome.numberOfResidents, "The number of people living in the home");
                this.checkAndSetValueNumber(this.getStatePrefix(this.currentHomeId, "General", "MainFuseSize"), currentHome.mainFuseSize, "The main fuse size");
                this.checkAndSetValueBoolean(this.getStatePrefix(this.currentHomeId, "General", "HasVentilationSystem"), currentHome.hasVentilationSystem, "Whether the home has a ventilation system");
                this.fetchAddress("Address", currentHome.address);
                this.fetchLegalEntity("Owner", currentHome.owner);
                this.checkAndSetValueBoolean(this.getStatePrefix(this.currentHomeId, "Features", "RealTimeConsumptionEnabled"), currentHome.features.realTimeConsumptionEnabled);
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
            const currentPrice = await this.tibberQuery.getCurrentEnergyPrice(homeId);
            this.adapter.log.debug(`Got current price from tibber api: ${JSON.stringify(currentPrice)}`);
            this.currentHomeId = homeId;
            await this.fetchPrice("CurrentPrice", currentPrice);
        }
    }
    async updatePricesToday(homeId) {
        //const exJSON = await this.getValue(this.getStatePrefix(this.currentHomeId, "PricesToday", "json").v);
        const exJSON = await this.getValue(`Homes.${this.currentHomeId}.PricesToday.json`);
        //const exPricesToday: IPrice[] = JSON.parse(exJSON);
        //const startsAt = new Date(exPricesToday[1].startsAt);
        //const exDate = new Date(exPricesToday[1].startsAt).getDate();
        //const heute = new Date().getDate();
        //if (exDate !== heute) {
        //} else {
        this.adapter.log.debug(`Existing date (${exJSON}) of price info is already the today date, polling of prices today from Tibber skipped`);
        this.adapter.log.debug(`Homes.${this.currentHomeId}.PricesToday.json`);
        //}
        const pricesToday = await this.tibberQuery.getTodaysEnergyPrices(homeId);
        this.adapter.log.debug(`Got prices today from tibber api: ${JSON.stringify(pricesToday)}`);
        this.currentHomeId = homeId;
        this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, "PricesToday", "json"), JSON.stringify(pricesToday), "The prices today as json");
        for (const i in pricesToday) {
            const price = pricesToday[i];
            const hour = new Date(price.startsAt).getHours();
            this.fetchPrice("PricesToday." + hour, price);
        }
        this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, "PricesToday", "jsonBYpriceASC"), JSON.stringify(pricesToday.sort((a, b) => a.total - b.total)), "prices sorted by cost ascending");
    }
    async updatePricesTomorrow(homeId) {
        const pricesTomorrow = await this.tibberQuery.getTomorrowsEnergyPrices(homeId);
        this.adapter.log.debug(`Got prices tomorrow from tibber api: ${JSON.stringify(pricesTomorrow)}`);
        this.currentHomeId = homeId;
        if (pricesTomorrow.length === 0) { // pricing not known, before about 13:00 - delete the states
            this.adapter.log.debug(`Emptying PricesTomorrow cause existing ones are obsolete...`);
            for (let hour = 0; hour < 24; hour++) {
                this.emptyingPrice(`PricesTomorrow.${hour}`);
            }
        }
        else if (pricesTomorrow) { // pricing known, after about 13:00 - write the states
            for (const i in pricesTomorrow) {
                const price = pricesTomorrow[i];
                const hour = new Date(price.startsAt).getHours();
                this.fetchPrice("PricesTomorrow." + hour, price);
            }
        }
        this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, "PricesTomorrow", "json"), JSON.stringify(pricesTomorrow), "The prices tomorrow as json");
        this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, "PricesTomorrow", "jsonBYpriceASC"), JSON.stringify(pricesTomorrow.sort((a, b) => a.total - b.total)), "prices sorted by cost ascending");
    }
    fetchPrice(objectDestination, price) {
        this.checkAndSetValueNumber(this.getStatePrefix(this.currentHomeId, objectDestination, "total"), price.total, "The total price (energy + taxes)");
        this.checkAndSetValueNumber(this.getStatePrefix(this.currentHomeId, objectDestination, "energy"), price.energy, "Spotmarket price");
        this.checkAndSetValueNumber(this.getStatePrefix(this.currentHomeId, objectDestination, "tax"), price.tax, "The tax part of the price (energy tax, VAT, etc.)");
        this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, objectDestination, "startsAt"), price.startsAt, "Start time of the price");
        //this.checkAndSetValue(this.getStatePrefix(objectDestination, "currency"), price.currency, "The price currency");
        this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, objectDestination, "level"), price.level, "Price level compared to recent price values");
    }
    emptyingPrice(objectDestination) {
        this.checkAndSetValueNumber(this.getStatePrefix(this.currentHomeId, objectDestination, "total"), 0, "The total price (energy + taxes)");
        this.checkAndSetValueNumber(this.getStatePrefix(this.currentHomeId, objectDestination, "energy"), 0, "Spotmarket price");
        this.checkAndSetValueNumber(this.getStatePrefix(this.currentHomeId, objectDestination, "tax"), 0, "The tax part of the price (energy tax, VAT, etc.)");
        this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, objectDestination, "level"), "Not known now", "Price level compared to recent price values");
    }
    fetchAddress(objectDestination, address) {
        this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, objectDestination, "address1"), address.address1);
        this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, objectDestination, "address2"), address.address2);
        this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, objectDestination, "address3"), address.address3);
        this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, objectDestination, "City"), address.city);
        this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, objectDestination, "PostalCode"), address.postalCode);
        this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, objectDestination, "Country"), address.country);
        this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, objectDestination, "Latitude"), address.latitude);
        this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, objectDestination, "Longitude"), address.longitude);
    }
    fetchLegalEntity(objectDestination, legalEntity) {
        this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, objectDestination, "Id"), legalEntity.id);
        this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, objectDestination, "FirstName"), legalEntity.firstName);
        this.checkAndSetValueBoolean(this.getStatePrefix(this.currentHomeId, objectDestination, "IsCompany"), legalEntity.isCompany);
        this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, objectDestination, "Name"), legalEntity.name);
        this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, objectDestination, "MiddleName"), legalEntity.middleName);
        this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, objectDestination, "LastName"), legalEntity.lastName);
        this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, objectDestination, "OrganizationNo"), legalEntity.organizationNo);
        this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, objectDestination, "Language"), legalEntity.language);
        if (legalEntity.contactInfo) {
            this.fetchContactInfo(objectDestination + ".ContactInfo", legalEntity.contactInfo);
        }
        if (legalEntity.address) {
            this.fetchAddress(objectDestination + ".Address", legalEntity.address);
        }
    }
    fetchContactInfo(objectDestination, contactInfo) {
        this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, objectDestination, "Email"), contactInfo.email);
        this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, objectDestination, "Mobile"), contactInfo.mobile);
    }
}
exports.TibberAPICaller = TibberAPICaller;
//# sourceMappingURL=tibberAPICaller.js.map