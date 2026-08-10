import type * as utils from "@iobroker/adapter-core";
import axios from "axios";
import { ProjectUtils } from "./projectUtils.js";

const DATA_API_BASE = "https://data-api.tibber.com/v1";
const TOKEN_URL = "https://thewall.tibber.com/connect/token";
const REDIRECT_URI = "http://localhost/";
const REFRESH_TOKEN_STATE_ID = "info.tibberDataApiRefreshToken";
const TOKEN_EXPIRY_SAFETY_MS = 60_000;

/**
 * Fixed PKCE verifier — avoids per-session random generation.
 * Security is provided by the client_secret, not by the verifier alone.
 */
export const PKCE_VERIFIER = "9865PlBfOdFKw3itj8kQSAFA0oVs6AVX5oMo5tr7Nts11e9YUHx0_BJrTryw_D7C";

/** SHA-256 / base64url hash of PKCE_VERIFIER. */
export const PKCE_CHALLENGE = "Oey1jcnhbUa_fxI9A2NtdVrIk-QxD-9ARobHcVpOj7A";

/** OAuth2 scopes requested from the Tibber Data API. */
export const DATA_API_SCOPES = "openid offline_access data-api-homes-read data-api-vehicles-read data-api-chargers-read";

interface TokenResponse {
	access_token: string;
	refresh_token: string;
	expires_in: number;
}

interface TokenSet {
	accessToken: string;
	refreshToken: string;
	expiresAt: number;
}

interface TibberHome {
	id: string;
}

/** Device as returned by GET /homes/{homeId}/devices (list endpoint — no live data). */
interface TibberDevice {
	id: string;
	externalId?: string;
	info?: { name?: string; brand?: string; model?: string };
}

/** Capability entry as returned by GET /homes/{homeId}/devices/{deviceId} (detail endpoint). */
interface DeviceCapability {
	id: string;
	value: unknown;
	unit?: string;
	description?: string;
	availableValues?: string[];
}

/** Full device detail as returned by GET /homes/{homeId}/devices/{deviceId}. */
interface TibberDeviceDetail {
	id: string;
	externalId?: string;
	info?: { name?: string; brand?: string; model?: string };
	status?: { lastSeen?: string };
	capabilities?: DeviceCapability[];
}

/**
 * Client for the Tibber Data API (https://data-api.tibber.com/v1).
 * Handles OAuth2 PKCE authentication and polls vehicle/charger data.
 */
export class TibberDataAPI extends ProjectUtils {
	private tokens: TokenSet | null = null;

	/**
	 * constructor
	 *
	 * @param adapter - ioBroker adapter instance
	 */
	constructor(adapter: utils.AdapterInstance) {
		super(adapter);
	}

	/**
	 * Builds the OAuth2 authorization URL for a given client ID.
	 *
	 * @param clientId - The Tibber Data API client ID.
	 * @returns The full authorization URL the user must open in a browser.
	 */
	static buildAuthUrl(clientId: string): string {
		const params = new URLSearchParams({
			client_id: clientId,
			redirect_uri: REDIRECT_URI,
			response_type: "code",
			scope: DATA_API_SCOPES,
			code_challenge: PKCE_CHALLENGE,
			code_challenge_method: "S256",
			state: "iobroker",
		});
		return `https://thewall.tibber.com/connect/authorize?${params.toString()}`;
	}

	/**
	 * Initializes the Data API client.
	 * Exchanges the auth code if one is configured, otherwise uses the stored refresh token.
	 *
	 * @returns True if initialization was successful, false otherwise.
	 */
	async initialize(): Promise<boolean> {
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
			} else {
				const stored = await this.loadRefreshToken();
				if (!stored) {
					this.adapter.log.warn(`[tibberDataAPI]: no auth code configured — please authorize. URL: ${TibberDataAPI.buildAuthUrl(clientId)}`);
					return false;
				}
				this.tokens = await this.refreshTokens(clientId, clientSecret, stored);
				await this.saveRefreshToken(this.tokens.refreshToken);
				this.adapter.log.debug("[tibberDataAPI]: access token refreshed on startup");
			}
			return true;
		} catch (error) {
			this.adapter.log.error(`[tibberDataAPI]: initialization failed: ${(error as Error).message}`);
			return false;
		}
	}

	/**
	 * Fetches vehicle data from all homes and writes it to ioBroker states.
	 */
	async updateVehicleData(): Promise<void> {
		const clientId = this.adapter.config.TibberClientId;
		const clientSecret = this.adapter.config.TibberClientSecret;
		if (!this.tokens || !clientId || !clientSecret) {
			return;
		}
		try {
			const accessToken = await this.getValidAccessToken(clientId, clientSecret);
			const homes = await this.fetchHomes(accessToken);
			this.adapter.log.debug(`[tibberDataAPI]: found ${homes.length} home(s)`);
			for (const home of homes) {
				await this.processHomeDevices(accessToken, home.id);
			}
		} catch (error) {
			this.adapter.log.warn(`[tibberDataAPI]: vehicle update failed: ${(error as Error).message}`);
		}
	}

	/**
	 * Extracts the authorization code from a full callback URL or returns the input as-is.
	 *
	 * @param input - Either a full callback URL (http://localhost/?code=…) or a bare code string.
	 * @returns The extracted code.
	 */
	private extractCode(input: string): string {
		try {
			const url = new URL(input);
			const code = url.searchParams.get("code");
			return code ?? input;
		} catch {
			return input;
		}
	}

	/**
	 * Exchanges an authorization code for an access/refresh token pair.
	 *
	 * @param clientId - OAuth2 client ID.
	 * @param clientSecret - OAuth2 client secret.
	 * @param code - Authorization code from the OAuth2 callback.
	 * @returns The token set.
	 */
	private async exchangeCode(clientId: string, clientSecret: string, code: string): Promise<TokenSet> {
		const body = new URLSearchParams({
			grant_type: "authorization_code",
			code,
			redirect_uri: REDIRECT_URI,
			client_id: clientId,
			client_secret: clientSecret,
			code_verifier: PKCE_VERIFIER,
		});
		const response = await axios.post<TokenResponse>(TOKEN_URL, body.toString(), {
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			timeout: 30_000,
		});
		return this.toTokenSet(response.data);
	}

	/**
	 * Uses a refresh token to obtain a new access/refresh token pair.
	 *
	 * @param clientId - OAuth2 client ID.
	 * @param clientSecret - OAuth2 client secret.
	 * @param refreshToken - The stored refresh token.
	 * @returns The new token set.
	 */
	private async refreshTokens(clientId: string, clientSecret: string, refreshToken: string): Promise<TokenSet> {
		const body = new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: refreshToken,
			client_id: clientId,
			client_secret: clientSecret,
		});
		const response = await axios.post<TokenResponse>(TOKEN_URL, body.toString(), {
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			timeout: 30_000,
		});
		return this.toTokenSet(response.data);
	}

	/**
	 * Converts a raw token response to a TokenSet with an absolute expiry timestamp.
	 *
	 * @param data - The raw token response from the token endpoint.
	 * @returns Structured token set.
	 */
	private toTokenSet(data: TokenResponse): TokenSet {
		return {
			accessToken: data.access_token,
			refreshToken: data.refresh_token,
			expiresAt: Date.now() + data.expires_in * 1000,
		};
	}

	/**
	 * Returns a valid access token, refreshing it proactively if it is about to expire.
	 *
	 * @param clientId - OAuth2 client ID.
	 * @param clientSecret - OAuth2 client secret.
	 * @returns A valid access token string.
	 */
	private async getValidAccessToken(clientId: string, clientSecret: string): Promise<string> {
		if (!this.tokens) {
			throw new Error("[tibberDataAPI]: TibberDataAPI is not initialized");
		}
		if (Date.now() >= this.tokens.expiresAt - TOKEN_EXPIRY_SAFETY_MS) {
			this.tokens = await this.refreshTokens(clientId, clientSecret, this.tokens.refreshToken);
			await this.saveRefreshToken(this.tokens.refreshToken);
			this.adapter.log.debug("[tibberDataAPI]: access token refreshed proactively");
		}
		return this.tokens.accessToken;
	}

	/**
	 * Fetches the list of homes from the Tibber Data API.
	 * The endpoint may return either a plain array or a wrapped `{ homes: [...] }` object.
	 *
	 * @param accessToken - Valid Bearer token.
	 * @returns Array of home objects.
	 */
	private async fetchHomes(accessToken: string): Promise<TibberHome[]> {
		const response = await axios.get<TibberHome[] | { homes: TibberHome[] }>(`${DATA_API_BASE}/homes`, {
			headers: { Authorization: `Bearer ${accessToken}` },
			timeout: 30_000,
		});
		const r = response.data;
		if (Array.isArray(r)) {
			return r;
		}
		const wrapped = r as { homes?: TibberHome[] };
		return Array.isArray(wrapped.homes) ? wrapped.homes : [];
	}

	/**
	 * Fetches the list of devices for a given home.
	 * The endpoint may return either a plain array or a wrapped `{ devices: [...] }` object.
	 *
	 * @param accessToken - Valid Bearer token.
	 * @param homeId - The Tibber home ID.
	 * @returns Array of device objects.
	 */
	private async fetchDevices(accessToken: string, homeId: string): Promise<TibberDevice[]> {
		const response = await axios.get<TibberDevice[] | { devices: TibberDevice[] }>(`${DATA_API_BASE}/homes/${homeId}/devices`, {
			headers: { Authorization: `Bearer ${accessToken}` },
			timeout: 30_000,
		});
		const r = response.data;
		if (Array.isArray(r)) {
			return r;
		}
		const wrapped = r as { devices?: TibberDevice[] };
		return Array.isArray(wrapped.devices) ? wrapped.devices : [];
	}

	/**
	 * Fetches the full detail of a single device including live capabilities.
	 *
	 * @param accessToken - Valid Bearer token.
	 * @param homeId - The Tibber home ID.
	 * @param deviceId - The device ID.
	 * @returns Full device detail including capabilities array.
	 */
	private async fetchDevice(accessToken: string, homeId: string, deviceId: string): Promise<TibberDeviceDetail> {
		const response = await axios.get<TibberDeviceDetail>(`${DATA_API_BASE}/homes/${homeId}/devices/${deviceId}`, {
			headers: { Authorization: `Bearer ${accessToken}` },
			timeout: 30_000,
		});
		return response.data;
	}

	/**
	 * Fetches and processes all devices for a home, writing vehicle states.
	 *
	 * @param accessToken - Valid Bearer token.
	 * @param homeId - The Tibber home ID.
	 */
	private async processHomeDevices(accessToken: string, homeId: string): Promise<void> {
		const devices = await this.fetchDevices(accessToken, homeId);
		this.adapter.log.debug(`[tibberDataAPI]: home ${homeId} — found ${devices.length} device(s)`);
		for (const device of devices) {
			// Isolate each device: a single malformed device must not abort the whole poll.
			try {
				const detail = await this.fetchDevice(accessToken, homeId, device.id);
				this.adapter.log.debug(`[tibberDataAPI]: device "${detail.info?.name ?? detail.id}" caps=${JSON.stringify(detail.capabilities ?? [])}`);
				if (this.isVehicle(detail)) {
					await this.writeVehicleStates(detail, homeId);
				} else if (this.isCharger(detail)) {
					await this.writeChargerStates(detail, homeId);
				} else {
					// Deliberately skip unrecognized device types (e.g. future PV inverters / heat pumps)
					// so they can be added consciously instead of being written as chargers by default.
					this.adapter.log.debug(
						`[tibberDataAPI]: device "${detail.info?.name ?? detail.id}" is neither vehicle nor charger — skipping (caps: ${(detail.capabilities ?? []).map(c => c.id).join(", ") || "none"})`,
					);
				}
			} catch (error) {
				this.adapter.log.warn(`[tibberDataAPI]: failed to process device ${device.id}: ${(error as Error).message}`);
			}
		}
	}

	/**
	 * Determines whether a device is a vehicle based on its capabilities array.
	 *
	 * Uses `range.remaining` (estimated driving range) as the discriminator rather than
	 * `storage.stateOfCharge`, because a battery/PV inverter can also report a state of charge —
	 * only a vehicle has a driving range.
	 *
	 * @param device - Full device detail from the detail endpoint.
	 * @returns True if the device reports a remaining driving range.
	 */
	private isVehicle(device: TibberDeviceDetail): boolean {
		return device.capabilities?.some(c => c.id === "range.remaining") ?? false;
	}

	/**
	 * Determines whether a device is a charger (EVSE/wallbox) based on its capabilities array.
	 *
	 * Uses the presence of a charge-current control capability (`charging.current.*`, e.g.
	 * `charging.current.max`) as the discriminator. `connector.status`/`charging.status` alone are
	 * not sufficient, as vehicles report those too; only an EVSE controls the charge current.
	 *
	 * @param device - Full device detail from the detail endpoint.
	 * @returns True if the device reports a charge-current control capability.
	 */
	private isCharger(device: TibberDeviceDetail): boolean {
		return device.capabilities?.some(c => c.id.startsWith("charging.current.")) ?? false;
	}

	/**
	 * Sanitizes a string for use as an ioBroker state path segment.
	 *
	 * @param id - Raw identifier string.
	 * @returns Sanitized string with only alphanumeric, dash, and underscore characters.
	 */
	private sanitizeId(id: string): string {
		return id.replace(/[^a-zA-Z0-9_-]/g, "_");
	}

	/**
	 * Extracts and sanitizes the VIN from a Tibber externalId field.
	 * Tibber externalId format: "vendor:VIN", e.g. "vw:WVWZZZ1JZXW123456".
	 *
	 * @param externalId - Raw externalId string from the Tibber device.
	 * @returns Sanitized VIN string suitable for an ioBroker state path.
	 */
	private parseVin(externalId?: string): string {
		if (!externalId) {
			return "unknown";
		}
		const colonIndex = externalId.indexOf(":");
		const raw = colonIndex >= 0 ? externalId.slice(colonIndex + 1) : externalId;
		return this.sanitizeId(raw);
	}

	/**
	 * Creates or updates ioBroker states for a vehicle device.
	 *
	 * @param device - Full device detail from the Tibber Data API detail endpoint.
	 * @param homeId - The home ID the vehicle is associated with.
	 */
	private async writeVehicleStates(device: TibberDeviceDetail, homeId: string): Promise<void> {
		const vin = this.parseVin(device.externalId);
		const displayName = device.info?.name ?? vin;
		const caps = device.capabilities ?? [];
		const findCap = (id: string): DeviceCapability | undefined => caps.find(c => c.id === id);

		this.adapter.log.debug(`[tibberDataAPI]: writing states for vehicle "${displayName}" (VIN: ${vin}), caps: ${caps.map(c => c.id).join(", ") || "none"}`);
		const basePath = `Vehicles.${vin}`;

		await this.checkAndSetDevice("Vehicles");
		await this.checkAndSetChannel(basePath, displayName);
		void this.checkAndSetValue(`${basePath}.HomeId`, homeId, "Associated home ID");
		void this.checkAndSetValue(`${basePath}.LastUpdated`, new Date().toISOString(), "Timestamp of last data update");
		if (device.status?.lastSeen) {
			void this.checkAndSetValue(`${basePath}.LastSeen`, device.status.lastSeen, "Timestamp the device was last seen by Tibber", "date");
		}

		const soc = findCap("storage.stateOfCharge");
		if (soc !== undefined) {
			void this.checkAndSetValueNumber(`${basePath}.StateOfCharge`, Number(soc.value), "State of charge in %", "%", "value.battery");
		}

		const targetSoc = findCap("storage.targetStateOfCharge");
		if (targetSoc !== undefined) {
			void this.checkAndSetValueNumber(`${basePath}.TargetStateOfCharge`, Number(targetSoc.value), "Target state of charge in %", "%", "value.battery");
		}

		const range = findCap("range.remaining");
		if (range !== undefined) {
			const rangeKm = range.unit === "m" ? Number(range.value) / 1000 : Number(range.value);
			void this.checkAndSetValueNumber(`${basePath}.Range`, rangeKm, "Remaining range in km", "km", "value.distance");
		}

		const plugStatus = findCap("connector.status");
		if (plugStatus !== undefined) {
			void this.checkAndSetValue(`${basePath}.PlugStatus`, String(plugStatus.value), "Plug connection status", "info.status");
		}

		const chargingStatus = findCap("charging.status");
		if (chargingStatus !== undefined) {
			void this.checkAndSetValue(`${basePath}.ChargingStatus`, String(chargingStatus.value), "Charging status", "info.status");
		}
	}

	/**
	 * Creates or updates ioBroker states for a charger (or any non-vehicle) device.
	 *
	 * Charger capabilities differ between brands (e.g. go-e vs. Wallbox Pulsar Plus), so instead of a
	 * fixed curated mapping this writes every reported capability generically: one state per capability,
	 * named after its (sanitized) capability id, typed by the reported value and labelled with the
	 * API-provided description. This way any charger surfaces all of its data without code changes.
	 *
	 * @param device - Full device detail from the Tibber Data API detail endpoint.
	 * @param homeId - The home ID the charger is associated with.
	 */
	private async writeChargerStates(device: TibberDeviceDetail, homeId: string): Promise<void> {
		const key = this.parseDeviceKey(device.externalId, device.id);
		const displayName = device.info?.name ?? key;
		const caps = device.capabilities ?? [];

		this.adapter.log.debug(`[tibberDataAPI]: writing states for charger "${displayName}" (${key}), caps: ${caps.map(c => c.id).join(", ") || "none"}`);
		const basePath = `Chargers.${key}`;

		await this.checkAndSetDevice("Chargers");
		await this.checkAndSetChannel(basePath, displayName);
		void this.checkAndSetValue(`${basePath}.HomeId`, homeId, "Associated home ID");
		void this.checkAndSetValue(`${basePath}.LastUpdated`, new Date().toISOString(), "Timestamp of last data update");
		if (device.status?.lastSeen) {
			void this.checkAndSetValue(`${basePath}.LastSeen`, device.status.lastSeen, "Timestamp the device was last seen by Tibber", "date");
		}
		if (device.info?.brand) {
			void this.checkAndSetValue(`${basePath}.Brand`, device.info.brand, "Charger brand");
		}
		if (device.info?.model) {
			void this.checkAndSetValue(`${basePath}.Model`, device.info.model, "Charger model");
		}

		for (const cap of caps) {
			this.writeCapabilityState(basePath, cap);
		}
	}

	/**
	 * Writes a single device capability to an ioBroker state, choosing the state type from the
	 * reported value: boolean → indicator, number (or numeric string) → value, anything else → text
	 * (objects/arrays are serialized to JSON).
	 *
	 * @param basePath - The device's base state path (e.g. `Chargers.<id>`).
	 * @param cap - The capability entry to write.
	 */
	private writeCapabilityState(basePath: string, cap: DeviceCapability): void {
		const stateName = `${basePath}.${this.sanitizeId(cap.id)}`;
		const description = cap.description ?? cap.id;
		const value = cap.value;

		if (typeof value === "boolean") {
			void this.checkAndSetValueBoolean(stateName, value, description);
			return;
		}
		if (typeof value === "number") {
			void this.checkAndSetValueNumber(stateName, value, description, cap.unit);
			return;
		}
		if (typeof value === "string") {
			const numeric = Number(value);
			if (value.trim() !== "" && !Number.isNaN(numeric)) {
				void this.checkAndSetValueNumber(stateName, numeric, description, cap.unit);
			} else {
				void this.checkAndSetValue(stateName, value, description, "info.status");
			}
			return;
		}
		if (value !== null && value !== undefined) {
			void this.checkAndSetValue(stateName, JSON.stringify(value), description, "json");
		}
	}

	/**
	 * Derives a stable, path-safe key for a device from its externalId (`vendor:serial`) or, if absent
	 * or empty, from its device id.
	 *
	 * The externalId may be missing OR an empty string (the Wallbox Pulsar Plus reports an empty
	 * externalId, #925), so a plain `??` fallback is not enough — an empty/blank candidate must fall
	 * through to the next one. A key that sanitizes to empty (which would produce an invalid id ending
	 * in ".") is rejected.
	 *
	 * @param externalId - Raw externalId string from the Tibber device, if any.
	 * @param fallbackId - The device id to use when no usable externalId is present.
	 * @returns Sanitized key suitable for an ioBroker state path, or "unknown" if nothing usable.
	 */
	private parseDeviceKey(externalId: string | undefined, fallbackId: string): string {
		for (const source of [externalId, fallbackId]) {
			if (!source || source.trim() === "") {
				continue;
			}
			const colonIndex = source.indexOf(":");
			const raw = colonIndex >= 0 ? source.slice(colonIndex + 1) : source;
			// sanitize, then strip leading/trailing separators so the key can never be empty or dot-ended
			const key = this.sanitizeId(raw).replace(/^[_-]+|[_-]+$/g, "");
			if (key !== "") {
				return key;
			}
		}
		return "unknown";
	}

	/**
	 * Persists the refresh token to the adapter's state store.
	 *
	 * @param token - The refresh token string to save.
	 */
	private async saveRefreshToken(token: string): Promise<void> {
		await this.adapter.setStateAsync(REFRESH_TOKEN_STATE_ID, { val: token, ack: true });
	}

	/**
	 * Loads the stored refresh token from the adapter's state store.
	 *
	 * @returns The refresh token, or null if none is stored.
	 */
	private async loadRefreshToken(): Promise<string | null> {
		const state = await this.adapter.getStateAsync(REFRESH_TOKEN_STATE_ID);
		const val = state?.val;
		return typeof val === "string" && val.length > 0 ? val : null;
	}

	/**
	 * Clears the TibberAuthCode from the adapter's persisted config so it is not re-used on restart.
	 */
	private async clearAuthCodeFromConfig(): Promise<void> {
		try {
			const objId = `system.adapter.${this.adapter.namespace}`;
			const obj = await this.adapter.getForeignObjectAsync(objId);
			if (obj?.native) {
				(obj.native as Record<string, unknown>).TibberAuthCode = "";
				await this.adapter.setForeignObjectAsync(objId, obj);
			}
		} catch (error) {
			this.adapter.log.debug(`[tibberDataAPI]: Could not clear TibberAuthCode from config: ${(error as Error).message}`);
		}
	}
}
