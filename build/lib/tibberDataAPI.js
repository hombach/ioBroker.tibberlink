"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TibberDataAPI = exports.DATA_API_SCOPES = exports.PKCE_CHALLENGE = exports.PKCE_VERIFIER = void 0;
const axios_1 = __importDefault(require("axios"));
const projectUtils_js_1 = require("./projectUtils.js");
const DATA_API_BASE = "https://data-api.tibber.com/v1";
const TOKEN_URL = "https://thewall.tibber.com/connect/token";
const REDIRECT_URI = "http://localhost/";
const REFRESH_TOKEN_STATE_ID = "info.tibberDataApiRefreshToken";
const TOKEN_EXPIRY_SAFETY_MS = 60_000;
exports.PKCE_VERIFIER = "9865PlBfOdFKw3itj8kQSAFA0oVs6AVX5oMo5tr7Nts11e9YUHx0_BJrTryw_D7C";
exports.PKCE_CHALLENGE = "Oey1jcnhbUa_fxI9A2NtdVrIk-QxD-9ARobHcVpOj7A";
exports.DATA_API_SCOPES = "openid offline_access data-api-homes-read data-api-vehicles-read data-api-chargers-read";
class TibberDataAPI extends projectUtils_js_1.ProjectUtils {
    tokens = null;
    constructor(adapter) {
        super(adapter);
    }
    static buildAuthUrl(clientId) {
        const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: REDIRECT_URI,
            response_type: "code",
            scope: exports.DATA_API_SCOPES,
            code_challenge: exports.PKCE_CHALLENGE,
            code_challenge_method: "S256",
            state: "iobroker",
        });
        return `https://thewall.tibber.com/connect/authorize?${params.toString()}`;
    }
    async initialize() {
        const clientId = this.adapter.config.TibberClientId;
        const clientSecret = this.adapter.config.TibberClientSecret;
        const authCode = this.adapter.config.TibberAuthCode?.trim();
        if (!clientId || !clientSecret) {
            return false;
        }
        await this.adapter.setObjectNotExistsAsync(REFRESH_TOKEN_STATE_ID, {
            type: "state",
            common: {
                name: "Tibber Data API refresh token",
                type: "string",
                role: "text",
                read: true,
                write: false,
                def: "",
            },
            native: {},
        });
        try {
            if (authCode) {
                const code = this.extractCode(authCode);
                this.tokens = await this.exchangeCode(clientId, clientSecret, code);
                await this.saveRefreshToken(this.tokens.refreshToken);
                await this.clearAuthCodeFromConfig();
                this.adapter.log.info("Tibber Data API: authorization code exchanged successfully");
            }
            else {
                const stored = await this.loadRefreshToken();
                if (!stored) {
                    this.adapter.log.info(`Tibber Data API: no auth code configured — please authorize. URL: ${TibberDataAPI.buildAuthUrl(clientId)}`);
                    return false;
                }
                this.tokens = await this.refreshTokens(clientId, clientSecret, stored);
                await this.saveRefreshToken(this.tokens.refreshToken);
                this.adapter.log.debug("Tibber Data API: access token refreshed on startup");
            }
            return true;
        }
        catch (error) {
            this.adapter.log.error(`Tibber Data API initialization failed: ${error.message}`);
            return false;
        }
    }
    async updateVehicleData() {
        const clientId = this.adapter.config.TibberClientId;
        const clientSecret = this.adapter.config.TibberClientSecret;
        if (!this.tokens || !clientId || !clientSecret) {
            return;
        }
        try {
            const accessToken = await this.getValidAccessToken(clientId, clientSecret);
            const homes = await this.fetchHomes(accessToken);
            for (const home of homes) {
                await this.processHomeDevices(accessToken, home.id);
            }
        }
        catch (error) {
            this.adapter.log.warn(`Tibber Data API vehicle update failed: ${error.message}`);
        }
    }
    extractCode(input) {
        try {
            const url = new URL(input);
            const code = url.searchParams.get("code");
            return code ?? input;
        }
        catch {
            return input;
        }
    }
    async exchangeCode(clientId, clientSecret, code) {
        const body = new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: REDIRECT_URI,
            client_id: clientId,
            client_secret: clientSecret,
            code_verifier: exports.PKCE_VERIFIER,
        });
        const response = await axios_1.default.post(TOKEN_URL, body.toString(), {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            timeout: 30_000,
        });
        return this.toTokenSet(response.data);
    }
    async refreshTokens(clientId, clientSecret, refreshToken) {
        const body = new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
        });
        const response = await axios_1.default.post(TOKEN_URL, body.toString(), {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            timeout: 30_000,
        });
        return this.toTokenSet(response.data);
    }
    toTokenSet(data) {
        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: Date.now() + data.expires_in * 1000,
        };
    }
    async getValidAccessToken(clientId, clientSecret) {
        if (!this.tokens) {
            throw new Error("TibberDataAPI is not initialized");
        }
        if (Date.now() >= this.tokens.expiresAt - TOKEN_EXPIRY_SAFETY_MS) {
            this.tokens = await this.refreshTokens(clientId, clientSecret, this.tokens.refreshToken);
            await this.saveRefreshToken(this.tokens.refreshToken);
            this.adapter.log.debug("Tibber Data API: access token refreshed proactively");
        }
        return this.tokens.accessToken;
    }
    async fetchHomes(accessToken) {
        const response = await axios_1.default.get(`${DATA_API_BASE}/homes`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 30_000,
        });
        const r = response.data;
        if (Array.isArray(r)) {
            return r;
        }
        const wrapped = r;
        return Array.isArray(wrapped.homes) ? wrapped.homes : [];
    }
    async fetchDevices(accessToken, homeId) {
        const response = await axios_1.default.get(`${DATA_API_BASE}/homes/${homeId}/devices`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 30_000,
        });
        const r = response.data;
        if (Array.isArray(r)) {
            return r;
        }
        const wrapped = r;
        return Array.isArray(wrapped.devices) ? wrapped.devices : [];
    }
    async processHomeDevices(accessToken, homeId) {
        const devices = await this.fetchDevices(accessToken, homeId);
        for (const device of devices) {
            if (this.isVehicle(device)) {
                await this.writeVehicleStates(device, homeId);
            }
        }
    }
    isVehicle(device) {
        return device.type === "vehicle" || (device.capabilities !== undefined && "storage.stateOfCharge" in device.capabilities);
    }
    sanitizeId(id) {
        return id.replace(/[^a-zA-Z0-9_-]/g, "_");
    }
    parseVin(externalId) {
        if (!externalId) {
            return "unknown";
        }
        const colonIndex = externalId.indexOf(":");
        const raw = colonIndex >= 0 ? externalId.slice(colonIndex + 1) : externalId;
        return this.sanitizeId(raw);
    }
    async writeVehicleStates(device, homeId) {
        const vin = this.parseVin(device.externalId);
        const basePath = `Vehicles.${vin}`;
        const caps = device.capabilities ?? {};
        await this.adapter.setObjectNotExistsAsync("Vehicles", {
            type: "device",
            common: { name: "Vehicles" },
            native: {},
        });
        await this.adapter.setObjectNotExistsAsync(basePath, {
            type: "channel",
            common: { name: device.name ?? vin },
            native: {},
        });
        void this.checkAndSetValue(`${basePath}.HomeId`, homeId, "Associated home ID");
        void this.checkAndSetValue(`${basePath}.LastUpdated`, new Date().toISOString(), "Timestamp of last data update");
        const soc = caps["storage.stateOfCharge"];
        if (soc !== undefined) {
            void this.checkAndSetValueNumber(`${basePath}.StateOfCharge`, Number(soc.value), "State of charge in %");
        }
        const targetSoc = caps["storage.targetStateOfCharge"];
        if (targetSoc !== undefined) {
            void this.checkAndSetValueNumber(`${basePath}.TargetStateOfCharge`, Number(targetSoc.value), "Target state of charge in %");
        }
        const range = caps["range.remaining"];
        if (range !== undefined) {
            void this.checkAndSetValueNumber(`${basePath}.Range`, Number(range.value), "Remaining range in km");
        }
        const plugStatus = caps["connector.status"];
        if (plugStatus !== undefined) {
            void this.checkAndSetValue(`${basePath}.PlugStatus`, String(plugStatus.value), "Plug connection status");
        }
        const chargingStatus = caps["charging.status"];
        if (chargingStatus !== undefined) {
            void this.checkAndSetValue(`${basePath}.ChargingStatus`, String(chargingStatus.value), "Charging status");
        }
    }
    async saveRefreshToken(token) {
        await this.adapter.setStateAsync(REFRESH_TOKEN_STATE_ID, { val: token, ack: true });
    }
    async loadRefreshToken() {
        const state = await this.adapter.getStateAsync(REFRESH_TOKEN_STATE_ID);
        const val = state?.val;
        return typeof val === "string" && val.length > 0 ? val : null;
    }
    async clearAuthCodeFromConfig() {
        try {
            const objId = `system.adapter.${this.adapter.namespace}`;
            const obj = await this.adapter.getForeignObjectAsync(objId);
            if (obj?.native) {
                obj.native.TibberAuthCode = "";
                await this.adapter.setForeignObjectAsync(objId, obj);
            }
        }
        catch (error) {
            this.adapter.log.debug(`Could not clear TibberAuthCode from config: ${error.message}`);
        }
    }
}
exports.TibberDataAPI = TibberDataAPI;
//# sourceMappingURL=tibberDataAPI.js.map