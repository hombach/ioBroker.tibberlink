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

interface DeviceCapability {
	value: unknown;
	unit?: string;
}

interface TibberDevice {
	id: string;
	name?: string;
	type?: string;
	externalId?: string;
	capabilities?: Record<string, DeviceCapability>;
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
					this.adapter.log.info(`Tibber Data API: no auth code configured — please authorize. URL: ${TibberDataAPI.buildAuthUrl(clientId)}`);
					return false;
				}
				this.tokens = await this.refreshTokens(clientId, clientSecret, stored);
				await this.saveRefreshToken(this.tokens.refreshToken);
				this.adapter.log.debug("Tibber Data API: access token refreshed on startup");
			}
			return true;
		} catch (error) {
			this.adapter.log.error(`Tibber Data API initialization failed: ${(error as Error).message}`);
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
			for (const home of homes) {
				await this.processHomeDevices(accessToken, home.id);
			}
		} catch (error) {
			this.adapter.log.warn(`Tibber Data API vehicle update failed: ${(error as Error).message}`);
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
			throw new Error("TibberDataAPI is not initialized");
		}
		if (Date.now() >= this.tokens.expiresAt - TOKEN_EXPIRY_SAFETY_MS) {
			this.tokens = await this.refreshTokens(clientId, clientSecret, this.tokens.refreshToken);
			await this.saveRefreshToken(this.tokens.refreshToken);
			this.adapter.log.debug("Tibber Data API: access token refreshed proactively");
		}
		return this.tokens.accessToken;
	}

	/**
	 * Fetches the list of homes from the Tibber Data API.
	 *
	 * @param accessToken - Valid Bearer token.
	 * @returns Array of home objects.
	 */
	private async fetchHomes(accessToken: string): Promise<TibberHome[]> {
		const response = await axios.get<TibberHome[]>(`${DATA_API_BASE}/homes`, {
			headers: { Authorization: `Bearer ${accessToken}` },
			timeout: 30_000,
		});
		return response.data;
	}

	/**
	 * Fetches the list of devices for a given home.
	 *
	 * @param accessToken - Valid Bearer token.
	 * @param homeId - The Tibber home ID.
	 * @returns Array of device objects.
	 */
	private async fetchDevices(accessToken: string, homeId: string): Promise<TibberDevice[]> {
		const response = await axios.get<TibberDevice[]>(`${DATA_API_BASE}/homes/${homeId}/devices`, {
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
		for (const device of devices) {
			if (this.isVehicle(device)) {
				await this.writeVehicleStates(device, homeId);
			}
		}
	}

	/**
	 * Determines whether a device is a vehicle based on its type or capabilities.
	 *
	 * @param device - The device to check.
	 * @returns True if the device is a vehicle.
	 */
	private isVehicle(device: TibberDevice): boolean {
		return device.type === "vehicle" || (device.capabilities !== undefined && "storage.stateOfCharge" in device.capabilities);
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
	 * @param device - Tibber device object of type vehicle.
	 * @param homeId - The home ID the vehicle is associated with.
	 */
	private async writeVehicleStates(device: TibberDevice, homeId: string): Promise<void> {
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
			this.adapter.log.debug(`Could not clear TibberAuthCode from config: ${(error as Error).message}`);
		}
	}
}
