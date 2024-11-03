"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TibberPulse = void 0;
const tibber_api_1 = require("tibber-api");
const tibberHelper_1 = require("./tibberHelper");
//import { ProjectUtils } from "./projectUtils";
class TibberPulse extends tibberHelper_1.TibberHelper {
    //export class TibberPulse extends TibberHelper {
    tibberConfig;
    tibberQuery;
    tibberFeed;
    httpQueryUrl;
    reconnectTime = 6000;
    maxReconnectTime = 900000;
    countedFeedDisconnects = 0;
    lastFeedWarningTime = null;
    deltaFeedWarningTime = 0;
    constructor(tibberConfig, adapter) {
        super(adapter);
        this.tibberConfig = tibberConfig;
        this.tibberQuery = new tibber_api_1.TibberQuery(this.tibberConfig);
        this.tibberFeed = new tibber_api_1.TibberFeed(this.tibberQuery);
        this.httpQueryUrl = tibberConfig.apiEndpoint.queryUrl;
        this.addEventHandlerOnFeed(this.tibberFeed);
    }
    async ConnectPulseStream() {
        try {
            await this.tibberFeed.connect();
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
        /**
         * Handles the disconnection of a data feed and manages reconnection attempts with incremental delays.
         *
         * This method is triggered when the data feed gets disconnected. It updates the connection state (`info.connection` to `false`) and monitors the frequency of disconnection attempts to avoid excessive reconnections.
         *
         * The following logic is applied:
         * - **Disconnection count (`countedFeedDisconnects`)**: Tracks the number of disconnections. Warnings are logged when the feed disconnects 5 or 25 times. At 25 disconnections, an error is logged instead of a warning.
         * - **Warning time interval (`deltaFeedWarningTime`)**: Measures the time (in minutes) since the last disconnection warning. If more than 60 minutes have passed, the warning counter resets.
         * - If the feed disconnects frequently within a **30-minute window**, it logs a warning and resets the disconnection counter.
         * - After each disconnection, the system tries to reconnect, logging the result. If disconnections occur too often, warnings or errors are logged based on the number of reconnection attempts.
         *
         * @param data - The error message sent by Tibber upon disconnection, which is logged for diagnostic purposes.
         */
        currentFeed.on("disconnected", (data) => {
            this.adapter.setState("info.connection", false, true);
            if (this.adapter.config.HomesList.some((info) => info.feedActive)) {
                this.deltaFeedWarningTime = 0;
                if (this.lastFeedWarningTime !== null) {
                    this.deltaFeedWarningTime = (new Date().getTime() - this.lastFeedWarningTime.getTime()) / 1000 / 60; // timedifference in minutes
                }
                if (this.countedFeedDisconnects < 25 && this.deltaFeedWarningTime > 60) {
                    this.countedFeedDisconnects = 0;
                    this.lastFeedWarningTime = null;
                    this.deltaFeedWarningTime = 0;
                }
                this.countedFeedDisconnects++;
                const loggingTextBlock = ` to reconnect with incremental delay -  Error text sent by Tibber: ${data.toString()}`;
                if (this.deltaFeedWarningTime > 30) {
                    this.countedFeedDisconnects = 0;
                    this.lastFeedWarningTime = null;
                    this.adapter.log.warn(`A feed was disconnected very often. I keep trying${loggingTextBlock}`);
                }
                else {
                    if (this.countedFeedDisconnects == 5) {
                        this.lastFeedWarningTime = new Date();
                        this.adapter.log.warn(`A feed was disconnected very often. I keep trying${loggingTextBlock}`);
                    }
                    else if (this.countedFeedDisconnects == 25) {
                        this.adapter.log.error(`A feed was disconnected very often. I keep trying${loggingTextBlock}`);
                    }
                    else {
                        this.adapter.log.debug(`A feed was disconnected. I try to${loggingTextBlock}`);
                    }
                }
                this.reconnect();
            }
        });
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
        this.reconnectTime = 6000; // reinit
        do {
            this.adapter.log.debug(`Attempting to reconnect to TibberFeed in ${this.reconnectTime / 1000}sec interval - (of max. ${this.maxReconnectTime / 1000}sec)`);
            await this.adapter.delay(this.reconnectTime);
            await this.ConnectPulseStream();
            this.reconnectTime = Math.min(this.reconnectTime + 2000, this.maxReconnectTime);
        } while (!this.tibberFeed.connected);
        this.adapter.log.debug(`Reconnection successful!`);
    }
}
exports.TibberPulse = TibberPulse;
//# sourceMappingURL=tibberPulse.js.map