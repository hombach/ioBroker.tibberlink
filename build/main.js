"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
// The adapter-core module gives you access to the core ioBroker functions you need to create an adapter
const utils = __importStar(require("@iobroker/adapter-core"));
const cron_1 = require("cron");
const date_fns_1 = require("date-fns");
const tibberAPICaller_1 = require("./lib/tibberAPICaller");
const tibberCalculator_1 = require("./lib/tibberCalculator");
const tibberLocal_1 = require("./lib/tibberLocal");
const tibberPulse_1 = require("./lib/tibberPulse");
class Tibberlink extends utils.Adapter {
    constructor(options = {}) {
        super({
            ...options,
            name: "tibberlink",
        });
        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        // this.on("objectChange", this.onObjectChange.bind(this));
        this.on("message", this.onMessage.bind(this));
        this.on("unload", this.onUnload.bind(this));
        this.homeInfoList = [];
        this.cronList = [];
        this.queryUrl = "https://api.tibber.com/v1-beta/gql";
    }
    cronList;
    homeInfoList = [];
    queryUrl = "";
    tibberCalculator = new tibberCalculator_1.TibberCalculator(this);
    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Reset the connection indicator during startup;
        if (!this.config.TibberAPIToken) {
            // No Token defined in configuration
            this.log.error(`Missing API Token - please check configuration`);
            void this.setState(`info.connection`, false, true);
        }
        else {
            // Need 2 configs - API and Feed (feed changed query url)
            const tibberConfigAPI = {
                active: true,
                apiEndpoint: {
                    apiKey: this.config.TibberAPIToken,
                    queryUrl: this.queryUrl,
                    userAgent: `${this.config.TibberAPIToken.slice(5, 20).split("").reverse().join("")}${Date.now()}`,
                },
            };
            // Now read homes list from API
            const tibberAPICaller = new tibberAPICaller_1.TibberAPICaller(tibberConfigAPI, this);
            try {
                this.homeInfoList = await tibberAPICaller.updateHomesFromAPI();
                if (this.config.HomesList.length > 0) {
                    //are there feeds configured to be used??
                    if (this.homeInfoList.length > 0) {
                        //set data in homeinfolist according to config data
                        const result = [];
                        for (const home of this.config.HomesList) {
                            const matchingHomeInfo = this.homeInfoList.find(info => info.ID === home.homeID);
                            if (!matchingHomeInfo) {
                                this.log.error(`Configured feed for Home ID: ${home.homeID} not found in current data from Tibber server - delete the configuration line or verify any faults in your Tibber connection`);
                                continue;
                            }
                            if (result.some(info => info.ID === matchingHomeInfo.ID)) {
                                this.log.warn(`Double configuration of Home ID: ${home.homeID} found - please remove obsolete line in config - data of first instance will be used`);
                                continue;
                            }
                            matchingHomeInfo.FeedActive = home.feedActive;
                            matchingHomeInfo.PriceDataPollActive = home.priceDataPollActive;
                            result.push(matchingHomeInfo);
                        }
                        for (const homeInfo of this.homeInfoList) {
                            this.log.debug(`Feed Config for Home: ${homeInfo.NameInApp} (${homeInfo.ID}) - realtime data available: ${homeInfo.RealTime} - feed configured as active: ${homeInfo.FeedActive}`);
                            this.log.debug(`Price Poll Config for Home: ${homeInfo.NameInApp} (${homeInfo.ID}) - poll configured as active: ${homeInfo.PriceDataPollActive}`);
                        }
                    }
                }
                else {
                    this.log.warn(`No configuration of Tibber Pulse feeds found! Please configure to get live data - or configure your home(s) to discard live data`);
                }
            }
            catch (error) {
                this.log.error(tibberAPICaller.generateErrorMessage(error, `pull of homes from Tibber-Server`));
            }
            // if feed is not used - set info.connection if data received
            if (this.config.HomesList?.every(info => !info.feedActive)) {
                if (this.homeInfoList.length > 0) {
                    void this.setState("info.connection", true, true);
                    this.log.debug(`Connection Check: Feed not enabled and I received home list from api - good connection`);
                }
                else {
                    void this.setState("info.connection", false, true);
                    this.log.debug(`Connection Check: Feed not enabled and I do not get home list from api - bad connection`);
                }
            }
            // sentry.io ping
            if (this.supportsFeature && this.supportsFeature("PLUGINS")) {
                const sentryInstance = this.getPluginInstance("sentry");
                const today = new Date();
                const last = await this.getStateAsync("info.LastSentryLogDay");
                const pulseLocal = this.config.UseLocalPulseData ? 1 : 0;
                if (last?.val != today.getDate()) {
                    this.tibberCalculator.updateCalculatorUsageStats();
                    if (sentryInstance) {
                        const Sentry = sentryInstance.getSentryObject();
                        Sentry &&
                            Sentry.withScope((scope) => {
                                scope.setLevel("info");
                                scope.setTag("SentryDay", today.getDate());
                                scope.setTag("HomeIDs", this.homeInfoList.length);
                                scope.setTag("LocalPulse", pulseLocal);
                                scope.setTag("numBestCost", this.tibberCalculator.numBestCost);
                                scope.setTag("numBestCostLTF", this.tibberCalculator.numBestCostLTF);
                                scope.setTag("numBestHoursBlock", this.tibberCalculator.numBestHoursBlock);
                                scope.setTag("numBestHoursBlockLTF", this.tibberCalculator.numBestHoursBlockLTF);
                                scope.setTag("numBestSingleHours", this.tibberCalculator.numBestSingleHours);
                                scope.setTag("numBestSingleHoursLTF", this.tibberCalculator.numBestSingleHoursLTF);
                                scope.setTag("numSmartBatteryBuffer", this.tibberCalculator.numSmartBatteryBuffer);
                                Sentry.captureMessage("Adapter TibberLink started", "info");
                            });
                    }
                    void this.setState("info.LastSentryLogDay", { val: today.getDate(), ack: true });
                }
            }
            // if no homeIDs available - adapter can't do that much and restarts
            if (this.homeInfoList.length === 0) {
                this.log.warn(`Got no homes in your account - probably by a Tibber Server Error - adapter restarts in 2 minutes`);
                await this.delay(2 * 60 * 1000);
                this.restart();
            }
            // if there are any homes the adapter will do something
            // Init load data and calculator for all homes
            if (this.homeInfoList.length > 0) {
                const tibberCalculator = new tibberCalculator_1.TibberCalculator(this);
                // Set up calculation channel states if configured
                if (this.config.UseCalculator) {
                    try {
                        this.log.info(`Setting up calculator states for ${this.config.CalculatorList.length} channels`);
                        for (const channel in this.config.CalculatorList) {
                            await tibberCalculator.setupCalculatorStates(this.config.CalculatorList[channel].chHomeID, parseInt(channel));
                        }
                    }
                    catch (error) {
                        this.log.warn(tibberAPICaller.generateErrorMessage(error, `setup of calculator states`));
                    }
                }
                // Local Bridge Call - WiP move this... could be used without Tibber contract
                // Set up Pulse local polls if configured
                const tibberLocal = new tibberLocal_1.TibberLocal(this);
                if (this.config.UseLocalPulseData) {
                    try {
                        this.log.info(`Setting up local poll of consumption data for ${this.config.PulseList.length} pulse module(s)`);
                        for (const pulse in this.config.PulseList) {
                            tibberLocal.setupOnePulseLocal(parseInt(pulse));
                        }
                    }
                    catch (error) {
                        this.log.warn(tibberAPICaller.generateErrorMessage(error, `setup of local Pulse data poll`));
                    }
                }
                //Local Bridge Call
                // (force) get current prices and start calculator tasks once for the FIRST time
                await tibberAPICaller.updateCurrentPriceAllHomes(this.homeInfoList, true);
                void this.jobPricesTodayLOOP(tibberAPICaller);
                void this.jobPricesTomorrowLOOP(tibberAPICaller);
                void tibberCalculator.startCalculatorTasks(false, true);
                // Get consumption data for the first time
                void tibberAPICaller.updateConsumptionAllHomes();
                const jobCurrentPrice = cron_1.CronJob.from({
                    cronTime: "20 57 * * * *", //"20 58 * * * *" = 2 minutes before 00:00:20 jede Stunde => 00:01:20 - 00:03:20
                    onTick: async () => {
                        let okPrice = false;
                        do {
                            await this.delay(this.getRandomDelay(3, 5));
                            okPrice = await tibberAPICaller.updateCurrentPriceAllHomes(this.homeInfoList);
                            this.log.debug(`Cron job CurrentPrice - okPrice: ${okPrice}`);
                        } while (!okPrice);
                        void tibberCalculator.startCalculatorTasks();
                        void tibberAPICaller.updateConsumptionAllHomes();
                    },
                    start: true,
                    timeZone: "system",
                    runOnInit: false,
                });
                if (jobCurrentPrice) {
                    this.cronList.push(jobCurrentPrice);
                }
                const jobPricesToday = cron_1.CronJob.from({
                    cronTime: "20 56 23 * * *", //"20 56 23 * * *" = 5 minutes before 00:01:20 => 00:00:20 - 00:02:20 for first try
                    onTick: async () => {
                        let okPrice = false;
                        do {
                            await this.delay(this.getRandomDelay(4, 6));
                            await tibberAPICaller.updatePricesTomorrowAllHomes(this.homeInfoList);
                            okPrice = await tibberAPICaller.updatePricesTodayAllHomes(this.homeInfoList);
                            this.log.debug(`Cron job PricesToday - okPrice: ${okPrice}`);
                        } while (!okPrice);
                        void tibberCalculator.startCalculatorTasks();
                    },
                    start: true,
                    timeZone: "system",
                    runOnInit: true,
                });
                if (jobPricesToday) {
                    this.cronList.push(jobPricesToday);
                }
                const jobPricesTomorrow = cron_1.CronJob.from({
                    cronTime: "20 56 12 * * *", //"20 56 12 * * *" = 5 minutes before 13:01:20 => 13:00:20 - 13:02:20 for first try
                    onTick: async () => {
                        let okPrice = false;
                        do {
                            await this.delay(this.getRandomDelay(4, 6));
                            okPrice = await tibberAPICaller.updatePricesTomorrowAllHomes(this.homeInfoList);
                            this.log.debug(`Cron job PricesTomorrow - okPrice: ${okPrice}`);
                        } while (!okPrice);
                        void tibberCalculator.startCalculatorTasks();
                    },
                    start: true,
                    timeZone: "system",
                    runOnInit: true,
                });
                if (jobPricesTomorrow) {
                    this.cronList.push(jobPricesTomorrow);
                }
                //#region *** If user uses live feed - start feed connection ***
                if (this.homeInfoList.some(info => info.FeedActive)) {
                    // array with configs of feeds, init with base data set
                    const tibberFeedConfigs = Array.from({ length: this.homeInfoList.length }, () => {
                        return {
                            active: true,
                            apiEndpoint: {
                                apiKey: this.config.TibberAPIToken,
                                queryUrl: this.queryUrl,
                                userAgent: `${this.config.TibberAPIToken.slice(5, 20).split("").reverse().join("")}${Date.now()}`,
                            },
                            timestamp: true,
                        };
                    });
                    const tibberPulseInstances = new Array(this.homeInfoList.length); // array for TibberPulse-instances
                    if (!this.homeInfoList.some(homeInfo => homeInfo.ID == `None available - restart adapter after entering token`)) {
                        await this.delObjectAsync(`Homes.None available - restart adapter after entering token`, { recursive: true });
                    }
                    // eslint-disable-next-line @typescript-eslint/no-for-in-array
                    for (const index in this.homeInfoList) {
                        if (!this.homeInfoList[index].FeedActive || !this.homeInfoList[index].RealTime) {
                            this.log.warn(`skipping feed of live data - no Pulse configured for this home according to Tibber server`);
                            continue;
                        }
                        this.log.debug(`Trying to establish feed of live data for home: ${this.homeInfoList[index].ID}`);
                        try {
                            // define the fields for datafeed
                            tibberFeedConfigs[index].homeId = this.homeInfoList[index].ID;
                            tibberFeedConfigs[index].power = true;
                            if (this.config.FeedConfigLastMeterConsumption) {
                                tibberFeedConfigs[index].lastMeterConsumption = true;
                            }
                            if (this.config.FeedConfigAccumulatedConsumption) {
                                tibberFeedConfigs[index].accumulatedConsumption = true;
                            }
                            if (this.config.FeedConfigAccumulatedProduction) {
                                tibberFeedConfigs[index].accumulatedProduction = true;
                            }
                            if (this.config.FeedConfigAccumulatedConsumptionLastHour) {
                                tibberFeedConfigs[index].accumulatedConsumptionLastHour = true;
                            }
                            if (this.config.FeedConfigAccumulatedProductionLastHour) {
                                tibberFeedConfigs[index].accumulatedProductionLastHour = true;
                            }
                            if (this.config.FeedConfigAccumulatedCost) {
                                tibberFeedConfigs[index].accumulatedCost = true;
                            }
                            if (this.config.FeedConfigAccumulatedCost) {
                                tibberFeedConfigs[index].accumulatedReward = true;
                            }
                            if (this.config.FeedConfigCurrency) {
                                tibberFeedConfigs[index].currency = true;
                            }
                            if (this.config.FeedConfigMinPower) {
                                tibberFeedConfigs[index].minPower = true;
                            }
                            if (this.config.FeedConfigAveragePower) {
                                tibberFeedConfigs[index].averagePower = true;
                            }
                            if (this.config.FeedConfigMaxPower) {
                                tibberFeedConfigs[index].maxPower = true;
                            }
                            if (this.config.FeedConfigPowerProduction) {
                                tibberFeedConfigs[index].powerProduction = true;
                            }
                            if (this.config.FeedConfigMinPowerProduction) {
                                tibberFeedConfigs[index].minPowerProduction = true;
                            }
                            if (this.config.FeedConfigMaxPowerProduction) {
                                tibberFeedConfigs[index].maxPowerProduction = true;
                            }
                            if (this.config.FeedConfigLastMeterProduction) {
                                tibberFeedConfigs[index].lastMeterProduction = true;
                            }
                            if (this.config.FeedConfigPowerFactor) {
                                tibberFeedConfigs[index].powerFactor = true;
                            }
                            if (this.config.FeedConfigVoltagePhase1) {
                                tibberFeedConfigs[index].voltagePhase1 = true;
                            }
                            if (this.config.FeedConfigVoltagePhase2) {
                                tibberFeedConfigs[index].voltagePhase2 = true;
                            }
                            if (this.config.FeedConfigVoltagePhase3) {
                                tibberFeedConfigs[index].voltagePhase3 = true;
                            }
                            if (this.config.FeedConfigCurrentL1) {
                                tibberFeedConfigs[index].currentL1 = true;
                            }
                            if (this.config.FeedConfigCurrentL2) {
                                tibberFeedConfigs[index].currentL2 = true;
                            }
                            if (this.config.FeedConfigCurrentL3) {
                                tibberFeedConfigs[index].currentL3 = true;
                            }
                            if (this.config.FeedConfigSignalStrength) {
                                tibberFeedConfigs[index].signalStrength = true;
                            }
                            tibberPulseInstances[index] = new tibberPulse_1.TibberPulse(tibberFeedConfigs[index], this); // add new instance to array
                            tibberPulseInstances[index].ConnectPulseStream();
                        }
                        catch (error) {
                            this.log.warn(error.message);
                        }
                    }
                }
                //#endregion
            }
        }
    }
    /**
     * subfunction to loop till prices today for all homes are got from server - adapter startup-phase
     *
     * @param tibberAPICaller - TibberAPICaller
     */
    async jobPricesTodayLOOP(tibberAPICaller) {
        let okPrice = false;
        do {
            okPrice = await tibberAPICaller.updatePricesTodayAllHomes(this.homeInfoList, true);
            this.log.debug(`Loop job PricesToday - okPrice: ${okPrice}`);
            await this.delay(this.getRandomDelay(4, 6));
        } while (!okPrice);
    }
    /**
     * subfunction to loop till prices tomorrow for all homes are got from server - adapter startup-phase
     *
     * @param tibberAPICaller - TibberAPICaller
     */
    async jobPricesTomorrowLOOP(tibberAPICaller) {
        let okPrice = false;
        do {
            okPrice = await tibberAPICaller.updatePricesTomorrowAllHomes(this.homeInfoList, true);
            this.log.debug(`Loop job PricesTomorrow - okPrice: ${okPrice}`);
            await this.delay(this.getRandomDelay(4, 6));
        } while (!okPrice);
    }
    /**
     * generates random delay time in milliseconds between min minutes and max minutes
     *
     * @param minMinutes - minimum minutes of delay as number
     * @param maxMinutes - maximum minutes of delay as number
     * @returns delay - milliseconds as integer
     */
    getRandomDelay = (minMinutes, maxMinutes) => {
        if (minMinutes >= maxMinutes) {
            throw new Error("minMinutes should be less than maxMinutes");
        }
        const randomMinutes = Math.random() * (maxMinutes - minMinutes) + minMinutes;
        return Math.floor(randomMinutes * 60 * 1000);
    };
    /**
     * Is called from adapter config screen
     *
     * @param obj - any
     */
    onMessage(obj) {
        if (obj) {
            switch (obj.command) {
                case "HomesForConfig":
                    if (obj.callback) {
                        try {
                            if (this.homeInfoList.length > 0) {
                                this.sendTo(obj.from, obj.command, this.homeInfoList.map(item => ({
                                    label: `${item.NameInApp} (${item.ID})`,
                                    value: item.ID,
                                })), obj.callback);
                            }
                            else {
                                this.log.warn(`No Homes available to config TibberLink`);
                                this.sendTo(obj.from, obj.command, [{ label: "None available", value: "None available" }], obj.callback);
                            }
                        }
                        catch {
                            this.sendTo(obj.from, obj.command, [{ label: "None available", value: "None available" }], obj.callback);
                        }
                    }
                    break;
                case "HomesForCalculator":
                    if (obj.callback) {
                        try {
                            if (this.homeInfoList.length > 0) {
                                this.sendTo(obj.from, obj.command, this.homeInfoList.map(item => ({
                                    //label: `${item.NameInApp} (${item.ID.substring(item.ID.lastIndexOf("-") + 1)})`,
                                    label: `${item.NameInApp} (...${item.ID.slice(-8)})`,
                                    value: item.ID,
                                })), obj.callback);
                            }
                            else {
                                this.log.warn(`No Homes available to config TibberLink Calculator`);
                                this.sendTo(obj.from, obj.command, [{ label: "None available", value: "None available" }], obj.callback);
                            }
                        }
                        catch {
                            this.sendTo(obj.from, obj.command, [{ label: "None available", value: "None available" }], obj.callback);
                        }
                    }
                    break;
            }
        }
    }
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param callback - void
     */
    onUnload(callback) {
        try {
            // Here you must clear all timeouts or intervals that may still be active
            for (const cronJob of this.cronList) {
                cronJob.stop();
            }
            if (this.config.UseLocalPulseData) {
                //WiP call shutdown in tibberLocal
            }
            void this.setState("info.connection", false, true);
            callback();
        }
        catch (e) {
            this.log.warn(e.message);
            callback();
        }
    }
    /**
     * Is called if a subscribed state changes
     *
     * @param id - state ID
     * @param state - ioBroker state object
     */
    onStateChange(id, state) {
        try {
            if (state) {
                // The state was changed
                // this.adapter.subscribeStates(`Homes.${homeId}.Calculations.${channel}.*`);
                if (!state.ack) {
                    this.log.debug(`state change detected and parsing for id: ${id} - state: ${state.val}`);
                    if (id.includes(`.Calculations.`)) {
                        const statePath = id.split(".");
                        const homeIDToMatch = statePath[3];
                        const calcChannel = parseInt(statePath[5]);
                        const settingType = statePath[6];
                        if (!isNaN(calcChannel) && calcChannel < this.config.CalculatorList.length && settingType !== undefined) {
                            if (this.config.CalculatorList[calcChannel].chHomeID === homeIDToMatch) {
                                switch (settingType) {
                                    case "Active":
                                        // Update .chActive based on state.val if it's a boolean
                                        if (typeof state.val === "boolean") {
                                            this.config.CalculatorList[calcChannel].chActive = state.val;
                                            this.log.debug(`calculator settings state in home: ${homeIDToMatch} - channel: ${calcChannel} - changed to Active: ${this.config.CalculatorList[calcChannel].chActive}`);
                                            void this.setState(id, state.val, true); // set acknowledge true
                                        }
                                        else {
                                            this.log.warn(`Wrong type for channel: ${calcChannel} - chActive: ${state.val}`);
                                        }
                                        break;
                                    case "TriggerPrice":
                                        // Update .chTriggerPrice based on state.val if it's a number
                                        if (typeof state.val === "number") {
                                            this.config.CalculatorList[calcChannel].chTriggerPrice = state.val;
                                            this.log.debug(`calculator settings state in home: ${homeIDToMatch} - channel: ${calcChannel} - changed to TriggerPrice: ${this.config.CalculatorList[calcChannel].chTriggerPrice}`);
                                            void this.setState(id, state.val, true);
                                        }
                                        else {
                                            this.log.warn(`Wrong type for channel: ${calcChannel} - chTriggerPrice: ${state.val}`);
                                        }
                                        break;
                                    case "AmountHours":
                                        // Update .chAmountHours based on state.val if it's a number
                                        if (typeof state.val === "number") {
                                            this.config.CalculatorList[calcChannel].chAmountHours = state.val;
                                            this.log.debug(`calculator settings state in home: ${homeIDToMatch} - channel: ${calcChannel} - changed to AmountHours: ${this.config.CalculatorList[calcChannel].chAmountHours}`);
                                            void this.setState(id, state.val, true);
                                        }
                                        else {
                                            this.log.warn(`Wrong type for channel: ${calcChannel} - chAmountHours: ${state.val}`);
                                        }
                                        break;
                                    case "StartTime":
                                        // Update .chStartTime based on state.val if it's a datetime
                                        if (typeof state.val === "string") {
                                            // Check if the string is in ISO-8601 format with a timezone offset
                                            // like: "2023-11-17T21:00:00.000+01:00"
                                            const iso8601RegEx = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})[.]\d{3}Z?([+-]\d{2}:\d{2})?$/;
                                            if (iso8601RegEx.test(state.val)) {
                                                const dateWithTimeZone = new Date(state.val);
                                                // floor to hour
                                                dateWithTimeZone.setMinutes(0, 0, 0);
                                                this.config.CalculatorList[calcChannel].chStartTime = dateWithTimeZone;
                                                this.log.debug(`calculator settings state in home: ${homeIDToMatch} - channel: ${calcChannel} - changed to StartTime: ${(0, date_fns_1.format)(dateWithTimeZone, "yyyy-MM-dd'T'HH:mm:ss.SSSXXX")}`);
                                                void this.setState(id, (0, date_fns_1.format)(dateWithTimeZone, "yyyy-MM-dd'T'HH:mm:ss.SSSXXX"), true);
                                            }
                                            else {
                                                this.log.warn(`Invalid ISO-8601 format or missing timezone offset for channel: ${calcChannel} - chStartTime: ${state.val}`);
                                            }
                                        }
                                        else {
                                            this.log.warn(`Wrong type for channel: ${calcChannel} - chStartTime: ${state.val}`);
                                        }
                                        break;
                                    case "StopTime":
                                        // Update .chStopTime based on state.val if it's a datetime
                                        if (typeof state.val === "string") {
                                            // Check if the string is in ISO-8601 format with a timezone offset
                                            // like: "2023-11-17T21:00:00.000+01:00"
                                            const iso8601RegEx = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})[.]\d{3}Z?([+-]\d{2}:\d{2})?$/;
                                            if (iso8601RegEx.test(state.val)) {
                                                const dateWithTimeZone = new Date(state.val);
                                                // floor to hour
                                                dateWithTimeZone.setMinutes(0, 0, 0);
                                                this.config.CalculatorList[calcChannel].chStopTime = dateWithTimeZone;
                                                // WIP 3.5.4 START Warn long LTF
                                                // Get StartTime directly as a Date object
                                                const startTime = this.config.CalculatorList[calcChannel].chStartTime;
                                                // Check if StopTime is not the same day or the next day as StartTime
                                                if (!(0, date_fns_1.isSameDay)(dateWithTimeZone, startTime) && !(0, date_fns_1.isSameDay)(dateWithTimeZone, (0, date_fns_1.addDays)(startTime, 1))) {
                                                    this.log.warn(`StopTime for channel ${calcChannel} is not the same or next day as StartTime! StartTime: ${startTime.toISOString()}, StopTime: ${dateWithTimeZone.toISOString()}`);
                                                    this.log.warn(`Setting StopTime outside the feasible range (same or next day as StartTime) can lead to errors in calculations or unexpected behavior. Please verify your configuration.`);
                                                }
                                                // WIP 3.5.4 STOP
                                                this.log.debug(`calculator settings state in home: ${homeIDToMatch} - channel: ${calcChannel} - changed to StopTime: ${(0, date_fns_1.format)(dateWithTimeZone, "yyyy-MM-dd'T'HH:mm:ss.SSSXXX")}`);
                                                void this.setState(id, (0, date_fns_1.format)(dateWithTimeZone, "yyyy-MM-dd'T'HH:mm:ss.SSSXXX"), true);
                                            }
                                            else {
                                                this.log.warn(`Invalid ISO-8601 format or missing timezone offset for channel: ${calcChannel} - chStopTime: ${state.val}`);
                                            }
                                        }
                                        else {
                                            this.log.warn(`Wrong type for channel: ${calcChannel} - chStopTime: ${state.val}`);
                                        }
                                        break;
                                    case "RepeatDays":
                                        // Update .chRepeatDays based on state.val if it's a number
                                        if (typeof state.val === "number") {
                                            this.config.CalculatorList[calcChannel].chRepeatDays = state.val;
                                            this.log.debug(`calculator settings state in home: ${homeIDToMatch} - channel: ${calcChannel} - changed to RepeatDays: ${this.config.CalculatorList[calcChannel].chRepeatDays}`);
                                            void this.setState(id, state.val, true);
                                        }
                                        else {
                                            this.log.warn(`Wrong type for channel: ${calcChannel} - chRepeatDays: ${state.val}`);
                                        }
                                        break;
                                    case "EfficiencyLoss":
                                        // Update .chEfficiencyLoss based on state.val if it's a number
                                        if (typeof state.val === "number") {
                                            this.config.CalculatorList[calcChannel].chEfficiencyLoss = state.val;
                                            this.log.debug(`calculator settings state in home: ${homeIDToMatch} - channel: ${calcChannel} - changed to EfficiencyLoss: ${this.config.CalculatorList[calcChannel].chEfficiencyLoss}`);
                                            void this.setState(id, state.val, true);
                                        }
                                        else {
                                            this.log.warn(`Wrong type for channel: ${calcChannel} - chEfficiencyLoss: ${state.val}`);
                                        }
                                        break;
                                    default:
                                        this.log.debug(`unknown value for setting type: ${settingType}`);
                                }
                                void this.tibberCalculator.startCalculatorTasks(true);
                            }
                            else {
                                this.log.debug(`wrong index values in state ID or missing value for settingType`);
                            }
                        }
                    }
                }
            }
            else {
                // The state was deleted
                this.log.warn(`state ${id} deleted`);
            }
        }
        catch (e) {
            this.log.error(`Unhandled exception processing onstateChange: ${e}`);
        }
    }
}
if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options) => new Tibberlink(options);
}
else {
    // otherwise start the instance directly
    (() => new Tibberlink())();
}
//# sourceMappingURL=main.js.map