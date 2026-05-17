"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TibberLocal = void 0;
const axios_1 = __importDefault(require("axios"));
const date_fns_1 = require("date-fns");
const projectUtils_js_1 = require("./projectUtils.js");
class TibberLocal extends projectUtils_js_1.ProjectUtils {
    intervalList;
    TestData = "";
    TestMode = false;
    MetricsDataInterval = 60000;
    meterMode = 0;
    constructor(adapter) {
        super(adapter);
        this.intervalList = [];
    }
    setupOnePulseLocal(pulse) {
        try {
            this.adapter.config.PulseList[pulse].puName ??= `Pulse Local`;
            const interval = this.adapter.config.PulseList[pulse].tibberBridgeRawDataInterval;
            if (interval === undefined || interval === null || isNaN(interval) || interval < 1000) {
                this.adapter.config.PulseList[pulse].tibberBridgeRawDataInterval = 2000;
            }
            if (!this.TestMode) {
                let firstMetricsRun = true;
                let firstDataRun = true;
                this.getPulseData(pulse)
                    .then(response => {
                    this.adapter.log.debug(`Polled local Tibber Bridge metrics${firstMetricsRun ? " for the first time" : ""}: ${JSON.stringify(response)}`);
                    this.fetchPulseInfo(pulse, response, "", firstMetricsRun);
                    firstMetricsRun = false;
                })
                    .catch(e => {
                    this.adapter.log.error(`Error while polling and parsing Tibber Bridge metrics: ${e}`);
                });
                const jobBridgeMetrics = setInterval(() => {
                    this.getPulseData(pulse)
                        .then(response => {
                        this.adapter.log.debug(`Polled local Tibber Bridge metrics: ${JSON.stringify(response)}`);
                        this.fetchPulseInfo(pulse, response, "", firstMetricsRun);
                        firstMetricsRun = false;
                    })
                        .catch(e => {
                        this.adapter.log.error(`Error polling and parsing Tibber Bridge metrics: ${e}`);
                    });
                }, this.MetricsDataInterval);
                if (jobBridgeMetrics) {
                    this.intervalList.push(jobBridgeMetrics);
                }
                const jobPulseLocal = setInterval(() => {
                    this.getDataAsHexString(pulse)
                        .then(hexString => {
                        this.adapter.log.debug(`got HEX data from local pulse: ${hexString}`);
                        void this.checkAndSetValue(`LocalPulse.${pulse}.SMLDataHEX`, hexString, this.adapter.config.PulseList[pulse].puName);
                        this.adapter.log.debug(`trying to parse meter mode ${this.meterMode}`);
                        switch (this.meterMode) {
                            case 1:
                                this.extractAndParseMode1_4Messages(pulse, hexString, firstDataRun);
                                break;
                            case 3:
                                this.extractAndParseSMLMessages(pulse, hexString, firstDataRun);
                                break;
                            case 4:
                                this.extractAndParseMode1_4Messages(pulse, hexString, firstDataRun);
                                break;
                            default:
                                this.extractAndParseSMLMessages(pulse, hexString, firstDataRun);
                        }
                        firstDataRun = false;
                    })
                        .catch(error => {
                        this.adapter.log.warn(`Error local polling of Tibber Pulse RAW data: ${error}`);
                    });
                }, this.adapter.config.PulseList[pulse].tibberBridgeRawDataInterval);
                if (jobPulseLocal) {
                    this.intervalList.push(jobPulseLocal);
                }
            }
            else {
                this.adapter.log.error(`tibberLocal RUNNING IN TEST MODE`);
                const parsedMessages = void this.extractAndParseSMLMessages(0, this.TestData);
                this.adapter.log.warn(`Parsed messages from test data ${parsedMessages}`);
            }
        }
        catch (error) {
            this.adapter.log.warn(this.generateErrorMessage(error, `setup of Bridge / Pulse local poll`));
        }
    }
    clearIntervals() {
        try {
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
            this.adapter.log.error(`Error while polling metrics (getPulseData). ${error}`);
            throw error;
        }
    }
    fetchPulseInfo(pulse, obj, prefix = "", firstTime = false) {
        if (!obj || typeof obj !== "object") {
            this.adapter.log.warn(`Got bad Pulse info data to fetch!: ${obj}`);
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
                            void this.checkAndSetValue(`LocalPulse.${pulse}.PulseInfo.${prefix}${key}`, obj[key], this.adapter.config.PulseList[pulse].puName, `state`, false, false, firstTime);
                        }
                        break;
                    case "node_temperature":
                        if (typeof obj[key] === "number") {
                            void this.checkAndSetValueNumber(`LocalPulse.${pulse}.PulseInfo.${prefix}${key}`, Math.round(obj[key] * 10) / 10, `Temperature of this Tibber Pulse unit`, "°C", `value.temperature`, false, false, firstTime);
                        }
                        break;
                    case "meter_mode":
                        if (typeof obj[key] === "number") {
                            void this.checkAndSetValueNumber(`LocalPulse.${pulse}.PulseInfo.${prefix}${key}`, Math.round(obj[key] * 10) / 10, `Mode of your Pulse to grid-meter communication`, ``, `value`, false, false, firstTime);
                            this.meterMode = obj[key];
                            if (![1, 3, 4].includes(obj[key])) {
                                this.adapter.log.warn(`Potential problems with Pulse meter mode ${obj[key]}`);
                            }
                        }
                        break;
                    case "node_battery_voltage":
                        if (typeof obj[key] === "number") {
                            void this.checkAndSetValueNumber(`LocalPulse.${pulse}.PulseInfo.${prefix}${key}`, Math.round(obj[key] * 100) / 100, `Temperature of this Tibber Pulse unit`, "V", `value.voltage`, false, false, firstTime);
                        }
                        break;
                    case "node_uptime_ms":
                        if (typeof obj[key] === "number") {
                            void this.checkAndSetValueNumber(`LocalPulse.${pulse}.PulseInfo.${prefix}${key}`, obj[key], `Uptime of your Tibber Pulse in ms`, "ms", `date`, false, false, firstTime);
                            function formatMilliseconds(ms) {
                                const duration = (0, date_fns_1.intervalToDuration)({ start: 0, end: ms });
                                const formattedDuration = (0, date_fns_1.formatDuration)(duration, { format: ["months", "days", "hours", "minutes", "seconds"] });
                                const parts = formattedDuration.split(" ");
                                return parts.slice(0, 6).join(" ");
                            }
                            void this.checkAndSetValue(`LocalPulse.${pulse}.PulseInfo.${prefix}node_uptime`, formatMilliseconds(obj[key]), `Uptime of your Tibber Pulse`, `text`, false, false, firstTime);
                        }
                        break;
                    case "time_in_em0_ms":
                        if (typeof obj[key] === "number") {
                            void this.checkAndSetValueNumber(`LocalPulse.${pulse}.PulseInfo.${prefix}${key}`, obj[key], this.adapter.config.PulseList[pulse].puName, "ms", `date`, false, false, firstTime);
                        }
                        break;
                    case "time_in_em1_ms":
                        if (typeof obj[key] === "number") {
                            void this.checkAndSetValueNumber(`LocalPulse.${pulse}.PulseInfo.${prefix}${key}`, obj[key], this.adapter.config.PulseList[pulse].puName, "ms", `date`, false, false, firstTime);
                        }
                        break;
                    case "time_in_em2_ms":
                        if (typeof obj[key] === "number") {
                            void this.checkAndSetValueNumber(`LocalPulse.${pulse}.PulseInfo.${prefix}${key}`, obj[key], this.adapter.config.PulseList[pulse].puName, "ms", `date`, false, false, firstTime);
                        }
                        break;
                    default:
                        if (typeof obj[key] === "string") {
                            void this.checkAndSetValue(`LocalPulse.${pulse}.PulseInfo.${prefix}${key}`, obj[key], this.adapter.config.PulseList[pulse].puName, `info.name`, false, false, firstTime);
                        }
                        else {
                            void this.checkAndSetValueNumber(`LocalPulse.${pulse}.PulseInfo.${prefix}${key}`, obj[key], this.adapter.config.PulseList[pulse].puName, "", `info.name`, false, false, firstTime);
                        }
                }
            }
        }
    }
    async getDataAsHexString(pulse) {
        const auth = `Basic ${Buffer.from(`admin:${this.adapter.config.PulseList[pulse].tibberBridgePassword}`).toString("base64")}`;
        const options = {
            method: "GET",
            url: `http://${this.adapter.config.PulseList[pulse].tibberBridgeUrl}/data.json?node_id=${this.adapter.config.PulseList[pulse].tibberPulseLocalNodeId}`,
            headers: {
                Authorization: auth,
            },
            responseType: "arraybuffer",
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
    extractAndParseSMLMessages(pulse, transfer, forceMode = false) {
        const messages = transfer.matchAll(/7707(0100[0-9a-fA-F].{5}?ff).{4,28}62([0-9a-fA-F]{2})52([0-9a-fA-F]{2})([0-9a-fA-F]{2})((?:[0-9a-fA-F]{2}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8}|[0-9a-fA-F]{10}|[0-9a-fA-F]{8}|[0-9a-fA-F]{16}))01(?=(77)|(0101)|(\n))/g);
        const output = [];
        for (const match of messages) {
            const result = { name: "", value: 0 };
            if (this.TestMode) {
                this.adapter.log.debug(`parse SML overall compliance: ${match[0]}`);
                this.adapter.log.debug(`parse SML group 1: ${match[1]}`);
                this.adapter.log.debug(`parse SML group 2: ${match[2]}`);
                this.adapter.log.debug(`parse SML group 3: ${match[3]}`);
                this.adapter.log.debug(`parse SML group 4: ${match[4]}`);
                this.adapter.log.debug(`parse SML group 5: ${match[5]}`);
            }
            result.name = findObisCodeName(match[1]);
            if (result.name.startsWith(`Found invalid OBIS-Code:`)) {
                this.adapter.log.debug(result.name);
                continue;
            }
            if (result.name.startsWith(`Found unknown OBIS-Code:`)) {
                this.adapter.log.info(result.name);
                continue;
            }
            result.value = match[1] === "0100020800ff" ? parseInt(match[5], 16) : parseSignedHex(match[5]);
            const decimalCode = parseInt(match[2], 16);
            result.unit = findDlmsUnitByCode(decimalCode);
            const scalingFactors = { ff: 10, fe: 100, fd: 1000, fc: 10000 };
            const scaleFactor = scalingFactors[match[3].toLowerCase()];
            if (scaleFactor) {
                result.value /= scaleFactor;
            }
            if (result.value < -1000000000) {
                this.adapter.log.debug(`Result.value < -1.000.000.000 skiped!`);
                this.adapter.log.debug(JSON.stringify(result));
                this.adapter.log.debug(`overall compliance: ${match[0]}`);
                this.adapter.log.debug(`RAW: ${transfer}`);
                continue;
            }
            if (result.value > 1000000000) {
                this.adapter.log.debug(`Result.value > 1.000.000.000 skiped!`);
                this.adapter.log.debug(JSON.stringify(result));
                this.adapter.log.debug(`overall compliance: ${match[0]}`);
                this.adapter.log.debug(`RAW: ${transfer}`);
                continue;
            }
            if (result.unit == "Wh") {
                result.unit = "kWh";
                result.value = Math.round(result.value) / 1000;
            }
            void this.checkAndSetValueNumber(`LocalPulse.${pulse}.${result.name}`, result.value, this.adapter.config.PulseList[pulse].puName, result.unit, `info.name`, false, false, forceMode);
            this.adapter.log.debug(`Pulse mode 3 parse result: ${JSON.stringify(result)}`);
            const formattedMatch = match[0].replace(/(..)/g, "$1 ").trim();
            output.push(`${(0, date_fns_1.format)(new Date(), "HH:mm:ss.SSS")}: ${formattedMatch}\n`);
        }
        if (output.length > 0) {
            this.adapter.log.debug(`Format for https://tasmota-sml-parser.dicp.net :\n ${output.join("")}`);
        }
    }
    extractAndParseMode1_4Messages(pulse, transfer, forceMode = false) {
        const PulseParseResults = [];
        const asciTransfer = hexToAscii(transfer);
        const lines = asciTransfer.split("\r\n");
        for (const line of lines) {
            if (line.trim() !== "") {
                const match = line.match(/1-0:([0-9.]+)\*255\(([^*]+)\*([^*]+)\)/);
                if (match) {
                    const name = findObisCodeName(match[1]);
                    if (name.startsWith(`Found invalid OBIS-Code:`)) {
                        this.adapter.log.debug(name);
                        continue;
                    }
                    if (name.startsWith(`Found unknown OBIS-Code:`)) {
                        this.adapter.log.info(name);
                        continue;
                    }
                    const value = Math.round(Number(match[2]) * 10) / 10;
                    const unit = match[3];
                    PulseParseResults.push({ name, value, unit });
                    void this.checkAndSetValueNumber(`LocalPulse.${pulse}.${name}`, value, this.adapter.config.PulseList[pulse].puName, unit, `info.name`, false, false, forceMode);
                }
            }
        }
        this.adapter.log.debug(`Pulse mode 1 or 4 parse result: ${JSON.stringify(PulseParseResults)}`);
    }
    isValidUnixTimestampAndConvert(n) {
        const currentTime = Math.floor(Date.now() / 1000);
        if (typeof n !== "number" || n < 0 || n > currentTime || !Number.isInteger(n)) {
            return false;
        }
        const date = new Date(n * 1000);
        return date.toLocaleString("de-DE");
    }
}
exports.TibberLocal = TibberLocal;
function hexToAscii(hex) {
    let str = "";
    for (let i = 0; i < hex.length; i += 2) {
        str += String.fromCharCode(parseInt(hex.substring(i, i + 2), 16));
    }
    return str;
}
function parseSignedHex(hexStr) {
    let num = BigInt(`0x${hexStr}`);
    const bitLength = hexStr.length * 4;
    if (bitLength <= 4) {
        if (num > 0x7) {
            num = num - 0x1n;
        }
    }
    else if (bitLength <= 8) {
        if (num > 0x7f) {
            num = num - 0x100n;
        }
    }
    else if (bitLength <= 16) {
        if (num > 0x7fff) {
            num = num - 0x10000n;
        }
    }
    else if (bitLength <= 24) {
        if (num > 0x7fffff) {
            num = num - 0x1000000n;
        }
    }
    else if (bitLength <= 32) {
        if (num > 0x7fffffff) {
            num = num - 0x100000000n;
        }
    }
    else {
        if (num > 0x7fffffffffffffffn) {
            num = num - 0x10000000000000000n;
        }
    }
    return Number(num.toString());
}
function findDlmsUnitByCode(decimalCode) {
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
    const found = dlmsUnits.find(item => item.code === decimalCode);
    return found ? found.unit : "";
}
function findObisCodeName(code) {
    if (!isValidObisCode(code)) {
        return `Found invalid OBIS-Code: ${code}`;
    }
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
    return found ? found.name : `Found unknown OBIS-Code: ${code}`;
}
function isValidObisCode(code) {
    const hexRegex = /^[0-9a-f]{12}$/;
    const decRegex = /^\d{1,2}\.\d\.\d{1,2}$/;
    return hexRegex.test(code) || decRegex.test(code);
}
//# sourceMappingURL=tibberLocal.js.map