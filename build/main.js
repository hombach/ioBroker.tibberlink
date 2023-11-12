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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
// The adapter-core module gives you access to the core ioBroker functions you need to create an adapter
const utils = __importStar(require("@iobroker/adapter-core"));
const cron_1 = require("cron");
const tibberAPICaller_1 = require("./lib/tibberAPICaller");
const tibberCalculator_1 = require("./lib/tibberCalculator");
const tibberPulse_1 = require("./lib/tibberPulse");
class Tibberlink extends utils.Adapter {
    constructor(options = {}) {
        super({
            ...options,
            name: "tibberlink",
        });
        this.homeInfoList = [];
        this.queryUrl = "";
        this.tibberCalculator = new tibberCalculator_1.TibberCalculator(this);
        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        // this.on("objectChange", this.onObjectChange.bind(this));
        this.on("message", this.onMessage.bind(this));
        this.on("unload", this.onUnload.bind(this));
        this.homeInfoList = [];
        this.cronList = [];
        this.queryUrl = "https://api.tibber.com/v1-beta/gql";
    }
    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Reset the connection indicator during startup;
        if (!this.config.TibberAPIToken) {
            // No Token defined in configuration
            this.log.error(`Missing API Token - please check configuration`);
            this.setState(`info.connection`, false, true);
        }
        else {
            // Need 2 configs - API and Feed (feed changed query url)
            const tibberConfigAPI = {
                active: true,
                apiEndpoint: {
                    apiKey: this.config.TibberAPIToken,
                    queryUrl: this.queryUrl,
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
                            const matchingHomeInfo = this.homeInfoList.find((info) => info.ID === home.homeID);
                            if (!matchingHomeInfo) {
                                this.log.error(`Configured feed for Home ID: ${home.homeID} not found in current data from Tibber server - delete the configuration line or verify any faults in your Tibber connection`);
                                continue;
                            }
                            if (result.some((info) => info.ID === matchingHomeInfo.ID)) {
                                this.log.warn(`Double configuration of Home ID: ${home.homeID} found - please remove obsolete line in config - data of first instance will be used`);
                                continue;
                            }
                            matchingHomeInfo.FeedActive = home.feedActive;
                            result.push(matchingHomeInfo);
                        }
                        for (const index in this.homeInfoList) {
                            this.log.debug(`FeedConfig for Home: ${this.homeInfoList[index].NameInApp} (${this.homeInfoList[index].ID}) - realtime data available: ${this.homeInfoList[index].RealTime} - feed configured as active: ${this.homeInfoList[index].FeedActive}`);
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
            if (this.config.HomesList?.every((info) => !info.feedActive)) {
                if (this.homeInfoList.length > 0) {
                    this.setState("info.connection", true, true);
                    this.log.debug(`Connection Check: Feed not enabled and I received home list from api - good connection`);
                }
                else {
                    this.setState("info.connection", false, true);
                    this.log.debug(`Connection Check: Feed not enabled and I do not get home list from api - bad connection`);
                }
            }
            // sentry.io ping
            if (this.supportsFeature && this.supportsFeature("PLUGINS")) {
                const sentryInstance = this.getPluginInstance("sentry");
                const today = new Date();
                const last = await this.getStateAsync("info.LastSentryLogDay");
                if (last?.val != (await today.getDate())) {
                    if (sentryInstance) {
                        const Sentry = sentryInstance.getSentryObject();
                        Sentry &&
                            Sentry.withScope((scope) => {
                                scope.setLevel("info");
                                scope.setTag("SentryDay", today.getDate());
                                scope.setTag("HomeIDs", this.homeInfoList.length);
                                Sentry.captureMessage("Adapter TibberLink started", "info"); // Level "info"
                            });
                    }
                    // this.setStateAsync("LastSentryLoggedError", { val: "unknown", ack: true }); // Clean last error every adapter start
                    this.setStateAsync("info.LastSentryLogDay", { val: today.getDate(), ack: true });
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
                        this.log.debug(`Setting up calculator states for ${this.config.CalculatorList.length} channels`);
                        for (const channel in this.config.CalculatorList) {
                            await tibberCalculator.setupCalculatorStates(this.config.CalculatorList[channel].chHomeID, parseInt(channel));
                        }
                    }
                    catch (error) {
                        this.log.warn(tibberAPICaller.generateErrorMessage(error, `setup of calculator states`));
                    }
                }
                // (force) get current prices for the first time and start calculator tasks once
                await tibberAPICaller.updateCurrentPriceAllHomes(this.homeInfoList, true);
                await tibberAPICaller.updatePricesTodayAllHomes(this.homeInfoList, true);
                await tibberAPICaller.updatePricesTomorrowAllHomes(this.homeInfoList, true);
                tibberCalculator.startCalculatorTasks();
                //for (const index in this.homeInfoList) {
                // Get consumption data for the first time
                // await tibberAPICaller.getConsumption(this.homeInfoList[index].ID);
                //}
                const jobCurrentPrice = cron_1.CronJob.from({
                    cronTime: "20 57 * * * *",
                    onTick: async () => {
                        let okPrice = false;
                        do {
                            await this.delay(3 * 60 * 1000);
                            okPrice = await tibberAPICaller.updateCurrentPriceAllHomes(this.homeInfoList);
                            this.log.debug(`Cron jobCurrentPrice - okPrice: ${okPrice}`);
                        } while (!okPrice);
                        tibberCalculator.startCalculatorTasks();
                    },
                    start: true,
                    timeZone: "system",
                    runOnInit: false,
                });
                if (jobCurrentPrice)
                    this.cronList.push(jobCurrentPrice);
                const jobPricesToday = cron_1.CronJob.from({
                    cronTime: "15 56 23 * * *",
                    onTick: async () => {
                        let okPrice = false;
                        do {
                            await this.delay(5 * 60 * 1000);
                            okPrice = await tibberAPICaller.updatePricesTodayAllHomes(this.homeInfoList);
                            this.log.debug(`Cron jobPricesToday - okPrice: ${okPrice}`);
                        } while (!okPrice);
                        await tibberAPICaller.updatePricesTomorrowAllHomes(this.homeInfoList);
                        tibberCalculator.startCalculatorTasks();
                    },
                    start: true,
                    timeZone: "system",
                    runOnInit: false,
                });
                if (jobPricesToday)
                    this.cronList.push(jobPricesToday);
                const jobPricesTomorrow = cron_1.CronJob.from({
                    cronTime: "15 56 12 * * *",
                    onTick: async () => {
                        let okPrice = false;
                        do {
                            await this.delay(5 * 60 * 1000);
                            okPrice = await tibberAPICaller.updatePricesTomorrowAllHomes(this.homeInfoList);
                            this.log.debug(`Cron jobPricesTomorrow - okPrice: ${okPrice}`);
                        } while (!okPrice);
                        tibberCalculator.startCalculatorTasks();
                    },
                    start: true,
                    timeZone: "system",
                    runOnInit: false,
                });
                if (jobPricesTomorrow)
                    this.cronList.push(jobPricesTomorrow);
                // If user uses live feed - start feed connection
                if (this.homeInfoList.some((info) => info.FeedActive)) {
                    // array with configs of feeds, init with base data set
                    const tibberFeedConfigs = Array.from({ length: this.homeInfoList.length }, () => {
                        return {
                            active: true,
                            apiEndpoint: {
                                apiKey: this.config.TibberAPIToken,
                                queryUrl: this.queryUrl,
                            },
                            timestamp: true,
                        };
                    });
                    const tibberPulseInstances = new Array(this.homeInfoList.length); // array for TibberPulse-instances
                    for (const index in this.homeInfoList) {
                        if (this.homeInfoList[index].FeedActive && this.homeInfoList[index].RealTime) {
                            this.log.debug(`Trying to establish feed of live data for home: ${this.homeInfoList[index].ID}`);
                            try {
                                // define the fields for datafeed
                                tibberFeedConfigs[index].homeId = this.homeInfoList[index].ID;
                                tibberFeedConfigs[index].power = true;
                                if (this.config.FeedConfigLastMeterConsumption)
                                    tibberFeedConfigs[index].lastMeterConsumption = true;
                                if (this.config.FeedConfigAccumulatedConsumption)
                                    tibberFeedConfigs[index].accumulatedConsumption = true;
                                if (this.config.FeedConfigAccumulatedProduction)
                                    tibberFeedConfigs[index].accumulatedProduction = true;
                                if (this.config.FeedConfigAccumulatedConsumptionLastHour)
                                    tibberFeedConfigs[index].accumulatedConsumptionLastHour = true;
                                if (this.config.FeedConfigAccumulatedProductionLastHour)
                                    tibberFeedConfigs[index].accumulatedProductionLastHour = true;
                                if (this.config.FeedConfigAccumulatedCost)
                                    tibberFeedConfigs[index].accumulatedCost = true;
                                if (this.config.FeedConfigAccumulatedCost)
                                    tibberFeedConfigs[index].accumulatedReward = true;
                                if (this.config.FeedConfigCurrency)
                                    tibberFeedConfigs[index].currency = true;
                                if (this.config.FeedConfigMinPower)
                                    tibberFeedConfigs[index].minPower = true;
                                if (this.config.FeedConfigAveragePower)
                                    tibberFeedConfigs[index].averagePower = true;
                                if (this.config.FeedConfigMaxPower)
                                    tibberFeedConfigs[index].maxPower = true;
                                if (this.config.FeedConfigPowerProduction)
                                    tibberFeedConfigs[index].powerProduction = true;
                                if (this.config.FeedConfigMinPowerProduction)
                                    tibberFeedConfigs[index].minPowerProduction = true;
                                if (this.config.FeedConfigMaxPowerProduction)
                                    tibberFeedConfigs[index].maxPowerProduction = true;
                                if (this.config.FeedConfigLastMeterProduction)
                                    tibberFeedConfigs[index].lastMeterProduction = true;
                                if (this.config.FeedConfigPowerFactor)
                                    tibberFeedConfigs[index].powerFactor = true;
                                if (this.config.FeedConfigVoltagePhase1)
                                    tibberFeedConfigs[index].voltagePhase1 = true;
                                if (this.config.FeedConfigVoltagePhase2)
                                    tibberFeedConfigs[index].voltagePhase2 = true;
                                if (this.config.FeedConfigVoltagePhase3)
                                    tibberFeedConfigs[index].voltagePhase3 = true;
                                if (this.config.FeedConfigCurrentL1)
                                    tibberFeedConfigs[index].currentL1 = true;
                                if (this.config.FeedConfigCurrentL2)
                                    tibberFeedConfigs[index].currentL2 = true;
                                if (this.config.FeedConfigCurrentL3)
                                    tibberFeedConfigs[index].currentL3 = true;
                                if (this.config.FeedConfigSignalStrength)
                                    tibberFeedConfigs[index].signalStrength = true;
                                tibberPulseInstances[index] = new tibberPulse_1.TibberPulse(tibberFeedConfigs[index], this); // add instance to array
                                tibberPulseInstances[index].ConnectPulseStream();
                            }
                            catch (e) {
                                this.log.warn(e.message);
                            }
                        }
                        else {
                            this.log.warn("skipping feed of live data - no Pulse configured for this home according to Tibber server");
                        }
                    }
                }
            }
        }
    }
    /**
     * Is called from adapter config screen
     */
    onMessage(obj) {
        if (obj) {
            switch (obj.command) {
                case "HomesForConfig":
                    if (obj.callback) {
                        try {
                            if (this.homeInfoList.length > 0) {
                                this.sendTo(obj.from, obj.command, this.homeInfoList.map((item) => ({
                                    label: `${item.NameInApp} (${item.ID})`,
                                    value: item.ID,
                                })), obj.callback);
                            }
                            else {
                                this.log.warn(`No Homes available to config TibberLink Calculator`);
                                this.sendTo(obj.from, obj.command, [{ label: "None available", value: "None available" }], obj.callback);
                            }
                        }
                        catch (error) {
                            this.sendTo(obj.from, obj.command, [{ label: "None available", value: "None available" }], obj.callback);
                        }
                    }
                    break;
            }
        }
    }
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    onUnload(callback) {
        try {
            // Here you must clear all timeouts or intervals that may still be active
            for (const index in this.cronList) {
                this.cronList[index].stop;
            }
            // clearTimeout(timeout);
            // info.connect to false, if adapter is closed
            this.setState("info.connection", false, true);
            callback();
        }
        catch (e) {
            this.log.warn(e.message);
            callback();
        }
    }
    /**
     * Is called if a subscribed state changes
     */
    onStateChange(id, state) {
        try {
            if (state) {
                // The state was changed
                // this.adapter.subscribeStates(`Homes.${homeId}.Calculations.${channel}.*`);
                if (!state.ack) {
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
                                            this.setStateAsync(id, state.val, true);
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
                                            this.setStateAsync(id, state.val, true);
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
                                            this.setStateAsync(id, state.val, true);
                                        }
                                        else {
                                            this.log.warn(`Wrong type for channel: ${calcChannel} - chAmountHours: ${state.val}`);
                                        }
                                        break;
                                    default:
                                        this.log.debug(`unknown value for setting type: ${settingType}`);
                                }
                                this.tibberCalculator.startCalculatorTasks();
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