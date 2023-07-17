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
// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = __importStar(require("@iobroker/adapter-core"));
const tibberAPICaller_1 = require("./lib/tibberAPICaller");
const tibberPulse_1 = require("./lib/tibberPulse");
class Tibberlink extends utils.Adapter {
    constructor(options = {}) {
        super({
            ...options,
            name: "tibberlink",
        });
        this.queryUrl = "";
        this.on("ready", this.onReady.bind(this));
        // this.on("stateChange", this.onStateChange.bind(this));
        // this.on("objectChange", this.onObjectChange.bind(this));
        // this.on("message", this.onMessage.bind(this));
        this.on("unload", this.onUnload.bind(this));
        this.homeIdList = [];
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
            // Now read all Data from API
            const tibberAPICaller = new tibberAPICaller_1.TibberAPICaller(tibberConfigAPI, this);
            try {
                this.homeIdList = await tibberAPICaller.updateHomesFromAPI();
            }
            catch (error) {
                this.log.warn(tibberAPICaller.generateErrorMessage(error, "pull of homes"));
            }
            // if feed is not used - set info.connection if data received
            if (!this.config.FeedActive) {
                if (this.homeIdList) {
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
                let last = await this.getStateAsync("LastSentryLogDay");
                // if (last?.val != await today.getDate()) {
                if (sentryInstance) {
                    const Sentry = sentryInstance.getSentryObject();
                    Sentry && Sentry.withScope((scope) => {
                        scope.setLevel("info");
                        scope.setTag("SentryDay", today.getDate());
                        scope.setTag("HomeIDs", this.homeIdList.length);
                        Sentry.captureMessage("Adapter TibberLink started", "info"); // Level "info"
                    });
                }
                // this.setStateAsync("LastSentryLoggedError", { val: "unknown", ack: true }); // Clean last error every adapter start
                this.setStateAsync("LastSentryLogDay", { val: today.getDate(), ack: true });
                // }
            }
            // Init Load Data for home
            if (this.homeIdList.length > 0) {
                for (const index in this.homeIdList) {
                    try {
                        await tibberAPICaller.updateCurrentPrice(this.homeIdList[index]);
                    }
                    catch (error) {
                        this.log.warn(tibberAPICaller.generateErrorMessage(error, "pull of current price"));
                    }
                    try {
                        await tibberAPICaller.updatePricesToday(this.homeIdList[index]);
                    }
                    catch (error) {
                        this.log.warn(tibberAPICaller.generateErrorMessage(error, "pull of prices today"));
                    }
                    try {
                        await tibberAPICaller.updatePricesTomorrow(this.homeIdList[index]);
                    }
                    catch (error) {
                        this.log.warn(tibberAPICaller.generateErrorMessage(error, "pull of prices tomorrow"));
                    }
                }
            }
            const energyPriceCallIntervall = this.setInterval(() => {
                if (this.homeIdList.length > 0) {
                    for (const index in this.homeIdList) {
                        try {
                            tibberAPICaller.updateCurrentPrice(this.homeIdList[index]);
                        }
                        catch (error) {
                            this.log.warn(tibberAPICaller.generateErrorMessage(error, "pull of current price"));
                        }
                    }
                }
            }, 300000);
            this.intervallList.push(energyPriceCallIntervall);
            const energyPricesListUpdateInterval = this.setInterval(() => {
                if (this.homeIdList.length > 0) {
                    for (const index in this.homeIdList) {
                        try {
                            tibberAPICaller.updatePricesToday(this.homeIdList[index]);
                        }
                        catch (error) {
                            this.log.warn(tibberAPICaller.generateErrorMessage(error, "pull of prices today"));
                        }
                        try {
                            tibberAPICaller.updatePricesTomorrow(this.homeIdList[index]);
                        }
                        catch (error) {
                            this.log.warn(tibberAPICaller.generateErrorMessage(error, "pull of prices tomorrow"));
                        }
                    }
                }
            }, 1500000);
            this.intervallList.push(energyPricesListUpdateInterval);
            // If User uses live feed - start connection
            if (this.config.FeedActive) {
                for (const index in this.homeIdList) {
                    try {
                        tibberConfigFeed.homeId = this.homeIdList[index]; // ERROR: Only latest homeID will be used at this point
                        // define fields for Datafeed
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
                        tibberPulse.ConnectPulseStream();
                    }
                    catch (e) {
                        this.log.warn(e.message);
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