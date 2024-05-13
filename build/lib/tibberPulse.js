"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TibberPulse = void 0;
const tibber_api_1 = require("tibber-api");
const tibberHelper_1 = require("./tibberHelper");
class TibberPulse extends tibberHelper_1.TibberHelper {
    constructor(tibberConfig, adapter) {
        super(adapter);
        this.reconnectTime = 6000;
        this.maxReconnectTime = 900000;
        this.tibberConfig = tibberConfig;
        this.tibberQuery = new tibber_api_1.TibberQuery(this.tibberConfig);
        this.tibberFeed = new tibber_api_1.TibberFeed(this.tibberQuery);
        this.httpQueryUrl = tibberConfig.apiEndpoint.queryUrl;
        this.addEventHandlerOnFeed(this.tibberFeed);
    }
    async ConnectPulseStream() {
        try {
            this.tibberFeed.connect();
        }
        catch (error) {
            this.adapter.log.warn(`Error in ConnectPulseStream: ${error.message}`);
        }
    }
    DisconnectPulseStream() {
        try {
            this.tibberFeed.close();
        }
        catch (error) {
            this.adapter.log.warn(`Error on feed close: ${error.message}`);
        }
        // Reinitialize TibberFeed
        this.tibberFeed = new tibber_api_1.TibberFeed(new tibber_api_1.TibberQuery(this.tibberConfig));
    }
    addEventHandlerOnFeed(currentFeed) {
        // Set info.connection state for event "connected"
        currentFeed.on("connected", (data) => {
            this.adapter.log.debug(`Tibber feed connected: ${data.toString()}`);
            this.adapter.setState("info.connection", true, true);
        });
        // Set info.connection state for event "disconnected"
        currentFeed.on("disconnected", (data) => {
            this.adapter.setState("info.connection", false, true);
            if (this.adapter.config.HomesList.some((info) => info.feedActive)) {
                this.reconnectTime = 6000; // reinit
                this.adapter.log.warn(`A feed was disconnected. I try to reconnect in ${this.reconnectTime / 1000}sec  -  Tibber error text: ${data.toString()}`);
                this.reconnect();
            }
        });
        // WIP
        /*
        // Add error handler on connection
        currentFeed.on("error", (error) => {
            const errorObj = error instanceof Error ? error : new Error(error);
            if (errorObj.message) {
                this.adapter.log.warn(`ERROR on Tibber feed: ${errorObj.message}`);
            } else if (errorObj.name) {
                this.adapter.log.warn(`ERROR on Tibber feed: ${errorObj.name}`);
            } else {
                this.adapter.log.warn(`unspecified ERROR on Tibber feed: ${errorObj.toString()}`);
            }
        });
        */ //WIP
        // Add error handler on connection
        currentFeed.on("error", (error) => {
            let errorMessage = "";
            if (error instanceof Error) {
                if (error.message)
                    errorMessage = error.message;
                else if (error.name)
                    errorMessage = error.name;
                else
                    errorMessage = "Unspecified error";
            }
            else if (typeof error === "string")
                errorMessage = error;
            else
                errorMessage = "Unknown error";
            this.adapter.log.warn(`Error on Tibber feed: ${errorMessage}`);
        });
        // Add data receiver
        currentFeed.on("data", (data) => {
            const receivedData = data;
            this.fetchLiveMeasurement("LiveMeasurement", receivedData);
        });
    }
    fetchLiveMeasurement(objectDestination, liveMeasurement) {
        let power = 0;
        if (liveMeasurement.powerProduction === undefined || liveMeasurement.powerProduction === null)
            liveMeasurement.powerProduction = 0; // fix wrong data from Tibber in edge cases
        if (liveMeasurement.power > 0) {
            power = liveMeasurement.power;
        }
        else if (liveMeasurement.powerProduction > 0) {
            power = liveMeasurement.powerProduction * -1;
        }
        // "minpower" should be called "minpowerConsumption" - in fact there is no correct minpower yet,
        // when we think about minpower and maxpower should be linked to "power" (positive and negative power)
        if (this.tibberConfig.homeId !== undefined) {
            this.checkAndSetValue(this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "timestamp"), liveMeasurement.timestamp, "Timestamp when usage occurred");
            this.checkAndSetValueNumber(this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "power"), power, "Powerlevel measured at the moment +/-", "W");
            this.checkAndSetValueNumber(this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "lastMeterConsumption"), Math.round(1000 * liveMeasurement.lastMeterConsumption) / 1000, "Latest consumption meter state", "kWh");
            this.checkAndSetValueNumber(this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "accumulatedConsumption"), Math.round(1000 * liveMeasurement.accumulatedConsumption) / 1000, "Energy consumed since midnight", "kWh");
            this.checkAndSetValueNumber(this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "accumulatedProduction"), Math.round(1000 * liveMeasurement.accumulatedProduction) / 1000, "Energy feed into grid since midnight", "kWh");
            this.checkAndSetValueNumber(this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "accumulatedConsumptionLastHour"), Math.round(1000 * liveMeasurement.accumulatedConsumptionLastHour) / 1000, "Energy consumed since since last hour shift", "kWh");
            this.checkAndSetValueNumber(this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "accumulatedProductionLastHour"), Math.round(1000 * liveMeasurement.accumulatedProductionLastHour) / 1000, "Energy produced since last hour shift", "kWh");
            this.checkAndSetValueNumber(this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "accumulatedCost"), liveMeasurement.accumulatedCost, "Accumulated cost since midnight; requires active Tibber power deal");
            this.checkAndSetValueNumber(this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "accumulatedReward"), liveMeasurement.accumulatedReward, "Accumulated reward since midnight; requires active Tibber power deal");
            this.checkAndSetValue(this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "currency"), liveMeasurement.currency, "Currency of displayed cost; requires active Tibber power deal");
            this.checkAndSetValueNumber(this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "minPower"), liveMeasurement.minPower, "Min consumption since midnight", "W");
            this.checkAndSetValueNumber(this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "averagePower"), liveMeasurement.averagePower, "Average consumption since midnight", "W");
            this.checkAndSetValueNumber(this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "maxPower"), liveMeasurement.maxPower, "Peak consumption since midnight", "W");
            this.checkAndSetValueNumber(this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "powerConsumption"), liveMeasurement.power, "Net consumption (A+) at the moment", "W");
            if (this.adapter.config.FeedConfigPowerProduction) {
                this.checkAndSetValueNumber(this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "powerProduction"), liveMeasurement.powerProduction, "Net grid feed-in (A-) at the moment", "W");
            }
            this.checkAndSetValueNumber(this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "minPowerProduction"), liveMeasurement.minPowerProduction, "Min net grid feed-in since midnight", "W");
            this.checkAndSetValueNumber(this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "maxPowerProduction"), liveMeasurement.maxPowerProduction, "Max net grid feed-in since midnight", "W");
            this.checkAndSetValueNumber(this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "lastMeterProduction"), Math.round(1000 * liveMeasurement.lastMeterProduction) / 1000, "Latest grid feed-in meter state", "kWh");
            this.checkAndSetValueNumber(this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "powerFactor"), liveMeasurement.powerFactor, "Power factor (active power / apparent power)");
            this.checkAndSetValueNumber(this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "signalStrength"), liveMeasurement.signalStrength, "Device signal strength (Pulse - dB; Watty - percent)");
            this.checkAndSetValueNumber(this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "voltagePhase1"), liveMeasurement.voltagePhase1, "Voltage on phase 1; on some meters this value is not part of every data frame therefore the value is null at some timestamps", "V");
            this.checkAndSetValueNumber(this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "voltagePhase2"), liveMeasurement.voltagePhase2, "Voltage on phase 2; on some meters this value is not part of every data frame therefore the value is null at some timestamps", "V");
            this.checkAndSetValueNumber(this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "voltagePhase3"), liveMeasurement.voltagePhase3, "Voltage on phase 3; on some meters this value is not part of every data frame therefore the value is null at some timestamps", "V");
            this.checkAndSetValueNumber(this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "currentL1"), liveMeasurement.currentL1, "Current on L1; on some meters this value is not part of every data frame therefore the value is null at some timestamps", "A");
            this.checkAndSetValueNumber(this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "currentL2"), liveMeasurement.currentL2, "Current on L2; on some meters this value is not part of every data frame therefore the value is null at some timestamps", "A");
            this.checkAndSetValueNumber(this.getStatePrefix(this.tibberConfig.homeId, objectDestination, "currentL3"), liveMeasurement.currentL3, "Current on L3; on some meters this value is not part of every data frame therefore the value is null at some timestamps", "A");
        }
    }
    /**
     * Tries to reconnect to TibberFeed in a loop, with incremental delay between attempts,
     * and generates a formatted error message if unsuccessful.
     *
     * @returns A Promise that resolves when reconnection is successful, or rejects with an error message.
     */
    async reconnect() {
        do {
            await this.adapter.delay(this.reconnectTime);
            this.adapter.log.debug(`Attempting to reconnect to TibberFeed in ${this.reconnectTime / 1000}sec interval - (of max. ${this.maxReconnectTime / 1000}sec)`);
            await this.ConnectPulseStream();
            this.reconnectTime = Math.min(this.reconnectTime + 1000, this.maxReconnectTime);
        } while (!this.tibberFeed.connected);
        this.adapter.log.info(`Reconnection successful!`);
    }
}
exports.TibberPulse = TibberPulse;
//# sourceMappingURL=tibberPulse.js.map