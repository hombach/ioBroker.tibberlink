import type * as utils from "@iobroker/adapter-core";
import { TibberFeed, TibberQuery, type IConfig, type ILiveMeasurement } from "tibber-api";
import { ProjectUtils } from "./projectUtils.js";

/**
 * TibberPulse
 */
export class TibberPulse extends ProjectUtils {
	tibberConfig: IConfig;
	tibberQuery: TibberQuery;
	tibberFeed: TibberFeed;
	httpQueryUrl: string;
	countedFeedDisconnects = 0;
	lastFeedWarningTime: Date | null = null;
	deltaFeedWarningTime = 0;
	feedUnauthenticated = false;
	/** Set by {@link closePulseStream} on adapter unload - no further connects or state writes afterwards. */
	feedClosed = false;
	private readonly onConnectionChange?: (connected: boolean) => void;

	/**
	 * constructor
	 *
	 * @param tibberConfig - The Tibber config object
	 * @param adapter - ioBroker adapter instance
	 * @param onConnectionChange - Optional callback for connection changes of this feed. If given, the caller
	 * is responsible for info.connection (e.g. to combine several feeds), otherwise this feed sets it directly.
	 */
	constructor(tibberConfig: IConfig, adapter: utils.AdapterInstance, onConnectionChange?: (connected: boolean) => void) {
		super(adapter);
		this.tibberConfig = tibberConfig;
		this.onConnectionChange = onConnectionChange;
		this.tibberQuery = new TibberQuery(this.tibberConfig);
		this.tibberFeed = TibberPulse.createFeed(this.tibberQuery);
		this.httpQueryUrl = tibberConfig.apiEndpoint.queryUrl;
		this.addEventHandlerOnFeed(this.tibberFeed);
	}

	/**
	 * Creates a TibberFeed with tibber-api's own auto-reconnect enabled.
	 *
	 * @param tibberQuery - Query instance holding the config of this feed.
	 * @returns The new TibberFeed.
	 */
	private static createFeed(tibberQuery: TibberQuery): TibberFeed {
		// @KI_HINWEIS: Tibber requires jitter + exponential backoff for WebSocket reconnects
		// (https://developer.tibber.com/docs/guides/calling-api). tibber-api implements exactly that, incl. the
		// pause after HTTP 429 and the stop after 4401/4403 - so the adapter must not run its own reconnect loop.
		// parameters: idle timeout, returnAllFields, connection timeout (library defaults), autoReconnect
		return new TibberFeed(tibberQuery, 60000, false, 30000, true);
	}

	/**
	 * Reports a connection change of this feed - either to the callback given in the constructor
	 * or directly to info.connection.
	 *
	 * @param connected - true if the feed is connected
	 */
	private setConnected(connected: boolean): void {
		if (this.feedClosed) {
			return;
		}
		if (this.onConnectionChange) {
			this.onConnectionChange(connected);
		} else {
			void this.adapter.setState("info.connection", connected, true);
		}
	}

	/**
	 * Closes the feed for good (adapter unload): removes all listeners, so no reconnect or state write
	 * happens afterwards, and closes the WebSocket. Tibber limits the number of open WebSockets, so the
	 * old connection must not stay open while the adapter restarts.
	 */
	closePulseStream(): void {
		this.feedClosed = true;
		try {
			this.tibberFeed.removeAllListeners();
			// active = false closes the socket and cancels pending (re)connect timers inside tibber-api
			this.tibberFeed.active = false;
		} catch (error) {
			this.adapter.log.debug(`Error on feed close: ${(error as Error).message}`);
		}
	}

	/**
	 * connectPulseStream
	 */
	async connectPulseStream(): Promise<void> {
		if (this.feedClosed) {
			return;
		}
		if (this.feedUnauthenticated) {
			this.adapter.log.debug(`Skipping connect of Tibber feed - API token was rejected as unauthenticated`);
			return;
		}
		try {
			await this.tibberFeed.connect();
		} catch (error) {
			this.adapter.log.warn(`Error in connectPulseStream: ${(error as Error).message}`);
		}
	}

	/**
	 * Closes the current Tibber feed connection and reinitialises the feed with fresh event handlers.
	 * Removes all listeners from the old feed before closing it to prevent handler accumulation,
	 * then attaches the full set of event handlers to the newly created feed instance.
	 */
	disconnectPulseStream(): void {
		try {
			this.tibberFeed.removeAllListeners();
			this.tibberFeed.close();
		} catch (error) {
			this.adapter.log.warn(`Error on feed close: ${(error as Error).message}`);
		}
		// Reinitialize TibberFeed and re-attach event handlers
		this.tibberFeed = TibberPulse.createFeed(new TibberQuery(this.tibberConfig));
		this.addEventHandlerOnFeed(this.tibberFeed);
	}

	/**
	 * Registers all event handlers (connected, disconnected, error, data) on the given TibberFeed instance.
	 * Must be called whenever a new TibberFeed is created so all lifecycle events are properly handled.
	 *
	 * @param currentFeed - The TibberFeed instance to attach event handlers to.
	 */
	private addEventHandlerOnFeed(currentFeed: TibberFeed): void {
		// Set info.connection state for event "connected"
		currentFeed.on("connected", data => {
			this.adapter.log.debug(`Tibber feed connected: ${data.toString()}`);
			this.setConnected(true);
		});

		/**
		 * Handles the disconnection of a data feed and manages reconnection attempts with incremental delays.
		 *
		 * This method is triggered when the data feed gets disconnected. It updates the connection state (`info.connection` to `false`) and monitors the frequency of disconnections. The reconnect itself is done by tibber-api (exponential backoff with jitter).
		 *
		 * The following logic is applied:
		 * - **Disconnection count (`countedFeedDisconnects`)**: Tracks the number of disconnections. Warnings are logged when the feed disconnects 5 or 25 times. At 25 disconnections, an error is logged instead of a warning.
		 * - **Warning time interval (`deltaFeedWarningTime`)**: Measures the time (in minutes) since the last disconnection warning. If more than 60 minutes have passed, the warning counter resets.
		 * - If the feed disconnects frequently within a **30-minute window**, it logs a warning and resets the disconnection counter.
		 * - If disconnections occur too often, warnings or errors are logged based on the number of disconnections.
		 *
		 * @param data - The error message sent by Tibber upon disconnection, which is logged for diagnostic purposes.
		 */
		currentFeed.on("disconnected", data => {
			this.setConnected(false);
			if (!this.adapter.config.HomesList.some(info => info.feedActive)) {
				return;
			}
			if (this.feedUnauthenticated) {
				// token was rejected - tibber-api stops reconnecting, so must we (no endless reconnect loop)
				return;
			}

			this.deltaFeedWarningTime = this.lastFeedWarningTime ? (Date.now() - this.lastFeedWarningTime.getTime()) / 60_000 : 0;

			if (this.countedFeedDisconnects < 25 && this.deltaFeedWarningTime > 60) {
				this.countedFeedDisconnects = 0;
				this.lastFeedWarningTime = null;
				this.deltaFeedWarningTime = 0;
			}

			this.countedFeedDisconnects++;
			const loggingTextBlock = `to reconnect with increasing delay - Error text sent by Tibber: ${data.toString()}`;

			if (this.deltaFeedWarningTime > 30) {
				this.countedFeedDisconnects = 0;
				this.lastFeedWarningTime = null;
				this.adapter.log.warn(`A feed was disconnected very often. I keep trying ${loggingTextBlock}`);
			} else {
				if (this.countedFeedDisconnects == 5) {
					this.lastFeedWarningTime = new Date();
					this.adapter.log.warn(`A feed was disconnected very often. I keep trying ${loggingTextBlock}`);
				} else if (this.countedFeedDisconnects == 25) {
					this.adapter.log.error(`A feed was disconnected very often. I keep trying ${loggingTextBlock}`);
				} else {
					this.adapter.log.debug(`A feed was disconnected. I try ${loggingTextBlock}`);
				}
			}
		});

		// Add error handler on connection
		currentFeed.on("error", error => {
			if (TibberPulse.isUnauthenticatedError(error)) {
				this.handleUnauthenticated();
				return;
			}
			let errorMessage = "";
			if (error instanceof Error) {
				if (error.message) {
					errorMessage = error.message;
				} else if (error.name) {
					errorMessage = error.name;
				} else {
					errorMessage = "Unspecified error";
				}
			} else if (typeof error === "string") {
				errorMessage = error;
			} else if (Array.isArray(error) && error.length > 0) {
				errorMessage = error.map(e => (e as { message?: string })?.message ?? JSON.stringify(e)).join(", ");
			} else {
				errorMessage = "Unknown error";
			}
			this.adapter.log.warn(`Error on Tibber feed: ${errorMessage}`);
		});

		// Add data receiver
		currentFeed.on("data", data => {
			const receivedData: ILiveMeasurement = data;
			this.fetchLiveMeasurement("LiveMeasurement", receivedData);
		});
	}

	/**
	 * Checks whether an error emitted by the Tibber feed signals a rejected (invalid) API token.
	 * Since tibber-api 6 the feed emits an "Unauthenticated! Invalid token..." error and stops
	 * reconnecting by itself; GraphQL errors may also carry the code UNAUTHENTICATED.
	 *
	 * @param error - The payload of the feed "error" event (string, Error, GraphQL error array or object).
	 * @returns true if the error indicates an unauthenticated / invalid token
	 */
	static isUnauthenticatedError(error: unknown): boolean {
		const hasUnauthCode = (list: unknown): boolean =>
			Array.isArray(list) && list.some(e => (e as { extensions?: { code?: string } })?.extensions?.code === "UNAUTHENTICATED");
		if (typeof error === "string") {
			return /unauthenticated|invalid token/i.test(error);
		}
		if (error instanceof Error) {
			return /unauthenticated|invalid token/i.test(error.message);
		}
		if (Array.isArray(error)) {
			return hasUnauthCode(error);
		}
		if (error && typeof error === "object") {
			return hasUnauthCode((error as { errors?: unknown }).errors);
		}
		return false;
	}

	/**
	 * Stops all reconnect attempts of this feed after the Tibber server rejected the API token.
	 * Logs a single error instead of retrying forever; a restart of the adapter (e.g. after
	 * entering a valid token) re-enables the feed.
	 */
	private handleUnauthenticated(): void {
		this.setConnected(false);
		if (this.feedUnauthenticated) {
			return;
		}
		this.feedUnauthenticated = true;
		this.adapter.log.error(
			`Tibber feed for home ${this.tibberConfig.homeId ?? "unknown"} rejected the API token (unauthenticated) - reconnects stopped. Please verify your Tibber API token and restart the adapter.`,
		);
		try {
			this.tibberFeed.close();
		} catch (error) {
			this.adapter.log.debug(`Error on feed close after unauthenticated: ${(error as Error).message}`);
		}
	}

	/**
	 * Writes a live measurement frame received from the Tibber feed to the corresponding adapter states.
	 * Only populates optional states (accumulatedConsumption, voltages, currents, etc.) when the
	 * respective FeedConfig flags are enabled in the adapter configuration.
	 *
	 * @param objectDestination - Sub-path under `Homes.<homeId>.` where the states are written (e.g. "LiveMeasurement").
	 * @param liveMeasurement - The live measurement object received from the Tibber GraphQL subscription.
	 */
	private fetchLiveMeasurement(objectDestination: string, liveMeasurement: ILiveMeasurement | null): void {
		if (!liveMeasurement) {
			this.adapter.log.warn(`[tibberPulse]: received null liveMeasurement from Tibber feed — skipping`);
			return;
		}
		liveMeasurement.powerProduction ??= 0; // fix wrong data from Tibber in edge cases
		const power = liveMeasurement.power > 0 ? liveMeasurement.power : liveMeasurement.powerProduction > 0 ? -liveMeasurement.powerProduction : 0;

		// "minpower" should be called "minpowerConsumption" - in fact there is no correct minpower yet,
		// when we think about minpower and maxpower should be linked to "power" (positive and negative power)
		if (this.tibberConfig.homeId !== undefined) {
			const basePath = `Homes.${this.tibberConfig.homeId}.${objectDestination}`;

			void this.checkAndSetValue(`${basePath}.timestamp`, liveMeasurement.timestamp, `Timestamp when usage occurred`);
			void this.checkAndSetValueNumber(`${basePath}.power`, power, `Powerlevel measured at the moment +/-`, "W");
			void this.checkAndSetValueNumber(
				`${basePath}.lastMeterConsumption`,
				Math.round(1000 * liveMeasurement.lastMeterConsumption) / 1000,
				`Latest consumption meter state`,
				"kWh",
			);
			if (this.adapter.config.FeedConfigAccumulatedConsumption) {
				void this.checkAndSetValueNumber(
					`${basePath}.accumulatedConsumption`,
					Math.round(1000 * liveMeasurement.accumulatedConsumption) / 1000,
					`Energy consumed since midnight`,
					"kWh",
				);
			}
			if (this.adapter.config.FeedConfigAccumulatedProduction) {
				void this.checkAndSetValueNumber(
					`${basePath}.accumulatedProduction`,
					Math.round(1000 * liveMeasurement.accumulatedProduction) / 1000,
					`Energy feed into grid since midnight`,
					"kWh",
				);
			}
			if (this.adapter.config.FeedConfigAccumulatedConsumptionLastHour) {
				void this.checkAndSetValueNumber(
					`${basePath}.accumulatedConsumptionLastHour`,
					Math.round(1000 * liveMeasurement.accumulatedConsumptionLastHour) / 1000,
					`Energy consumed since since last hour shift`,
					"kWh",
				);
			}
			if (this.adapter.config.FeedConfigAccumulatedProductionLastHour) {
				void this.checkAndSetValueNumber(
					`${basePath}.accumulatedProductionLastHour`,
					Math.round(1000 * liveMeasurement.accumulatedProductionLastHour) / 1000,
					`Energy produced since last hour shift`,
					"kWh",
				);
			}
			if (this.adapter.config.FeedConfigAccumulatedCost) {
				void this.checkAndSetValueNumber(
					`${basePath}.accumulatedCost`,
					liveMeasurement.accumulatedCost,
					`Accumulated cost since midnight; requires active Tibber power deal`,
				);
			}
			if (this.adapter.config.FeedConfigAccumulatedReward) {
				void this.checkAndSetValueNumber(
					`${basePath}.accumulatedReward`,
					liveMeasurement.accumulatedReward,
					`Accumulated reward since midnight; requires active Tibber power deal`,
				);
			}
			void this.checkAndSetValue(`${basePath}.currency`, liveMeasurement.currency, "Currency of displayed cost; requires active Tibber power deal");
			void this.checkAndSetValueNumber(`${basePath}.minPower`, liveMeasurement.minPower, "Min consumption since midnight", "W");
			void this.checkAndSetValueNumber(`${basePath}.averagePower`, liveMeasurement.averagePower, "Average consumption since midnight", "W");
			void this.checkAndSetValueNumber(`${basePath}.maxPower`, liveMeasurement.maxPower, "Peak consumption since midnight", "W");
			void this.checkAndSetValueNumber(`${basePath}.powerConsumption`, liveMeasurement.power, "Net consumption (A+) at the moment", "W");
			void this.checkAndSetValueNumber(`${basePath}.powerProduction`, liveMeasurement.powerProduction, "Net grid feed-in (A-) at the moment", "W");
			void this.checkAndSetValueNumber(`${basePath}.minPowerProduction`, liveMeasurement.minPowerProduction, "Min net grid feed-in since midnight", "W");
			void this.checkAndSetValueNumber(`${basePath}.maxPowerProduction`, liveMeasurement.maxPowerProduction, "Max net grid feed-in since midnight", "W");
			void this.checkAndSetValueNumber(
				`${basePath}.lastMeterProduction`,
				Math.round(1000 * liveMeasurement.lastMeterProduction) / 1000,
				`Latest grid feed-in meter state`,
				"kWh",
			);
			void this.checkAndSetValueNumber(`${basePath}.powerFactor`, liveMeasurement.powerFactor, "Power factor (active power / apparent power)");
			if (this.adapter.config.FeedConfigPowerReactive) {
				void this.checkAndSetValueNumber(
					`${basePath}.powerReactive`,
					liveMeasurement.powerReactive,
					`Reactive power consumption (Q+) at the moment; on some meters this value is not part of every data frame therefore the value is null at some timestamps`,
					"kvar",
				);
			}
			if (this.adapter.config.FeedConfigPowerProductionReactive) {
				void this.checkAndSetValueNumber(
					`${basePath}.powerProductionReactive`,
					liveMeasurement.powerProductionReactive,
					`Net reactive power production (Q-) at the moment; on some meters this value is not part of every data frame therefore the value is null at some timestamps`,
					"kvar",
				);
			}
			void this.checkAndSetValueNumber(
				`${basePath}.signalStrength`,
				liveMeasurement.signalStrength,
				`Device signal strength (Pulse - dB; Watty - percent)`,
			);
			void this.checkAndSetValueNumber(
				`${basePath}.voltagePhase1`,
				liveMeasurement.voltagePhase1,
				`Voltage on phase 1; on some meters this value is not part of every data frame therefore the value is null at some timestamps`,
				"V",
			);
			void this.checkAndSetValueNumber(
				`${basePath}.voltagePhase2`,
				liveMeasurement.voltagePhase2,
				`Voltage on phase 2; on some meters this value is not part of every data frame therefore the value is null at some timestamps`,
				"V",
			);
			void this.checkAndSetValueNumber(
				`${basePath}.voltagePhase3`,
				liveMeasurement.voltagePhase3,
				`Voltage on phase 3; on some meters this value is not part of every data frame therefore the value is null at some timestamps`,
				"V",
			);
			void this.checkAndSetValueNumber(
				`${basePath}.currentL1`,
				liveMeasurement.currentL1,
				`Current on L1; on some meters this value is not part of every data frame therefore the value is null at some timestamps`,
				"A",
			);
			void this.checkAndSetValueNumber(
				`${basePath}.currentL2`,
				liveMeasurement.currentL2,
				`Current on L2; on some meters this value is not part of every data frame therefore the value is null at some timestamps`,
				"A",
			);
			void this.checkAndSetValueNumber(
				`${basePath}.currentL3`,
				liveMeasurement.currentL3,
				`Current on L3; on some meters this value is not part of every data frame therefore the value is null at some timestamps`,
				"A",
			);
		}
	}
}
