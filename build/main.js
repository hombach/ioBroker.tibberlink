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
const tibberAPICaller_1 = require("./lib/tibberAPICaller");
const tibberPulse_1 = require("./lib/tibberPulse");
const tibberCalculator_1 = require("./lib/tibberCalculator");
class Tibberlink extends utils.Adapter {
    constructor(options = {}) {
        super({
            ...options,
            name: "tibberlink",
        });
        this.homeInfoList = [];
        this.queryUrl = "";
        this.on("ready", this.onReady.bind(this));
        // this.on("stateChange", this.onStateChange.bind(this));
        // this.on("objectChange", this.onObjectChange.bind(this));
        // this.on("message", this.onMessage.bind(this));
        this.on("unload", this.onUnload.bind(this));
        this.homeInfoList = [];
        this.intervallList = [];
        this.queryUrl = "https://api.tibber.com/v1-beta/gql";
    }
    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Reset the connection indicator during startup;
        if (!this.config.TibberAPIToken) {
            // No Token defined in configuration
            this.log.warn("Missing API Token - please check configuration");
            this.setState("info.connection", false, true);
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
            const tibberConfigFeed = {
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
            }
            catch (error) {
                this.log.error(tibberAPICaller.generateErrorMessage(error, "pull of homes from Tibber-Server"));
            }
            // if feed is not used - set info.connection if data received
            if (!this.config.FeedActive) {
                if (this.homeInfoList) {
                    this.setState("info.connection", true, true);
                    this.log.debug("Connection Check: Feed not enabled and I received home list from api - good connection");
                }
                else {
                    this.setState("info.connection", false, true);
                    this.log.debug("Connection Check: Feed not enabled and I do not get home list from api - bad connection");
                }
            }
            // sentry.io ping
            if (this.supportsFeature && this.supportsFeature("PLUGINS")) {
                const sentryInstance = this.getPluginInstance("sentry");
                const today = new Date();
                const last = await this.getStateAsync("info.LastSentryLogDay");
                if (last?.val != await today.getDate()) {
                    if (sentryInstance) {
                        const Sentry = sentryInstance.getSentryObject();
                        Sentry && Sentry.withScope((scope) => {
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
            if (!(this.homeInfoList.length > 0)) { // if no homeIDs available - adapter can't do that much
                this.log.warn("Got no homes in your account - probably by a Tibber Server Error- will restarting adapter in 2 minutes");
                const adapterrestart = this.setInterval(() => {
                    this.restart();
                }, 120000);
                this.intervallList.push(adapterrestart);
            }
            // Init Load Data for all homes
            if (this.homeInfoList.length > 0) { // only if there are any homes the adapter will do something
                const tibberCalculator = new tibberCalculator_1.TibberCalculator(this);
                for (const index in this.homeInfoList) {
                    // Set up calculation channel 1 states if channel is configured
                    if (this.config.CalCh01Configured) {
                        try {
                            await tibberCalculator.setupCalculatorStates(this.homeInfoList[index].ID, 1);
                            this.log.debug("setting up calculation channel 1 states");
                        }
                        catch (error) {
                            this.log.warn(tibberAPICaller.generateErrorMessage(error, "setup of calculation states for channel 01"));
                        }
                    }
                    // Get current price for the first time
                    try {
                        await tibberAPICaller.updateCurrentPrice(this.homeInfoList[index].ID);
                    }
                    catch (error) {
                        this.log.error(tibberAPICaller.generateErrorMessage(error, "first pull of current price"));
                    }
                    // Get today prices for the first time
                    try {
                        await tibberAPICaller.updatePricesToday(this.homeInfoList[index].ID);
                    }
                    catch (error) {
                        this.log.error(tibberAPICaller.generateErrorMessage(error, "first pull of prices today"));
                    }
                    // Get tomorrow prices for the first time
                    try {
                        await tibberAPICaller.updatePricesTomorrow(this.homeInfoList[index].ID);
                    }
                    catch (error) {
                        this.log.error(tibberAPICaller.generateErrorMessage(error, "first pull of prices tomorrow"));
                    }
                }
                const energyPriceCallIntervall = this.setInterval(() => {
                    for (const index in this.homeInfoList) {
                        try {
                            tibberAPICaller.updateCurrentPrice(this.homeInfoList[index].ID);
                        }
                        catch (error) {
                            this.log.warn(tibberAPICaller.generateErrorMessage(error, "pull of current price"));
                        }
                    }
                }, 300000);
                this.intervallList.push(energyPriceCallIntervall);
                const energyPricesListUpdateInterval = this.setInterval(() => {
                    for (const index in this.homeInfoList) {
                        try {
                            tibberAPICaller.updatePricesToday(this.homeInfoList[index].ID);
                        }
                        catch (error) {
                            this.log.warn(tibberAPICaller.generateErrorMessage(error, "pull of prices today"));
                        }
                        try {
                            tibberAPICaller.updatePricesTomorrow(this.homeInfoList[index].ID);
                        }
                        catch (error) {
                            this.log.warn(tibberAPICaller.generateErrorMessage(error, "pull of prices tomorrow"));
                        }
                    }
                }, 1500000);
                this.intervallList.push(energyPricesListUpdateInterval);
            }
            // If user uses live feed - start connection
            if (this.config.FeedActive) {
                const tibberPulseInstances = []; // array for TibberPulse-instances
                for (const index in this.homeInfoList) {
                    this.log.debug("try to establish feed of live data for home: " + this.homeInfoList[index].ID);
                    if (this.homeInfoList[index].RealTime) {
                        try {
                            // define the fields for datafeed
                            tibberConfigFeed.homeId = this.homeInfoList[index].ID; // ERROR: Only latest homeID will be used at this point
                            tibberConfigFeed.timestamp = true;
                            tibberConfigFeed.power = true;
                            if (this.config.FeedConfigLastMeterConsumption) {
                                tibberConfigFeed.lastMeterConsumption = true;
                            }
                            if (this.config.FeedConfigAccumulatedConsumption) {
                                tibberConfigFeed.accumulatedConsumption = true;
                            }
                            if (this.config.FeedConfigAccumulatedProduction) {
                                tibberConfigFeed.accumulatedProduction = true;
                            }
                            if (this.config.FeedConfigAccumulatedConsumptionLastHour) {
                                tibberConfigFeed.accumulatedConsumptionLastHour = true;
                            }
                            if (this.config.FeedConfigAccumulatedProductionLastHour) {
                                tibberConfigFeed.accumulatedProductionLastHour = true;
                            }
                            if (this.config.FeedConfigAccumulatedCost) {
                                tibberConfigFeed.accumulatedCost = true;
                            }
                            if (this.config.FeedConfigAccumulatedCost) {
                                tibberConfigFeed.accumulatedReward = true;
                            }
                            if (this.config.FeedConfigCurrency) {
                                tibberConfigFeed.currency = true;
                            }
                            if (this.config.FeedConfigMinPower) {
                                tibberConfigFeed.minPower = true;
                            }
                            if (this.config.FeedConfigAveragePower) {
                                tibberConfigFeed.averagePower = true;
                            }
                            if (this.config.FeedConfigMaxPower) {
                                tibberConfigFeed.maxPower = true;
                            }
                            if (this.config.FeedConfigPowerProduction) {
                                tibberConfigFeed.powerProduction = true;
                            }
                            if (this.config.FeedConfigMinPowerProduction) {
                                tibberConfigFeed.minPowerProduction = true;
                            }
                            if (this.config.FeedConfigMaxPowerProduction) {
                                tibberConfigFeed.maxPowerProduction = true;
                            }
                            if (this.config.FeedConfigLastMeterProduction) {
                                tibberConfigFeed.lastMeterProduction = true;
                            }
                            if (this.config.FeedConfigPowerFactor) {
                                tibberConfigFeed.powerFactor = true;
                            }
                            if (this.config.FeedConfigVoltagePhase1) {
                                tibberConfigFeed.voltagePhase1 = true;
                            }
                            if (this.config.FeedConfigVoltagePhase2) {
                                tibberConfigFeed.voltagePhase2 = true;
                            }
                            if (this.config.FeedConfigVoltagePhase3) {
                                tibberConfigFeed.voltagePhase3 = true;
                            }
                            if (this.config.FeedConfigCurrentL1) {
                                tibberConfigFeed.currentL1 = true;
                            }
                            if (this.config.FeedConfigCurrentL2) {
                                tibberConfigFeed.currentL2 = true;
                            }
                            if (this.config.FeedConfigCurrentL3) {
                                tibberConfigFeed.currentL3 = true;
                            }
                            if (this.config.FeedConfigSignalStrength) {
                                tibberConfigFeed.signalStrength = true;
                            }
                            const tibberPulse = new tibberPulse_1.TibberPulse(tibberConfigFeed, this);
                            tibberPulseInstances.push(tibberPulse); // add instance to array
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
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    onUnload(callback) {
        try {
            // Here you must clear all timeouts or intervals that may still be active
            // clearTimeout(timeout1);
            for (const index in this.intervallList) {
                this.clearInterval(this.intervallList[index]);
            }
            // info.connect to false, if adapter is closed
            this.setState("info.connection", false, true);
            callback();
        }
        catch (e) {
            callback();
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