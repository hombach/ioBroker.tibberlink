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
            let exDate = null;
            exDate = new Date(await this.getStateValue(`Homes.${homeId}.CurrentPrice.startsAt`));
            const now = new Date();
            if (!exDate || now.getHours() !== exDate.getHours()) {
                const currentPrice = await this.tibberQuery.getCurrentEnergyPrice(homeId);
                this.adapter.log.debug(`Got current price from tibber api: ${JSON.stringify(currentPrice)}`);
                this.currentHomeId = homeId;
                await this.fetchPrice("CurrentPrice", currentPrice);
            }
            else {
                this.adapter.log.debug(`Hour (${exDate.getHours()}) of known current price is already the current hour, polling of current price from Tibber skipped`);
            }
        }
    }
    async updatePricesToday(homeId) {
        const exJSON = await this.getStateValue(`Homes.${homeId}.PricesToday.json`);
        const exPricesToday = JSON.parse(exJSON);
        let exDate = null;
        if (Array.isArray(exPricesToday) && exPricesToday[2] && exPricesToday[2].startsAt) {
            exDate = new Date(exPricesToday[2].startsAt);
        }
        const today = new Date();
        today.setHours(0, 0, 0, 0); // sets clock to 0:00
        if (!exDate || exDate <= today) {
            const pricesToday = await this.tibberQuery.getTodaysEnergyPrices(homeId);
            this.adapter.log.debug(`Got prices today from tibber api: ${JSON.stringify(pricesToday)}`);
            this.currentHomeId = homeId;
            this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, "PricesToday", "json"), JSON.stringify(pricesToday), "The prices today as json");
            for (const i in pricesToday) {
                const price = pricesToday[i];
                const hour = new Date(price.startsAt.substr(0, 19)).getHours();
                this.fetchPrice(`PricesToday.${hour}`, price);
            }
            this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, "PricesToday", "jsonBYpriceASC"), JSON.stringify(pricesToday.sort((a, b) => a.total - b.total)), "prices sorted by cost ascending");
        }
        else {
            this.adapter.log.debug(`Existing date (${exDate}) of price info is already the today date, polling of prices today from Tibber skipped`);
        }
    }
    async updatePricesTomorrow(homeId) {
        const exJSON = await this.getStateValue(`Homes.${homeId}.PricesTomorrow.json`);
        const exPricesTomorrow = JSON.parse(exJSON);
        let exDate = null;
        if (Array.isArray(exPricesTomorrow) && exPricesTomorrow[2] && exPricesTomorrow[2].startsAt) {
            exDate = new Date(exPricesTomorrow[2].startsAt);
        }
        const morgen = new Date();
        morgen.setDate(morgen.getDate() + 1);
        morgen.setHours(0, 0, 0, 0); // sets clock to 0:00
        if (!exDate || exDate <= morgen) {
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
                    const hour = new Date(price.startsAt.substr(0, 19)).getHours();
                    this.fetchPrice("PricesTomorrow." + hour, price);
                }
            }
            this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, "PricesTomorrow", "json"), JSON.stringify(pricesTomorrow), "The prices tomorrow as json");
            this.checkAndSetValue(this.getStatePrefix(this.currentHomeId, "PricesTomorrow", "jsonBYpriceASC"), JSON.stringify(pricesTomorrow.sort((a, b) => a.total - b.total)), "prices sorted by cost ascending");
        }
        else {
            this.adapter.log.debug(`Existing date (${exDate}) of price info is already the tomorrow date, polling of prices tomorrow from Tibber skipped`);
        }
    }
    fetchPrice(objectDestination, price) {
        this.checkAndSetValueNumber(this.getStatePrefix(this.currentHomeId, objectDestination, "total"), price.total, "The total price (energy + taxes)");
        //Error: 126: 26  error  Replace`this.getStatePrefix(this.currentHomeId,�"PricesTomorrow",�"json"),�JSON.stringify(pricesTomorrow),�"The�prices�tomorrow�as�json"` with `?????this.getStatePrefix(this.currentHomeId,�"PricesTomorrow",�"json"),?????JSON.stringify(pricesTomorrow),?????"The�prices�tomorrow�as�json",????`                                                                                                  prettier / prettier
        //Error: 127: 26  error  Replace`this.getStatePrefix(this.currentHomeId,�"PricesTomorrow",�"jsonBYpriceASC"),�JSON.stringify(pricesTomorrow.sort((a,�b)�=>�a.total�-�b.total)),�"prices�sorted�by�cost�ascending"` with `?????this.getStatePrefix(this.currentHomeId,�"PricesTomorrow",�"jsonBYpriceASC"),?????JSON.stringify(pricesTomorrow.sort((a,�b)�=>�a.total�-�b.total)),?????"prices�sorted�by�cost�ascending",????`  prettier / prettier
        //Error: 129: 27  error  Replace``Existing�date�(${ exDate }) �of�price�info�is�already�the�tomorrow�date, �polling�of�prices�tomorrow�from�Tibber�skipped`` with `?????`Existing�date�(${ exDate }) �of�price�info�is�already�the�tomorrow�date, �polling�of�prices�tomorrow�from�Tibber�skipped`,????`                                                                                                                              prettier / prettier
        //Error: 134: 31  error  Replace`this.getStatePrefix(this.currentHomeId,�objectDestination,�"total"),�price.total,�"The�total�price�(energy�+�taxes)"` with `????this.getStatePrefix(this.currentHomeId,�objectDestination,�"total"),????price.total,????"The�total�price�(energy�+�taxes)",???`                                                                                                                              prettier / prettier
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
//Error: 21: 50  error  Replace`,` with `;`                                                                                                                                                                                                                                                                                                                                                                                  prettier / prettier
//Error: 25: 36  error  Replace`,` with `;`                                                                                                                                                                                                                                                                                                                                                                                  prettier / prettier
//Error: 34: 27  error  Replace`this.getStatePrefix(this.currentHomeId,�"General",�"Timezone"),�currentHome.timeZone,�"The�time�zone�the�home�resides�in"` with `??????this.getStatePrefix(this.currentHomeId,�"General",�"Timezone"),??????currentHome.timeZone,??????"The�time�zone�the�home�resides�in",?????`                                                                                                            prettier / prettier
//Error: 35: 27  error  Replace`this.getStatePrefix(this.currentHomeId,�"General",�"NameInApp"),�currentHome.appNickname,�"The�nickname�given�to�the�home"` with `??????this.getStatePrefix(this.currentHomeId,�"General",�"NameInApp"),??????currentHome.appNickname,??????"The�nickname�given�to�the�home",?????`                                                                                                          prettier / prettier
//Error: 36: 27  error  Replace`this.getStatePrefix(this.currentHomeId,�"General",�"AvatarInApp"),�currentHome.appAvatar,�"The�chosen�app�avatar�for�the�home"` with `??????this.getStatePrefix(this.currentHomeId,�"General",�"AvatarInApp"),??????currentHome.appAvatar,??????"The�chosen�app�avatar�for�the�home",?????`                                                                                                  prettier / prettier
//Error: 40: 27  error  Replace`this.getStatePrefix(this.currentHomeId,�"General",�"PrimaryHeatingSource"),�currentHome.primaryHeatingSource,�"The�primary�form�of�heating�in�the�home"` with `??????this.getStatePrefix(this.currentHomeId,�"General",�"PrimaryHeatingSource"),??????currentHome.primaryHeatingSource,??????"The�primary�form�of�heating�in�the�home",?????`                                                prettier / prettier
//Error: 42: 33  error  Replace`this.getStatePrefix(this.currentHomeId,�"General",�"Size"),�currentHome.size,�"The�size�of�the�home�in�square�meters"` with `??????this.getStatePrefix(this.currentHomeId,�"General",�"Size"),??????currentHome.size,??????"The�size�of�the�home�in�square�meters",?????`                                                                                                                    prettier / prettier
//Error: 43: 33  error  Replace`this.getStatePrefix(this.currentHomeId,�"General",�"NumberOfResidents"),�currentHome.numberOfResidents,�"The�number�of�people�living�in�the�home"` with `??????this.getStatePrefix(this.currentHomeId,�"General",�"NumberOfResidents"),??????currentHome.numberOfResidents,??????"The�number�of�people�living�in�the�home",?????`                                                            prettier / prettier
//Error: 44: 33  error  Replace`this.getStatePrefix(this.currentHomeId,�"General",�"MainFuseSize"),�currentHome.mainFuseSize,�"The�main�fuse�size"` with `??????this.getStatePrefix(this.currentHomeId,�"General",�"MainFuseSize"),??????currentHome.mainFuseSize,??????"The�main�fuse�size",?????`                                                                                                                          prettier / prettier
//Error: 45: 34  error  Replace`this.getStatePrefix(this.currentHomeId,�"General",�"HasVentilationSystem"),�currentHome.hasVentilationSystem,�"Whether�the�home�has�a�ventilation�system"` with `??????this.getStatePrefix(this.currentHomeId,�"General",�"HasVentilationSystem"),??????currentHome.hasVentilationSystem,??????"Whether�the�home�has�a�ventilation�system",?????`                                            prettier / prettier
//Error: 50: 34  error  Replace`this.getStatePrefix(this.currentHomeId,�"Features",�"RealTimeConsumptionEnabled"),�currentHome.features.realTimeConsumptionEnabled` with `??????this.getStatePrefix(this.currentHomeId,�"Features",�"RealTimeConsumptionEnabled"),??????currentHome.features.realTimeConsumptionEnabled,?????`                                                                                               prettier / prettier
//Error: 54: 59  error  Replace`"fetching�homes�from�Tibber�API"))` with `�"fetching�homes�from�Tibber�API"));`                                                                                                                                                                                                                                                                                                              prettier / prettier
//Error: 62: 88  error  Insert`;`                                                                                                                                                                                                                                                                                                                                                                                            prettier / prettier
//Error: 70: 28  error  Replace``Hour�(${ exDate.getHours() }) �of�known�current�price�is�already�the�current�hour, �polling�of�current�price�from�Tibber�skipped`` with `??????`Hour�(${ exDate.getHours() }) �of�known�current�price�is�already�the�current�hour, �polling�of�current�price�from�Tibber�skipped`,?????`                                                                                                            prettier / prettier
//Error: 79: 5   error  Insert`�`                                                                                                                                                                                                                                                                                                                                                                                            prettier / prettier
//Error: 88: 26  error  Replace`this.getStatePrefix(this.currentHomeId,�"PricesToday",�"json"),�JSON.stringify(pricesToday),�"The�prices�today�as�json"` with `?????this.getStatePrefix(this.currentHomeId,�"PricesToday",�"json"),?????JSON.stringify(pricesToday),?????"The�prices�today�as�json",????`                                                                                                                    prettier / prettier
//Error: 94: 26  error  Replace`this.getStatePrefix(this.currentHomeId,�"PricesToday",�"jsonBYpriceASC"),�JSON.stringify(pricesToday.sort((a,�b)�=>�a.total�-�b.total)),�"prices�sorted�by�cost�ascending"` with `?????this.getStatePrefix(this.currentHomeId,�"PricesToday",�"jsonBYpriceASC"),?????JSON.stringify(pricesToday.sort((a,�b)�=>�a.total�-�b.total)),?????"prices�sorted�by�cost�ascending",????`              prettier / prettier
//Error: 114: 6   error  Replace`(pricesTomorrow.length�===�0)�{�` with `�(pricesTomorrow.length�===�0)�{?????`                                                                                                                                                                                                                                                                                                               prettier / prettier
//Error: 119: 32  error  Replace`�` with `?????`                                                                                                                                                                                                                                                                                                                                                                              prettier / prettier
//# sourceMappingURL=tibberAPICaller.js.map