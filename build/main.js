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
const utils = __importStar(require("@iobroker/adapter-core"));
const cron_1 = require("cron");
const date_fns_1 = require("date-fns");
const tibberAPICaller_js_1 = require("./lib/tibberAPICaller.js");
const tibberCalculator_js_1 = require("./lib/tibberCalculator.js");
const tibberCharts_js_1 = require("./lib/tibberCharts.js");
const tibberLocal_js_1 = require("./lib/tibberLocal.js");
const tibberPulse_js_1 = require("./lib/tibberPulse.js");
class Tibberlink extends utils.Adapter {
    constructor(options = {}) {
        super({
            ...options,
            name: "tibberlink",
        });
        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        this.on("message", this.onMessage.bind(this));
        this.on("unload", this.onUnload.bind(this));
        this.homeInfoList = [];
        this.cronList = [];
        this.queryUrl = "https://api.tibber.com/v1-beta/gql";
    }
    cronList;
    homeInfoList = [];
    queryUrl = "";
    tibberCalculator = new tibberCalculator_js_1.TibberCalculator(this);
    tibberCharts = new tibberCharts_js_1.TibberCharts(this);
    async onReady() {
        if (!this.config.TibberAPIToken && !this.config.UseLocalPulseData) {
            this.log.error(`Missing API Token - please check configuration`);
            void this.setState(`info.connection`, false, true);
        }
        if (this.config.UseLocalPulseData) {
            const tibberLocal = new tibberLocal_js_1.TibberLocal(this);
            try {
                this.log.info(`Setting up local poll of consumption data for ${this.config.PulseList.length} pulse module(s)`);
                this.config.PulseList.forEach((_pulse, index) => {
                    tibberLocal.setupOnePulseLocal(index);
                });
            }
            catch (error) {
                this.log.warn(`Error in setup of local Pulse data poll: ${error}`);
            }
        }
        if (this.config.TibberAPIToken) {
            const tibberConfigAPI = {
                active: true,
                apiEndpoint: {
                    apiKey: this.config.TibberAPIToken,
                    queryUrl: this.queryUrl,
                    userAgent: `${this.config.TibberAPIToken.slice(5, 20).split("").reverse().join("")}${Date.now()}`,
                },
            };
            const tibberAPICaller = new tibberAPICaller_js_1.TibberAPICaller(tibberConfigAPI, this);
            try {
                this.homeInfoList = await tibberAPICaller.updateHomesFromAPI();
                if (this.config.HomesList.length > 0) {
                    if (this.homeInfoList.length > 0) {
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
            if (this.supportsFeature && this.supportsFeature("PLUGINS")) {
                const sentryInstance = this.getPluginInstance("sentry");
                const today = new Date();
                const last = await this.getStateAsync("info.LastSentryLogDay");
                const pulseLocal = this.config.UseLocalPulseData ? 1 : 0;
                if ((Number(last?.val) || 0) < today.getDate() + 3) {
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
                                scope.setTag("numBestPercentage", this.tibberCalculator.numBestPercentage);
                                scope.setTag("numBestPercentageLTF", this.tibberCalculator.numBestPercentageLTF);
                                Sentry.captureMessage("Adapter TibberLink started", "info");
                            });
                    }
                    void this.setState("info.LastSentryLogDay", { val: today.getDate(), ack: true });
                }
            }
            if (this.homeInfoList.length === 0) {
                this.log.warn(`Got no homes in your account - probably by a Tibber Server Error - adapter restarts in 2 minutes`);
                await this.delay(2 * 60 * 1000);
                this.restart();
            }
            if (this.homeInfoList.length > 0) {
                const tibberCalculator = new tibberCalculator_js_1.TibberCalculator(this);
                if (this.config.UseCalculator) {
                    try {
                        this.log.info(`Setting up calculator states for ${this.config.CalculatorList.length} channels`);
                        this.config.CalculatorList.forEach(async (channel, index) => {
                            await tibberCalculator.setupCalculatorStates(channel.chHomeID, index);
                        });
                    }
                    catch (error) {
                        this.log.warn(tibberAPICaller.generateErrorMessage(error, `setup of calculator states`));
                    }
                }
                await tibberAPICaller.updateCurrentPriceAllHomes(this.homeInfoList, true);
                void this.jobPricesTodayLOOP(tibberAPICaller);
                void this.jobPricesTomorrowLOOP(tibberAPICaller);
                void tibberCalculator.startCalculatorTasks(false, true);
                void tibberAPICaller.updateConsumptionAllHomes();
                void this.tibberCharts.generateFlexChartJSONAllHomes(this.homeInfoList);
                const jobCurrentPrice = cron_1.CronJob.from({
                    cronTime: "20 57 * * * *",
                    onTick: async () => {
                        let okPrice = false;
                        do {
                            await this.delay(this.getRandomDelay(3, 5));
                            okPrice = await tibberAPICaller.updateCurrentPriceAllHomes(this.homeInfoList);
                            this.log.debug(`Cron job CurrentPrice - okPrice: ${okPrice}`);
                        } while (!okPrice);
                        void tibberCalculator.startCalculatorTasks();
                        void tibberAPICaller.updateConsumptionAllHomes();
                        void this.tibberCharts.generateFlexChartJSONAllHomes(this.homeInfoList);
                    },
                    start: true,
                    timeZone: "system",
                    runOnInit: false,
                });
                if (jobCurrentPrice) {
                    this.cronList.push(jobCurrentPrice);
                }
                const jobPricesToday = cron_1.CronJob.from({
                    cronTime: "20 56 23 * * *",
                    onTick: async () => {
                        let okPrice = false;
                        do {
                            await this.delay(this.getRandomDelay(4, 6));
                            await tibberAPICaller.updatePricesTomorrowAllHomes(this.homeInfoList);
                            okPrice = await tibberAPICaller.updatePricesTodayAllHomes(this.homeInfoList);
                            this.log.debug(`Cron job PricesToday - okPrice: ${okPrice}`);
                        } while (!okPrice);
                        void tibberCalculator.startCalculatorTasks();
                        void this.tibberCharts.generateFlexChartJSONAllHomes(this.homeInfoList);
                    },
                    start: true,
                    timeZone: "system",
                    runOnInit: true,
                });
                if (jobPricesToday) {
                    this.cronList.push(jobPricesToday);
                }
                const jobPricesTomorrow = cron_1.CronJob.from({
                    cronTime: "20 56 12 * * *",
                    onTick: async () => {
                        let okPrice = false;
                        do {
                            await this.delay(this.getRandomDelay(4, 6));
                            okPrice = await tibberAPICaller.updatePricesTomorrowAllHomes(this.homeInfoList);
                            this.log.debug(`Cron job PricesTomorrow - okPrice: ${okPrice}`);
                        } while (!okPrice);
                        void tibberCalculator.startCalculatorTasks();
                        void this.tibberCharts.generateFlexChartJSONAllHomes(this.homeInfoList);
                    },
                    start: true,
                    timeZone: "system",
                    runOnInit: true,
                });
                if (jobPricesTomorrow) {
                    this.cronList.push(jobPricesTomorrow);
                }
                if (this.homeInfoList.some(info => info.FeedActive)) {
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
                    const tibberPulseInstances = new Array(this.homeInfoList.length);
                    if (!this.homeInfoList.some(homeInfo => homeInfo.ID == `None available - restart adapter after entering token`)) {
                        await this.delObjectAsync(`Homes.None available - restart adapter after entering token`, { recursive: true });
                    }
                    this.homeInfoList.forEach((homeInfo, index) => {
                        if (!homeInfo.ID || !homeInfo.RealTime) {
                            this.log.warn(`skipping feed of live data - no Pulse configured for this home ${homeInfo.ID} according to Tibber server`);
                            return;
                        }
                        this.log.debug(`Trying to establish feed of live data for home: ${homeInfo.ID}`);
                        try {
                            tibberFeedConfigs[index].homeId = homeInfo.ID;
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
                            tibberPulseInstances[index] = new tibberPulse_js_1.TibberPulse(tibberFeedConfigs[index], this);
                            tibberPulseInstances[index].connectPulseStream();
                        }
                        catch (error) {
                            this.log.warn(error.message);
                        }
                    });
                }
            }
        }
    }
    async jobPricesTodayLOOP(tibberAPICaller) {
        let okPrice = false;
        do {
            okPrice = await tibberAPICaller.updatePricesTodayAllHomes(this.homeInfoList, true);
            this.log.debug(`Loop job PricesToday - okPrice: ${okPrice}`);
            await this.delay(this.getRandomDelay(4, 6));
        } while (!okPrice);
    }
    async jobPricesTomorrowLOOP(tibberAPICaller) {
        let okPrice = false;
        do {
            okPrice = await tibberAPICaller.updatePricesTomorrowAllHomes(this.homeInfoList, true);
            this.log.debug(`Loop job PricesTomorrow - okPrice: ${okPrice}`);
            await this.delay(this.getRandomDelay(4, 6));
        } while (!okPrice);
    }
    getRandomDelay = (minMinutes, maxMinutes) => {
        if (minMinutes >= maxMinutes) {
            throw new Error("minMinutes should be less than maxMinutes");
        }
        const randomMinutes = Math.random() * (maxMinutes - minMinutes) + minMinutes;
        return Math.floor(randomMinutes * 60 * 1000);
    };
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
    onUnload(callback) {
        try {
            for (const cronJob of this.cronList) {
                cronJob.stop();
            }
            if (this.config.UseLocalPulseData) {
            }
            void this.setState("info.connection", false, true);
            callback();
        }
        catch (e) {
            this.log.warn(e.message);
            callback();
        }
    }
    onStateChange(id, state) {
        try {
            if (state) {
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
                                        if (typeof state.val === "boolean") {
                                            this.config.CalculatorList[calcChannel].chActive = state.val;
                                            this.log.debug(`calculator settings state in home: ${homeIDToMatch} - channel: ${calcChannel} - changed to Active: ${this.config.CalculatorList[calcChannel].chActive}`);
                                            void this.setState(id, state.val, true);
                                        }
                                        else {
                                            this.log.warn(`Wrong type for channel: ${calcChannel} - chActive: ${state.val}`);
                                        }
                                        break;
                                    case "TriggerPrice":
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
                                        if (typeof state.val === "string") {
                                            const iso8601RegEx = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})[.]\d{3}Z?([+-]\d{2}:\d{2})?$/;
                                            if (iso8601RegEx.test(state.val)) {
                                                const dateWithTimeZone = new Date(state.val);
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
                                        if (typeof state.val === "string") {
                                            const iso8601RegEx = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})[.]\d{3}Z?([+-]\d{2}:\d{2})?$/;
                                            if (iso8601RegEx.test(state.val)) {
                                                const dateWithTimeZone = new Date(state.val);
                                                dateWithTimeZone.setMinutes(0, 0, 0);
                                                this.config.CalculatorList[calcChannel].chStopTime = dateWithTimeZone;
                                                const startTime = this.config.CalculatorList[calcChannel].chStartTime;
                                                if (!(0, date_fns_1.isSameDay)(dateWithTimeZone, startTime) && !(0, date_fns_1.isSameDay)(dateWithTimeZone, (0, date_fns_1.addDays)(startTime, 1))) {
                                                    this.log.warn(`StopTime for channel ${calcChannel} is not the same or next day as StartTime! StartTime: ${startTime.toISOString()}, StopTime: ${dateWithTimeZone.toISOString()}`);
                                                    this.log.warn(`Setting StopTime outside the feasible range (same or next day as StartTime) can lead to errors in calculations or unexpected behavior. Please verify your configuration.`);
                                                }
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
                                        if (typeof state.val === "number") {
                                            this.config.CalculatorList[calcChannel].chEfficiencyLoss = state.val;
                                            this.log.debug(`calculator settings state in home: ${homeIDToMatch} - channel: ${calcChannel} - changed to EfficiencyLoss: ${this.config.CalculatorList[calcChannel].chEfficiencyLoss}`);
                                            void this.setState(id, state.val, true);
                                        }
                                        else {
                                            this.log.warn(`Wrong type for channel: ${calcChannel} - chEfficiencyLoss: ${state.val}`);
                                        }
                                        break;
                                    case "Percentage":
                                        if (typeof state.val === "number") {
                                            this.config.CalculatorList[calcChannel].chPercentage = state.val;
                                            this.log.debug(`calculator settings state in home: ${homeIDToMatch} - channel: ${calcChannel} - changed to Percentage: ${this.config.CalculatorList[calcChannel].chPercentage}`);
                                            void this.setState(id, state.val, true);
                                        }
                                        else {
                                            this.log.warn(`Wrong type for channel: ${calcChannel} - chPercentage: ${state.val}`);
                                        }
                                        break;
                                    default:
                                        this.log.debug(`unknown value for setting type: ${settingType}`);
                                }
                                this.tibberCalculator
                                    .startCalculatorTasks(true)
                                    .then(() => this.tibberCharts.generateFlexChartJSONAllHomes(this.homeInfoList))
                                    .catch(error => this.log.error(`unknown error calling tasks after parameter update: ${error}`));
                            }
                            else {
                                this.log.debug(`wrong index values in state ID or missing value for settingType`);
                            }
                        }
                    }
                }
            }
            else {
                this.log.warn(`state ${id} deleted`);
            }
        }
        catch (e) {
            this.log.error(`Unhandled exception processing onstateChange: ${e}`);
        }
    }
}
if (require.main !== module) {
    module.exports = (options) => new Tibberlink(options);
}
else {
    (() => new Tibberlink())();
}
//# sourceMappingURL=main.js.map