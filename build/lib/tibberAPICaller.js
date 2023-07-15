"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TibberAPICaller = void 0;
const tibber_api_1 = require("tibber-api");
const tibberHelper_1 = require("./tibberHelper");
class TibberAPICaller extends tibberHelper_1.TibberHelper {
    constructor(tibberConfig, adapter) {
        super(adapter);
        this.tibberConfig = tibberConfig;
        this.tibberQuery = new tibber_api_1.TibberQuery(this.tibberConfig);
        this.currentHomeId = "";
    }
    async updateHomesFromAPI() {
        const currentHomes = await this.tibberQuery.getHomes();
        this.adapter.log.debug("Get homes from tibber api: " + JSON.stringify(currentHomes));
        const homeIdList = [];
        for (const homeIndex in currentHomes) {
            const currentHome = currentHomes[homeIndex];
            this.currentHomeId = currentHome.id;
            homeIdList.push(this.currentHomeId);
            // Set HomeId in tibberConfig for further API Calls
            this.tibberConfig.homeId = this.currentHomeId;
            // Home GENERAL
            this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, "General", "Id"), currentHome.id, "ID of your home");
            this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, "General", "Timezone"), currentHome.timeZone, "The time zone the home resides in");
            this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, "General", "NameInApp"), currentHome.appNickname, "The nickname given to the home by the user");
            this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, "General", "AvatarInApp"), currentHome.appAvatar, "The chosen avatar for the home"); // Values: APARTMENT, ROWHOUSE, FLOORHOUSE1, FLOORHOUSE2, FLOORHOUSE3, COTTAGE, CASTLE
            this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, "General", "Type"), currentHome.type, "The type of home."); // Values: APARTMENT, ROWHOUSE, HOUSE, COTTAGE
            this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, "General", "PrimaryHeatingSource"), currentHome.primaryHeatingSource, "The primary form of heating in the household"); // Values: AIR2AIR_HEATPUMP, ELECTRICITY, GROUND, DISTRICT_HEATING, ELECTRIC_BOILER, AIR2WATER_HEATPUMP, OTHER
            this.checkAndSetValueNumber(this.getStatePrefix(this.currentHomeId, "General", "Size"), currentHome.size, "The size of the home in square meters");
            this.checkAndSetValueNumber(this.getStatePrefix(this.currentHomeId, "General", "NumberOfResidents"), currentHome.numberOfResidents, "The number of people living in the home");
            this.checkAndSetValueNumber(this.getStatePrefix(this.currentHomeId, "General", "MainFuseSize"), currentHome.mainFuseSize, "The main fuse size");
            this.checkAndSetValueBoolean(this.getStatePrefix(this.currentHomeId, "General", "HasVentilationSystem"), currentHome.hasVentilationSystem, "Whether the home has a ventilation system");
            this.fetchAddress("Address", currentHome.address);
            this.fetchLegalEntity("Owner", currentHome.owner);
            // TO DO: currentHome.currentSubscription
            // TO DO: currentHome.subscriptions
            // TO DO: currentHome.consumption
            // TO DO: currentHome.production
            this.checkAndSetValueBoolean(this.getStatePrefix(this.currentHomeId, "Features", "RealTimeConsumptionEnabled"), currentHome.features.realTimeConsumptionEnabled);
        }
        return homeIdList;
    }
    generateErrorMessage(error, context) {
        let errorMessages = "";
        for (const index in error.errors) {
            if (errorMessages) {
                errorMessages += ", ";
            }
            errorMessages += error.errors[index].message;
        }
        return "Fehler (" + error.statusMessage + ") bei Vorgang: " + context + ": " + errorMessages;
    }
    async updateCurrentPrice(homeId) {
        if (homeId) {
            const currentPrice = await this.tibberQuery.getCurrentEnergyPrice(homeId);
            this.adapter.log.debug("Get current price from tibber api: " + JSON.stringify(currentPrice));
            this.currentHomeId = homeId;
            await this.fetchPrice("CurrentPrice", currentPrice);
        }
    }
    async updatePricesToday(homeId) {
        const pricesToday = await this.tibberQuery.getTodaysEnergyPrices(homeId);
        this.adapter.log.debug("Get prices today from tibber api: " + JSON.stringify(pricesToday));
        this.currentHomeId = homeId;
        this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, "PricesToday", "json"), JSON.stringify(pricesToday), "The prices as json");
        for (const index in pricesToday) {
            const price = pricesToday[index];
            const hour = new Date(price.startsAt).getHours();
            this.fetchPrice("PricesToday." + hour, price);
        }
    }
    async updatePricesTomorrow(homeId) {
        const pricesTomorrow = await this.tibberQuery.getTomorrowsEnergyPrices(homeId);
        this.adapter.log.debug("Get prices tomorrow from tibber api: " + JSON.stringify(pricesTomorrow));
        this.currentHomeId = homeId;
        this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, "PricesTomorrow", "json"), JSON.stringify(pricesTomorrow), "The prices as json");
        for (const index in pricesTomorrow) {
            const price = pricesTomorrow[index];
            const hour = new Date(price.startsAt).getHours();
            this.fetchPrice("PricesTomorrow." + hour, price);
        }
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
    fetchPrice(objectDestination, price) {
        this.checkAndSetValueNumber(this.getStatePrefix(this.currentHomeId, objectDestination, "total"), price.total, "The total price (energy + taxes)");
        this.checkAndSetValueNumber(this.getStatePrefix(this.currentHomeId, objectDestination, "energy"), price.energy, "Nordpool spot price");
        this.checkAndSetValueNumber(this.getStatePrefix(this.currentHomeId, objectDestination, "tax"), price.tax, "The tax part of the price (guarantee of origin certificate, energy tax (Sweden only) and VAT)");
        this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, objectDestination, "startsAt"), price.startsAt, "The start time of the price");
        //this.checkAndSetValue(this.getStatePrefix(objectDestination, "currency"), price.currency, "The price currency");
        this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, objectDestination, "level"), price.level, "The price level compared to recent price values");
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