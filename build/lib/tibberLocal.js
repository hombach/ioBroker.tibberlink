"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TibberLocal = void 0;
const axios_1 = __importDefault(require("axios"));
const date_fns_1 = require("date-fns");
const tibberHelper_1 = require("./tibberHelper");
class TibberLocal extends tibberHelper_1.TibberHelper {
    //negSignPattern: string = "77070100010800ff6301a";
    constructor(adapter) {
        super(adapter);
        this.TestData = "";
        this.TestMode = false;
        this.MetricsDataInterval = 60000;
        this.RawDataInterval = 2000;
        this.intervalList = [];
    }
    async setupOnePulseLocal(pulse) {
        let meterMode = 0;
        try {
            if (this.adapter.config.PulseList[pulse].puName === undefined) {
                this.adapter.config.PulseList[pulse].puName = `Pulse Local`;
            }
            if (!this.TestMode) {
                let firstMetricsRun = true;
                let firstDataRun = true;
                //#region *** get Tibber Bridge metrics first time
                this.getPulseData(pulse)
                    .then((response) => {
                    this.adapter.log.debug(`Polled local Tibber Bridge metrics${firstMetricsRun ? " for the first time" : ""}: ${JSON.stringify(response)}`);
                    meterMode = this.fetchPulseInfo(pulse, response, "", firstMetricsRun);
                    firstMetricsRun = false;
                })
                    .catch((e) => {
                    this.adapter.log.error(`Error while polling and parsing Tibber Bridge metrics: ${e}`);
                });
                //#endregion
                //#region *** setup Tibber Bridge metrics job
                const jobBridgeMetrics = setInterval(() => {
                    this.getPulseData(pulse)
                        .then((response) => {
                        this.adapter.log.debug(`Polled local Tibber Bridge metrics: ${JSON.stringify(response)}`);
                        meterMode = this.fetchPulseInfo(pulse, response, "", firstMetricsRun);
                        firstMetricsRun = false;
                    })
                        .catch((e) => {
                        this.adapter.log.error(`Error polling and parsing Tibber Bridge metrics: ${e}`);
                    });
                }, this.MetricsDataInterval);
                if (jobBridgeMetrics)
                    this.intervalList.push(jobBridgeMetrics);
                //#endregion
                //#region *** setup Tibber Pulse data job
                const jobPulseLocal = setInterval(() => {
                    // poll data and log as HEX string
                    this.getDataAsHexString(pulse)
                        .then((hexString) => {
                        this.adapter.log.debug(`got HEX data from local pulse: ${hexString}`); // log data as HEX string
                        //WiP 3.4.5
                        //this.extractAndParseMode4Messages(pulse, hexString, firstDataRun);
                        //WiP 3.4.5
                        this.checkAndSetValue(this.getStatePrefixLocal(pulse, "SMLDataHEX"), hexString, this.adapter.config.PulseList[pulse].puName);
                        this.adapter.log.info(`trying to parse meter mode ${meterMode}`);
                        switch (meterMode) {
                            case 1:
                                this.extractAndParseMode4Messages(pulse, hexString, firstDataRun); //WiP #478
                                break;
                            case 3:
                                this.extractAndParseSMLMessages(pulse, hexString, firstDataRun);
                                break;
                            case 4:
                                this.extractAndParseMode4Messages(pulse, hexString, firstDataRun);
                                break;
                            default:
                                this.extractAndParseSMLMessages(pulse, hexString, firstDataRun);
                        }
                        firstDataRun = false;
                    })
                        .catch((e) => {
                        this.adapter.log.warn(`Error local polling of Tibber Pulse RAW data: ${e}`);
                    });
                }, this.RawDataInterval);
                if (jobPulseLocal)
                    this.intervalList.push(jobPulseLocal);
                //#endregion
            }
            else {
                const parsedMessages = this.extractAndParseSMLMessages(99, this.TestData);
                this.adapter.log.warn(`Parsed messages from test data ${parsedMessages}`);
            }
        }
        catch (error) {
            this.adapter.log.warn(this.generateErrorMessage(error, `setup of Bridge / Pulse local poll`));
        }
    }
    /**
     * Clears all active intervals.
     *
     * This method iterates over all interval jobs stored in `this.intervalList` and clears each one.
     * If an error occurs during this process, it logs a warning message.
     *
     * @returns A promise that resolves when all intervals have been cleared.
     */
    async clearIntervals() {
        try {
            // Here we must clear all intervals that may still be active
            for (const intervalJob of this.intervalList) {
                clearInterval(intervalJob);
            }
        }
        catch (e) {
            this.adapter.log.warn(e.message);
        }
    }
    async getPulseData(pulse) {
        const auth = `Basic ${Buffer.from(`admin:${this.adapter.config.PulseList[pulse].tibberBridgePassword}`).toString("base64")}`;
        const options = {
            hostname: this.adapter.config.PulseList[pulse].tibberBridgeUrl,
            path: `/metrics.json?node_id=${this.adapter.config.PulseList[pulse].tibberPulseLocalNodeId}`,
            method: "GET",
            headers: {
                Authorization: auth,
                Host: this.adapter.config.PulseList[pulse].tibberBridgeUrl,
                lang: "de-de",
                "content-type": "application/json",
                "user-agent": "okhttp/3.14.9",
            },
        };
        try {
            const response = await axios_1.default.request({
                url: options.path,
                method: options.method,
                baseURL: `http://${options.hostname}`,
                headers: options.headers,
            });
            if (response.data) {
                response.data = JSON.parse(JSON.stringify(response.data).replace(/\$type/g, "type"));
            }
            return response.data;
        }
        catch (error) {
            this.adapter.log.error(`Error while polling metrics (getPulseData). $[error}`);
            throw error;
        }
        /*
        {
            "$type": "node_status",
            "node_status": {
                "product_id": 49344,
                "bootloader_version": 17563650,
                "meter_mode": 3,
                "node_battery_voltage": 2.779,
                "node_temperature": 25.168,
                "node_avg_rssi": -31.75,
                "node_avg_lqi": 199.009,
                "radio_tx_power": 0,
                "node_uptime_ms": 19804222967,
                "meter_msg_count_sent": 77,
                "meter_pkg_count_sent": 103,
                "time_in_em0_ms": 3144,
                "time_in_em1_ms": 26,
                "time_in_em2_ms": 296980,
                "acmp_rx_autolevel_300": 147,
                "acmp_rx_autolevel_9600": 146
            },
            "hub_attachments": {
                "meter_pkg_count_recv": 103,
                "meter_reading_count_recv": 77,
                "node_version": "1007-56bd9fb9"
            }
        }
        */
    }
    /**
     * Fetches and processes information from a given Tibber Bridge object.
     *
     * This method recursively iterates through the provided `obj`, processes specific keys, and updates the corresponding states.
     * It handles different data types and formats them appropriately before updating the states.
     *
     * @param pulse - A number representing the pulse to fetch information for.
     * @param obj - An object containing the pulse information to process.
     * @param prefix - An optional string prefix to prepend to state keys (default is an empty string).
     * @param firstTime - A boolean indicating if this is the first time fetching the information (default is false).
     * @returns A number representing the meter mode.
     */
    fetchPulseInfo(pulse, obj, prefix = "", firstTime = false) {
        let meterMode = 0;
        if (!obj || typeof obj !== "object") {
            this.adapter.log.warn(`Got bad Pulse info data to fetch!: ${obj}`); //
            return meterMode;
        }
        for (const key in obj) {
            if (typeof obj[key] === "object") {
                this.fetchPulseInfo(pulse, obj[key], `${prefix}${key}.`, firstTime);
            }
            else {
                switch (key) {
                    case "timestamp":
                        const TimeValue = this.isValidUnixTimestampAndConvert(obj[key]);
                        if (TimeValue) {
                            obj[key] = TimeValue;
                            this.checkAndSetValue(this.getStatePrefixLocal(pulse, `PulseInfo.${prefix}${key}`), obj[key], this.adapter.config.PulseList[pulse].puName, false, false, firstTime);
                        }
                        break;
                    case "node_temperature":
                        if (typeof obj[key] === "number") {
                            this.checkAndSetValueNumber(this.getStatePrefixLocal(pulse, `PulseInfo.${prefix}${key}`), Math.round(obj[key] * 10) / 10, `Temperature of this Tibber Pulse unit`, "°C", false, false, firstTime);
                        }
                        break;
                    case "meter_mode":
                        if (typeof obj[key] === "number") {
                            this.checkAndSetValueNumber(this.getStatePrefixLocal(pulse, `PulseInfo.${prefix}${key}`), Math.round(obj[key] * 10) / 10, `Mode of your Pulse to grid-meter communication`, "", false, false, firstTime);
                            meterMode = obj[key];
                            //if (obj[key] !== 3) this.adapter.log.warn(`Potential problems with Pulse meter mode ${obj[key]}`);
                            //WiP
                            if (![1, 3, 4].includes(obj[key])) {
                                this.adapter.log.warn(`Potential problems with Pulse meter mode ${obj[key]}`);
                            }
                        }
                        break;
                    case "node_battery_voltage":
                        if (typeof obj[key] === "number") {
                            this.checkAndSetValueNumber(this.getStatePrefixLocal(pulse, `PulseInfo.${prefix}${key}`), Math.round(obj[key] * 100) / 100, `Temperature of this Tibber Pulse unit`, "V", false, false, firstTime);
                        }
                        break;
                    case "node_uptime_ms":
                        if (typeof obj[key] === "number") {
                            this.checkAndSetValueNumber(this.getStatePrefixLocal(pulse, `PulseInfo.${prefix}${key}`), obj[key], `Uptime of your Tibber Pulse in ms`, "ms", false, false, firstTime);
                            function formatMilliseconds(ms) {
                                const duration = (0, date_fns_1.intervalToDuration)({ start: 0, end: ms });
                                const formattedDuration = (0, date_fns_1.formatDuration)(duration, { format: ["months", "days", "hours", "minutes", "seconds"] });
                                // Output: "229 days 3 hours 17 minutes 2 seconds"
                                // view only first 3 blocks
                                const parts = formattedDuration.split(" ");
                                return parts.slice(0, 6).join(" "); // slice(0, 4) um die ersten zwei Blöcke (jeweils Einheit und Wert) zu erhalten
                                // Output: "229 days 3 hours 17 minutes"
                            }
                            this.checkAndSetValue(this.getStatePrefixLocal(pulse, `PulseInfo.${prefix}node_uptime`), formatMilliseconds(obj[key]), `Uptime of your Tibber Pulse`, false, false, firstTime);
                        }
                        break;
                    case "time_in_em0_ms":
                        if (typeof obj[key] === "number") {
                            this.checkAndSetValueNumber(this.getStatePrefixLocal(pulse, `PulseInfo.${prefix}${key}`), obj[key], this.adapter.config.PulseList[pulse].puName, "ms", false, false, firstTime);
                        }
                        break;
                    case "time_in_em1_ms":
                        if (typeof obj[key] === "number") {
                            this.checkAndSetValueNumber(this.getStatePrefixLocal(pulse, `PulseInfo.${prefix}${key}`), obj[key], this.adapter.config.PulseList[pulse].puName, "ms", false, false, firstTime);
                        }
                        break;
                    case "time_in_em2_ms":
                        if (typeof obj[key] === "number") {
                            this.checkAndSetValueNumber(this.getStatePrefixLocal(pulse, `PulseInfo.${prefix}${key}`), obj[key], this.adapter.config.PulseList[pulse].puName, "ms", false, false, firstTime);
                        }
                        break;
                    default:
                        if (typeof obj[key] === "string") {
                            this.checkAndSetValue(this.getStatePrefixLocal(pulse, `PulseInfo.${prefix}${key}`), obj[key], this.adapter.config.PulseList[pulse].puName, false, false, firstTime);
                        }
                        else {
                            this.checkAndSetValueNumber(this.getStatePrefixLocal(pulse, `PulseInfo.${prefix}${key}`), obj[key], this.adapter.config.PulseList[pulse].puName, "", false, false, firstTime);
                        }
                }
            }
        }
        return meterMode;
    }
    /**
     * Retrieves data as a hex string from a specified pulse device.
     *
     * @param pulse - A number representing the index of the Pulse device in the PulseList configuration.
     * @returns A Promise that resolves with the data as a hex string if successful.
     * @throws Will throw an error if the HTTP request fails.
     */
    async getDataAsHexString(pulse) {
        const auth = `Basic ${Buffer.from(`admin:${this.adapter.config.PulseList[pulse].tibberBridgePassword}`).toString("base64")}`;
        const options = {
            method: "GET",
            url: `http://${this.adapter.config.PulseList[pulse].tibberBridgeUrl}/data.json?node_id=${this.adapter.config.PulseList[pulse].tibberPulseLocalNodeId}`,
            headers: {
                Authorization: auth,
            },
            responseType: "arraybuffer", // important for handling binary data
        };
        try {
            const response = await (0, axios_1.default)(options);
            const buffer = Buffer.from(response.data);
            const hexString = buffer.toString("hex");
            return hexString;
        }
        catch (error) {
            this.adapter.log.error(`An error occured during local poll of Pulse data (getDataAsHexString)`);
            throw error;
        }
    }
    async extractAndParseSMLMessages(pulse, transfer, forceMode = false) {
        const messages = transfer.matchAll(/7707(0100[0-9a-fA-F].{5}?ff).{4,28}62([0-9a-fA-F]{2})52([0-9a-fA-F]{2})([0-9a-fA-F]{2})((?:[0-9a-fA-F]{2}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8}|[0-9a-fA-F]{10}|[0-9a-fA-F]{8}|[0-9a-fA-F]{16}))01(?=(77)|(0101)|(\n))/g);
        const output = [];
        for (const match of messages) {
            const result = { name: "", value: 0 };
            //this.adapter.log.debug(`overall compliance: ${match[0]}`);
            //this.adapter.log.debug(`group 1: ${match[1]}`);
            //this.adapter.log.debug(`group 2: ${match[2]}`);
            //this.adapter.log.debug(`group 3: $[match[3]}`);
            //this.adapter.log.debug(`group 4: $[match[4]}`);
            //this.adapter.log.debug(`group 5: ${match[5]}`);
            result.name = findObisCodeName(match[1]);
            result.value = parseSignedHex(match[5]);
            const decimalCode = parseInt(match[2], 16);
            result.unit = findDlmsUnitByCode(decimalCode);
            if (match[3].toLowerCase() == "ff") {
                result.value = result.value / 10;
            }
            else if (match[3].toLowerCase() == "fe") {
                result.value = result.value / 100;
            }
            //#region *** negSignPattern
            /*
            if ("negSignPattern" in TibberConfig && this.negSignPattern.length > 2) {
                const obisCodeOb = this.obisCodesWithNames.find((item) => item.code === match[1]);
                if (obisCodeOb) {
                    if (obisCodeOb.checkSign) {
                        if (transfer.includes(this.negSignPattern)) {
                            //this.adapter.log.debug(`negative!!!!`)
                            result.value = result.value * -1;
                        }
                    }
                }
            }
            */
            //#endregion
            if (result.value > 1000000000 || result.value < -1000000000) {
                this.adapter.log.debug(`Result.value < or > 1.000.000.000 skiped!`);
                this.adapter.log.debug(JSON.stringify(result));
                this.adapter.log.debug(`overall compliance: ${match[0]}`);
                this.adapter.log.debug(`RAW: ${transfer}`);
                continue;
            }
            if (result.unit == "Wh") {
                result.unit = "kWh";
                result.value = Math.round(result.value / 100) / 10;
            }
            this.checkAndSetValueNumber(this.getStatePrefixLocal(pulse, result.name), result.value, this.adapter.config.PulseList[pulse].puName, result.unit, false, false, forceMode);
            this.adapter.log.debug(`SML parse result (mode 3): ${JSON.stringify(result)}`);
            const formattedMatch = match[0].replace(/(..)/g, "$1 ").trim();
            output.push(`${getCurrentTimeFormatted()}: ${formattedMatch}\n`);
        }
        if (output.length > 0)
            this.adapter.log.debug(`Format for https://tasmota-sml-parser.dicp.net :\n ${output.join("")}`);
    }
    // WIP #478  -  Meter Mode 1
    // transfer = `2f5a50413547483330352e76322d32302e30302d470d0a0d0a02312d303a432e312e302a32353528315a504130303235313337353738290d0a312d303a312e382e302a323535283031383131362e333030322a6b5768290d0a312d303a312e382e312a323535283030303030302e303030302a6b5768290d0a312d303a312e382e322a323535283031383131362e333030322a6b5768290d0a312d303a322e382e302a323535283031393330362e303938392a6b5768290d0a312d303a31362e372e302a323535282d3030333039342a57290d0a312d303a33322e372e302a323535283233332e352a56290d0a312d303a35322e372e302a323535283233332e332a56290d0a312d303a37322e372e302a323535283233332e392a56290d0a312d303a33312e372e302a323535283030322e39382a41290d0a312d303a35312e372e302a323535283030352e33302a41290d0a312d303a37312e372e302a323535283030352e33302a41290d0a312d303a38312e372e312a323535283132302a646567290d0a312d303a38312e372e322a323535283234302a646567290d0a312d303a38312e372e342a323535283139342a646567290d0a312d303a38312e372e31352a323535283138362a646567290d0a312d303a38312e372e32362a323535283139342a646567290d0a312d303a31342e372e302a3235352835302e302a487a290d0a312d303a302e322e302a323535287665722e32302c44363841393343372c3230323030343039290d0a312d303a432e39302e322a323535284436384139334337290d0a312d303a462e462a32353528303030303030290d0a312d303a432e352e302a323535283030314337393034290d0a312d303a33362e372e302a323535282d3030303637332a57290d0a312d303a35362e372e302a323535282d3030313232322a57290d0a312d303a37362e372e302a323535282d3030313139312a57290d0a312d303a312e382e302a39362830303030392e382a6b5768290d0a312d303a312e382e302a39372830303037362e302a6b5768290d0a312d303a312e382e302a39382830303334372e342a6b5768290d0a312d303a312e382e302a39392830383136392e312a6b5768290d0a312d303a312e382e302a3130302831383131362e332a6b5768290d0a210d0a033c`
    /**
     * Extracts and parses Mode 4 energy meter messages from a hexadecimal string. e.g. for "eBZ DD3" meters
     *
     * This method takes a hexadecimal string representing Mode 4 meter messages, converts it to an ASCII string,
     * and then parses the string to extract relevant measurement data. The extracted data includes the name,
     * value, and unit of each measurement, which are then processed and logged.
     *
     * @param pulse - An identifier for the pulse.
     * @param transfer - A string representing the hexadecimal Mode 4 messages to be parsed.
     * @param forceMode - An optional boolean indicating whether to force the mode (default is false).
     * @returns A Promise that resolves when the parsing and processing are complete.
     */
    async extractAndParseMode4Messages(pulse, transfer, forceMode = false) {
        const mode4Results = [];
        // example HEX string  -  WiP #478  -  meter mode 1 meter "ZPA GH305"
        // transfer = `2f5a50413547483330352e76322d32302e30302d470d0a0d0a02312d303a432e312e302a32353528315a504130303235313337353738290d0a312d303a312e382e302a323535283031383131362e333030322a6b5768290d0a312d303a312e382e312a323535283030303030302e303030302a6b5768290d0a312d303a312e382e322a323535283031383131362e333030322a6b5768290d0a312d303a322e382e302a323535283031393330362e303938392a6b5768290d0a312d303a31362e372e302a323535282d3030333039342a57290d0a312d303a33322e372e302a323535283233332e352a56290d0a312d303a35322e372e302a323535283233332e332a56290d0a312d303a37322e372e302a323535283233332e392a56290d0a312d303a33312e372e302a323535283030322e39382a41290d0a312d303a35312e372e302a323535283030352e33302a41290d0a312d303a37312e372e302a323535283030352e33302a41290d0a312d303a38312e372e312a323535283132302a646567290d0a312d303a38312e372e322a323535283234302a646567290d0a312d303a38312e372e342a323535283139342a646567290d0a312d303a38312e372e31352a323535283138362a646567290d0a312d303a38312e372e32362a323535283139342a646567290d0a312d303a31342e372e302a3235352835302e302a487a290d0a312d303a302e322e302a323535287665722e32302c44363841393343372c3230323030343039290d0a312d303a432e39302e322a323535284436384139334337290d0a312d303a462e462a32353528303030303030290d0a312d303a432e352e302a323535283030314337393034290d0a312d303a33362e372e302a323535282d3030303637332a57290d0a312d303a35362e372e302a323535282d3030313232322a57290d0a312d303a37362e372e302a323535282d3030313139312a57290d0a312d303a312e382e302a39362830303030392e382a6b5768290d0a312d303a312e382e302a39372830303037362e302a6b5768290d0a312d303a312e382e302a39382830303334372e342a6b5768290d0a312d303a312e382e302a39392830383136392e312a6b5768290d0a312d303a312e382e302a3130302831383131362e332a6b5768290d0a210d0a033c`;
        // example HEX string  -  WiP #477  -  meter mode 4
        // transfer = `2f45425a35444433325230364454415f3130370d0a312d303a302e302e302a323535283145425a30313031303033313331290d0a312d303a39362e312e302a323535283145425a30313031303033313331290d0a312d303a312e382e302a323535283030373435392e37383437313635322a6b5768290d0a312d303a312e382e312a323535283030303030312e3030332a6b5768290d0a312d303a312e382e322a323535283030373435382e3738312a6b5768290d0a312d303a322e382e302a323535283032373532312e33393931323739342a6b5768290d0a312d303a31362e372e302a323535283030303030322e36392a57290d0a312d303a33362e372e302a323535283030303133352e39352a57290d0a312d303a35362e372e302a323535283030303233392e39312a57290d0a312d303a37362e372e302a323535282d3030303337332e31372a57290d0a312d303a33322e372e302a323535283233362e312a56290d0a312d303a35322e372e302a323535283233352e372a56290d0a312d303a37322e372e302a323535283233392e312a56290d0a312d303a39362e352e302a323535283030314334313034290d0a302d303a39362e382e302a323535283036344641453235290d0a210d0a`;
        const asciTransfer = hexToAscii(transfer);
        const lines = asciTransfer.split("\r\n");
        for (const line of lines) {
            // Check if the line is not empty
            if (line.trim() !== "") {
                // Parse the line to extract name, value, and unit
                const match = line.match(/1-0:([0-9.]+)\*255\(([^*]+)\*([^*]+)\)/);
                //	1-0:1.8.2*255(007458.781*kWh)\r\n
                //	1-0:1.8.2*255: Verbrauchszähler
                //	(007458.781*kWh): Messwert in kWh
                //	1-0:2.8.0*255(027521.39912794*kWh)\r\n
                //	1-0:2.8.0*255: Exportierte Energie
                //	(027521.39912794*kWh): Messwert in kWh
                if (match) {
                    const name = findObisCodeName(match[1]);
                    const value = Math.round(Number(match[2]) * 10) / 10;
                    const unit = match[3];
                    // Push the parsed measurement into the measurements array
                    mode4Results.push({ name, value, unit });
                    this.checkAndSetValueNumber(this.getStatePrefixLocal(pulse, name), value, this.adapter.config.PulseList[pulse].puName, unit, false, false, forceMode);
                }
            }
        }
        this.adapter.log.debug(`Pulse mode 4 parse result: ${JSON.stringify(mode4Results)}`);
    }
    /**
     * Validates a Unix timestamp and converts it to a German date-time string.
     *
     * @param n - A number representing the Unix timestamp to validate and convert.
     * @returns A string representing the date-time in German format if the timestamp is valid, otherwise returns false.
     */
    isValidUnixTimestampAndConvert(n) {
        // Typüberprüfung und Bereichsüberprüfung (optional)
        const currentTime = Math.floor(Date.now() / 1000);
        if (typeof n !== "number" || n < 0 || n > currentTime || !Number.isInteger(n)) {
            return false;
        }
        // Konvertiere zu deutschem Zeitformat
        const date = new Date(n * 1000);
        return date.toLocaleString("de-DE"); // WiP: use system string instead of always German; use date-fns
    }
}
exports.TibberLocal = TibberLocal;
/**
 * Converts a hexadecimal string to its ASCII representation.
 * This method takes a hexadecimal string as input and converts each pair of hexadecimal digits to their corresponding ASCII character, constructing the resulting ASCII string.
 *
 * @param hex - A string representing the hexadecimal values to be converted.
 * @returns A string containing the ASCII representation of the hexadecimal input.
 */
function hexToAscii(hex) {
    let str = "";
    for (let i = 0; i < hex.length; i += 2) {
        str += String.fromCharCode(parseInt(hex.substring(i, i + 2), 16));
    }
    return str;
}
/**
 * Parses a signed hexadecimal string and returns the corresponding number.
 *
 * @param hexStr - A string representing the hexadecimal value to parse.
 * @returns A number representing the signed integer value of the hexadecimal input.
 */
function parseSignedHex(hexStr) {
    let num = BigInt(`0x${hexStr}`);
    const bitLength = hexStr.length * 4;
    if (bitLength <= 4) {
        // Behandlung als 4-Bit-Zahl
        if (num > 0x7)
            num = num - 0x1n;
    }
    else if (bitLength <= 8) {
        // Behandlung als 8-Bit-Zahl
        if (num > 0x7f)
            num = num - 0x100n;
    }
    else if (bitLength <= 16) {
        // Behandlung als 16-Bit-Zahl
        if (num > 0x7fff)
            num = num - 0x10000n;
    }
    else if (bitLength <= 24) {
        // Behandlung als 16-Bit-Zahl
        if (num > 0x7fffff)
            num = num - 0x1000000n;
    }
    else if (bitLength <= 32) {
        // Behandlung als 32-Bit-Zahl
        if (num > 0x7fffffff)
            num = num - 0x100000000n;
    }
    else {
        // Behandlung als 64-Bit-Zahl
        if (num > 0x7fffffffffffffffn)
            num = num - 0x10000000000000000n;
    }
    return Number(num.toString());
}
/**
 * Retrieves the current time formatted as a string in "HH:mm:ss.SSS" format.
 *
 * @returns A string representing the current time in "HH:mm:ss.SSS" format.
 */
function getCurrentTimeFormatted() {
    const now = new Date();
    return (0, date_fns_1.format)(now, "HH:mm:ss.SSS");
}
/**
 * Finds the DLMS unit corresponding to a given decimal code.
 *
 * @param decimalCode - A number representing the DLMS code to look up.
 * @returns A string representing the unit associated with the DLMS code, or an empty string if the code is not found.
 */
function findDlmsUnitByCode(decimalCode) {
    /* Static lookup table */
    const dlmsUnits = [
        { code: 0x1, unit: "a", quantity: "time", unitName: "year", siDefinition: "365.25*24*60*60 s" },
        { code: 0x2, unit: "mo", quantity: "time", unitName: "month", siDefinition: "30.44*24*60*60 s" },
        { code: 0x3, unit: "wk", quantity: "time", unitName: "week", siDefinition: "7*24*60*60 s" },
        { code: 0x4, unit: "d", quantity: "time", unitName: "day", siDefinition: "24*60*60 s" },
        { code: 0x5, unit: "h", quantity: "time", unitName: "hour", siDefinition: "60*60 s" },
        { code: 0x6, unit: "min", quantity: "time", unitName: "minute", siDefinition: "60 s" },
        { code: 0x7, unit: "s", quantity: "time", unitName: "second", siDefinition: "s" },
        { code: 0x8, unit: "°", quantity: "phase angle", unitName: "degree", siDefinition: "rad*180/π" },
        { code: 0x9, unit: "°C", quantity: "temperature", unitName: "degree celsius", siDefinition: "K-273.15" },
        { code: 0xa, unit: "currency", quantity: "local currency", unitName: "", siDefinition: "" },
        { code: 0xb, unit: "m", quantity: "length", unitName: "metre", siDefinition: "m" },
        { code: 0xc, unit: "m/s", quantity: "speed", unitName: "metre per second", siDefinition: "m/s" },
        { code: 0xd, unit: "m³", quantity: "volume", unitName: "cubic metre", siDefinition: "m³" },
        { code: 0xe, unit: "m³", quantity: "corrected volume", unitName: "cubic metre", siDefinition: "m³" },
        { code: 0xf, unit: "m³/h", quantity: "volume flux", unitName: "cubic metre per hour", siDefinition: "m³/(60*60s)" },
        { code: 0x10, unit: "m³/h", quantity: "corrected volume flux", unitName: "cubic metre per hour", siDefinition: "m³/(60*60s)" },
        { code: 0x11, unit: "m³/d", quantity: "volume flux", unitName: "cubic metre per day", siDefinition: "m³/(24*60*60s)" },
        { code: 0x12, unit: "m³/d", quantity: "corrected volume flux", unitName: "cubic metre per day", siDefinition: "m³/(24*60*60s)" },
        { code: 0x13, unit: "l", quantity: "volume", unitName: "liter", siDefinition: "10^-3 m³" },
        { code: 0x14, unit: "kg", quantity: "mass", unitName: "kilogram", siDefinition: "kg" },
        { code: 0x15, unit: "N", quantity: "force", unitName: "newton", siDefinition: "N" },
        { code: 0x16, unit: "Nm", quantity: "energy", unitName: "newtonmeter", siDefinition: "J = Nm = Ws" },
        { code: 0x17, unit: "Pa", quantity: "pressure", unitName: "pascal", siDefinition: "N/m²" },
        { code: 0x18, unit: "bar", quantity: "pressure", unitName: "bar", siDefinition: "10^5 N/m²" },
        { code: 0x19, unit: "J", quantity: "energy", unitName: "joule", siDefinition: "J = Nm = Ws" },
        { code: 0x1a, unit: "J/h", quantity: "thermal power", unitName: "joule per hour", siDefinition: "J/(60*60s)" },
        { code: 0x1b, unit: "W", quantity: "active power", unitName: "watt", siDefinition: "W = J/s" },
        { code: 0x1c, unit: "VA", quantity: "apparent power", unitName: "volt-ampere", siDefinition: "" },
        { code: 0x1d, unit: "var", quantity: "reactive power", unitName: "var", siDefinition: "" },
        { code: 0x1e, unit: "Wh", quantity: "active energy", unitName: "watt-hour", siDefinition: "W*(60*60s)" },
        { code: 0x1f, unit: "VAh", quantity: "apparent energy", unitName: "volt-ampere-hour", siDefinition: "VA*(60*60s)" },
        { code: 0x20, unit: "varh", quantity: "reactive energy", unitName: "var-hour", siDefinition: "var*(60*60s)" },
        { code: 0x21, unit: "A", quantity: "current", unitName: "ampere", siDefinition: "A" },
        { code: 0x22, unit: "C", quantity: "electrical charge", unitName: "coulomb", siDefinition: "C = As" },
        { code: 0x23, unit: "V", quantity: "voltage", unitName: "volt", siDefinition: "V" },
        { code: 0x24, unit: "V/m", quantity: "electric field strength", unitName: "volt per metre", siDefinition: "" },
        { code: 0x25, unit: "F", quantity: "capacitance", unitName: "farad", siDefinition: "C/V = As/V" },
        { code: 0x26, unit: "Ω", quantity: "resistance", unitName: "ohm", siDefinition: "Ω = V/A" },
        { code: 0x27, unit: "Ωm²/m", quantity: "resistivity", unitName: "Ωm", siDefinition: "" },
        { code: 0x28, unit: "Wb", quantity: "magnetic flux", unitName: "weber", siDefinition: "Wb = Vs" },
        { code: 0x29, unit: "T", quantity: "magnetic flux density", unitName: "tesla", siDefinition: "Wb/m²" },
        { code: 0x2a, unit: "A/m", quantity: "magnetic field strength", unitName: "ampere per metre", siDefinition: "A/m" },
        { code: 0x2b, unit: "H", quantity: "inductance", unitName: "henry", siDefinition: "H = Wb/A" },
        { code: 0x2c, unit: "Hz", quantity: "frequency", unitName: "hertz", siDefinition: "1/s" },
        { code: 0x2d, unit: "1/(Wh)", quantity: "R_W", unitName: "Active energy meter constant or pulse value", siDefinition: "" },
        { code: 0x2e, unit: "1/(varh)", quantity: "R_B", unitName: "reactive energy meter constant or pulse value", siDefinition: "" },
        { code: 0x2f, unit: "1/(VAh)", quantity: "R_S", unitName: "apparent energy meter constant or pulse value", siDefinition: "" },
        { code: 0x30, unit: "V²h", quantity: "volt-squared hour", unitName: "volt-squared hour", siDefinition: "V²*(60*60s)" },
        { code: 0x31, unit: "A²h", quantity: "ampere-squared hour", unitName: "ampere-squared hour", siDefinition: "A²*(60*60s)" },
        { code: 0x32, unit: "kg/s", quantity: "mass flux", unitName: "kilogram per second", siDefinition: "kg/s" },
        { code: 0x33, unit: "S, mho", quantity: "conductance siemens", unitName: "siemens", siDefinition: "1/Ω" },
        { code: 0x34, unit: "K", quantity: "temperature", unitName: "kelvin", siDefinition: "K" },
        { code: 0x35, unit: "1/(V²h)", quantity: "", unitName: "Volt-squared hour meter constant or pulse value", siDefinition: "" },
        { code: 0x36, unit: "1/(A²h)", quantity: "", unitName: "Ampere-squared hour meter constant or pulse value", siDefinition: "" },
        { code: 0x37, unit: "1/m³", quantity: "R_V", unitName: "meter constant or pulse value (volume)", siDefinition: "" },
        { code: 0x38, unit: "%", quantity: "percentage", unitName: "%", siDefinition: "" },
        { code: 0x39, unit: "Ah", quantity: "ampere-hours", unitName: "ampere-hour", siDefinition: "" },
        { code: 0x3c, unit: "Wh/m³", quantity: "energy per volume", unitName: "", siDefinition: "3.6*10^3 J/m³" },
        { code: 0x3d, unit: "J/m³", quantity: "calorific value, wobbe", unitName: "", siDefinition: "" },
        { code: 0x3e, unit: "Mol %", quantity: "molar fraction of", unitName: "mole percent", siDefinition: "Basic gas composition unit" },
        { code: 0x3f, unit: "Wh/m³", quantity: "energy per volume", unitName: "", siDefinition: "3.6*10^3 J/m³" },
        { code: 0x40, unit: "(reserved)", quantity: "", unitName: "", siDefinition: "" },
        { code: 0x41, unit: "(other)", quantity: "", unitName: "", siDefinition: "" },
        { code: 0x42, unit: "(unitless)", quantity: "no unit, unitless, count", unitName: "", siDefinition: "" },
        { code: 0x0, unit: "", quantity: "", unitName: "", siDefinition: "stop condition for iterator" },
    ];
    const found = dlmsUnits.find((item) => item.code === decimalCode);
    return found ? found.unit : "";
}
/**
 * Finds the name corresponding to a given OBIS code.
 *
 * @param code - A string representing the OBIS code to look up.
 * @param obisCodesWithNames - An array of objects where each object contains a `code` and `name` property.
 * @returns A string representing the name associated with the OBIS code, or "Unknown" if the code is not found.
 */
function findObisCodeName(code) {
    const obisCodesWithNames = [
        { code: "0100100700ff", name: "Power" },
        { code: "16.7.0", name: "Power" },
        { code: "01000f0700ff", name: "Power", checkSign: true },
        { code: "0100010800ff", name: "Import_total" },
        { code: "1.8.0", name: "Import_total" },
        { code: "0100010801ff", name: "Import_total_tarif_1" },
        { code: "1.8.1", name: "Import_total_tarif_1" },
        { code: "0100010802ff", name: "Import_total_tarif_2" },
        { code: "1.8.2", name: "Import_total_tarif_2" },
        { code: "0100020800ff", name: "Export_total" },
        { code: "2.8.0", name: "Export_total" },
        { code: "0100020801ff", name: "Export_total_tarif_1" },
        { code: "2.8.1", name: "Export_total_tarif_1" },
        { code: "0100020802ff", name: "Export_total_tarif_2" },
        { code: "2.8.2", name: "Export_total_tarif_2" },
        { code: "0100010800ff_in_k", name: "Import_total_(kWh)" },
        { code: "0100020800ff_in_k", name: "Export_total_(kWh)" },
        { code: "0100240700ff", name: "Power_L1" },
        { code: "36.7.0", name: "Power_L1" },
        { code: "0100380700ff", name: "Power_L2" },
        { code: "56.7.0", name: "Power_L2" },
        { code: "01004c0700ff", name: "Power_L3" },
        { code: "76.7.0", name: "Power_L3" },
        { code: "0100200700ff", name: "Voltage_L1" },
        { code: "32.7.0", name: "Voltage_L1" },
        { code: "0100340700ff", name: "Voltage_L2" },
        { code: "52.7.0", name: "Voltage_L2" },
        { code: "0100480700ff", name: "Voltage_L3" },
        { code: "72.7.0", name: "Voltage_L3" },
        { code: "01001f0700ff", name: "Current_L1" },
        { code: "31.7.0", name: "Current_L1" },
        { code: "0100330700ff", name: "Current_L2" },
        { code: "51.7.0", name: "Current_L2" },
        { code: "0100470700ff", name: "Current_L3" },
        { code: "71.7.0", name: "Current_L3" },
        { code: "01000e0700ff", name: "Net_frequency" },
        { code: "14.7.0", name: "Net_frequency" },
        { code: "0100510701ff", name: "Potential_Phase_deviation_L1/L2" },
        { code: "81.7.1", name: "Potential_Phase_deviation_L1/L2" },
        { code: "0100510702ff", name: "Potential_Phase_deviation_L1/L3" },
        { code: "81.7.2", name: "Potential_Phase_deviation_L1/L3" },
        { code: "0100510704ff", name: "Current/Potential_L1_Phase_deviation" },
        { code: "81.7.4", name: "Current/Potential_L1_Phase_deviation" },
        { code: "010051070fff", name: "Current/Potential_L2_Phase_deviation" },
        { code: "81.7.15", name: "Current/Potential_L2_Phase_deviation" },
        { code: "010051071aff", name: "Current/Potential_L3_Phase_deviation" },
        { code: "81.7.26", name: "Current/Potential_L3_Phase_deviation" },
    ];
    const found = obisCodesWithNames.find((item) => item.code === code);
    return found ? found.name : `Unknown_${code}`;
}
//# sourceMappingURL=tibberLocal.js.map