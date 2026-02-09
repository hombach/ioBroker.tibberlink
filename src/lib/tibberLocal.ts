import type * as utils from "@iobroker/adapter-core";
import axios, { type AxiosRequestConfig, type AxiosResponse } from "axios";
import { format, formatDuration, intervalToDuration } from "date-fns";
import { ProjectUtils } from "./projectUtils.js";

/**
 * TibberLocal
 */
export class TibberLocal extends ProjectUtils {
	intervalList: NodeJS.Timeout[];
	TestData = "";
	// example HEX strings  -  meter mode 3 e.g. for "ISKRA ISK00 7034" meters
	// TestData: string = `1b1b1b1b01010101760512923b426200620072630101760101050630be6c0b090149534b0004316b61010163a9b600760512923b43620062007263070177010b090149534b0004316b61070100620affff726201650b7415f27a77078181c78203ff010101010449534b0177070100000009ff010101010b090149534b0004316b610177070100010800ff65000101a001621e52ff59000000000ee32fcb0177070100010801ff0101621e52ff59000000000ee32fcb0177070100010802ff0101621e52ff5900000000000000000177070100020800ff0101621e52ff590000000007318ead0177070100020801ff0101621e52ff590000000007318ead0177070100020802ff0101621e52ff5900000000000000000177070100100700ff0101621b520055fffffff10177078181c78205ff010101018302268dd6b5bfb5760a1b2c763b034bd3af9863ea9000593a8da767ec1ba01e9b6e8d52fa200e7ec7517fc100295699650b01010163d03800760512923b4462006200726302017101630a84001b1b1b1b1a00a9f2`;

	// example HEX strings  -  meter mode 3 e.g. for "EasyMeter Q3AA2064" meters
	// TestData: string = `1b1b1b1b01010101760b455359416ebd0ac96831620062007263010176010445535908455359781168310b09014553591103bf6ebd0101638b0d00760b455359416ebd0ac96832620062007263070177010b09014553591103bf6ebd080100620affff0072620165039878117677078181c78203ff01010101044553590177070100000009ff010101010b09014553591103bf6ebd0177070100010800ff6400008001621e52fc5900000007fdd4f5c60177070100020800ff6400008001621e52fc5900000000002009db0177070100100700ff0101621b52fe5900000000000028d60177078181c7f006ff010101010401003e0101016305d800760b455359416ebd0ac968336200620072630201710163c13b000000001b1b1b1b1a032b3e`;

	// example HEX strings  -  #704 - special to check signing error in total export 208
	// TestData: string = `1b1b1b1b010101017605032ec3db6200620072630101760107ffffffffffff05010f969f0b0a014546522102cf806f72620165055c5cfb016334b6007605032ec3dc62006200726307017707ffffffffffff0b0a014546522102cf806f070100620affff72620165055c5cfbf106770701006032010101010101044546520177070100600100ff010101010b0a014546522102cf806f0177070100010800ff641c780472620165055c5cfb621e52ff650425f6160177070100020800ff0172620165055c5cfb621e52ff649174630177070100100700ff0101621b520053f9eb0177070100200700ff0101622352ff6308ca0177070100340700ff0101622352ff6308fc0177070100480700ff0101622352ff6308fb01770701001f0700ff0101622152fe62db0177070100330700ff0101622152fe62c30177070100470700ff0101622152fe6301570177070100510701ff01016208520052770177070100510702ff0101620852005300ee0177070100510704ff0101620852005300d6017707010051070fff0101620852005300c0017707010051071aff0101620852005300bc01770701000e0700ff0101622c52ff6301f3017707010000020000010101010630332e30300177070100605a0201010101010342bd01770701006161000001010101030000017707010060320104010101010850312e322e3132017707010060320404010101010304220101016350e5007605032ec3dd620062007263020171016378f9001b1b1b1b1a00b129`;

	// example HEX strings  -  for "EMH eHZB-W24E8-0LHP0-D6-A5Q2" meters
	// TestData: string = `1b1b1b1b0101010176050001b85c6200620072630101760107ffffffffffff05000092ca0b0a01454d480000a9476d726201650000a401620163f6170076050001b85d62006200726307017707ffffffffffff0b0a01454d480000a9476d070100620affff726201650000a4017477070100603201010101010104454d480177070100600100ff010101010b0a01454d480000a9476d0177070100010800ff641c6d04726201650000a401621e52036900000000000000020177070100020800ff01726201650000a401621e520369000000000000002e01010163ddea0076050001b85e62006200726302017101636f720000001b1b1b1b1a020b62`;

	// TestMode = true;
	TestMode = false;
	MetricsDataInterval = 60000;
	meterMode = 0;
	//negSignPattern: string = "77070100010800ff6301a";

	/**
	 *
	 * @param adapter - ioBroker adapter instance
	 */
	constructor(adapter: utils.AdapterInstance) {
		super(adapter);
		this.intervalList = [];
	}

	/**
	 * setupOnePulseLocal
	 *
	 * @param pulse - ID of the Tibber Pulse
	 */
	setupOnePulseLocal(pulse: number): void {
		try {
			this.adapter.config.PulseList[pulse].puName ??= `Pulse Local`;

			const interval = this.adapter.config.PulseList[pulse].tibberBridgeRawDataInterval;
			if (interval === undefined || interval === null || isNaN(interval) || interval < 1000) {
				this.adapter.config.PulseList[pulse].tibberBridgeRawDataInterval = 2000;
			}

			if (!this.TestMode) {
				let firstMetricsRun = true;
				let firstDataRun = true;
				//#region *** get Tibber Bridge metrics first time
				this.getPulseData(pulse)
					.then(response => {
						this.adapter.log.debug(
							`Polled local Tibber Bridge metrics${firstMetricsRun ? " for the first time" : ""}: ${JSON.stringify(response)}`,
						);
						this.fetchPulseInfo(pulse, response, "", firstMetricsRun);
						firstMetricsRun = false;
					})
					.catch(e => {
						this.adapter.log.error(`Error while polling and parsing Tibber Bridge metrics: ${e}`);
					});
				//#endregion

				//#region *** setup Tibber Bridge metrics job
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
				//#endregion
				//#region *** setup Tibber Pulse data job
				const jobPulseLocal = setInterval(() => {
					// poll data and log as HEX string
					this.getDataAsHexString(pulse)
						.then(hexString => {
							this.adapter.log.debug(`got HEX data from local pulse: ${hexString}`); // log data as HEX string
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
				//#endregion
			} else {
				// test mode
				this.adapter.log.error(`tibberLocal RUNNING IN TEST MODE`);
				const parsedMessages = void this.extractAndParseSMLMessages(0, this.TestData);
				this.adapter.log.warn(`Parsed messages from test data ${parsedMessages}`);
			}
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `setup of Bridge / Pulse local poll`));
		}
	}

	/**
	 * Clears all active intervals.
	 *
	 * This method iterates over all interval jobs stored in `this.intervalList` and clears each one.
	 * If an error occurs during this process, it logs a warning message.
	 */
	clearIntervals(): void {
		try {
			// Here we must clear all intervals that may still be active
			for (const intervalJob of this.intervalList) {
				clearInterval(intervalJob);
			}
		} catch (e) {
			this.adapter.log.warn((e as Error).message);
		}
	}

	private async getPulseData(pulse: number): Promise<string> {
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
			const response = await axios.request({
				url: options.path,
				method: options.method,
				baseURL: `http://${options.hostname}`,
				headers: options.headers,
			});
			if (response.data) {
				response.data = JSON.parse(JSON.stringify(response.data).replace(/\$type/g, "type"));
			}
			return response.data;
		} catch (error) {
			this.adapter.log.error(`Error while polling metrics (getPulseData). ${error}`);
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
	 */
	private fetchPulseInfo(pulse: number, obj: any, prefix = "", firstTime = false): void {
		if (!obj || typeof obj !== "object") {
			this.adapter.log.warn(`Got bad Pulse info data to fetch!: ${obj}`); //
		}
		for (const key in obj) {
			if (typeof obj[key] === "object") {
				this.fetchPulseInfo(pulse, obj[key], `${prefix}${key}.`, firstTime);
			} else {
				switch (key) {
					case "timestamp":
						// eslint-disable-next-line no-case-declarations
						const TimeValue = this.isValidUnixTimestampAndConvert(obj[key]);
						if (TimeValue) {
							obj[key] = TimeValue;
							void this.checkAndSetValue(
								`LocalPulse.${pulse}.PulseInfo.${prefix}${key}`,
								obj[key],
								this.adapter.config.PulseList[pulse].puName,
								`state`,
								false,
								false,
								firstTime,
							);
						}
						break;
					case "node_temperature":
						if (typeof obj[key] === "number") {
							void this.checkAndSetValueNumber(
								`LocalPulse.${pulse}.PulseInfo.${prefix}${key}`,
								Math.round(obj[key] * 10) / 10,
								`Temperature of this Tibber Pulse unit`,
								"°C",
								`value.temperature`,
								false,
								false,
								firstTime,
							);
						}
						break;
					case "meter_mode":
						if (typeof obj[key] === "number") {
							void this.checkAndSetValueNumber(
								`LocalPulse.${pulse}.PulseInfo.${prefix}${key}`,
								Math.round(obj[key] * 10) / 10,
								`Mode of your Pulse to grid-meter communication`,
								``,
								`value`,
								false,
								false,
								firstTime,
							);
							this.meterMode = obj[key];
							if (![1, 3, 4].includes(obj[key])) {
								this.adapter.log.warn(`Potential problems with Pulse meter mode ${obj[key]}`);
							}
						}
						break;
					case "node_battery_voltage":
						if (typeof obj[key] === "number") {
							void this.checkAndSetValueNumber(
								`LocalPulse.${pulse}.PulseInfo.${prefix}${key}`,
								Math.round(obj[key] * 100) / 100,
								`Temperature of this Tibber Pulse unit`,
								"V",
								`value.voltage`,
								false,
								false,
								firstTime,
							);
						}
						break;
					case "node_uptime_ms":
						if (typeof obj[key] === "number") {
							void this.checkAndSetValueNumber(
								`LocalPulse.${pulse}.PulseInfo.${prefix}${key}`,
								obj[key],
								`Uptime of your Tibber Pulse in ms`,
								"ms",
								`date`,
								false,
								false,
								firstTime,
							);
							function formatMilliseconds(ms: number): string {
								const duration = intervalToDuration({ start: 0, end: ms });
								const formattedDuration = formatDuration(duration, { format: ["months", "days", "hours", "minutes", "seconds"] });
								// Output: "229 days 3 hours 17 minutes 2 seconds"
								// view only first 3 blocks
								const parts = formattedDuration.split(" ");
								return parts.slice(0, 6).join(" "); // slice(0, 4) um die ersten zwei Blöcke (jeweils Einheit und Wert) zu erhalten
								// Output: "229 days 3 hours 17 minutes"
							}
							void this.checkAndSetValue(
								`LocalPulse.${pulse}.PulseInfo.${prefix}node_uptime`,
								formatMilliseconds(obj[key]),
								`Uptime of your Tibber Pulse`,
								`text`,
								false,
								false,
								firstTime,
							);
						}
						break;
					case "time_in_em0_ms":
						if (typeof obj[key] === "number") {
							void this.checkAndSetValueNumber(
								`LocalPulse.${pulse}.PulseInfo.${prefix}${key}`,
								obj[key],
								this.adapter.config.PulseList[pulse].puName,
								"ms",
								`date`,
								false,
								false,
								firstTime,
							);
						}
						break;
					case "time_in_em1_ms":
						if (typeof obj[key] === "number") {
							void this.checkAndSetValueNumber(
								`LocalPulse.${pulse}.PulseInfo.${prefix}${key}`,
								obj[key],
								this.adapter.config.PulseList[pulse].puName,
								"ms",
								`date`,
								false,
								false,
								firstTime,
							);
						}
						break;
					case "time_in_em2_ms":
						if (typeof obj[key] === "number") {
							void this.checkAndSetValueNumber(
								`LocalPulse.${pulse}.PulseInfo.${prefix}${key}`,
								obj[key],
								this.adapter.config.PulseList[pulse].puName,
								"ms",
								`date`,
								false,
								false,
								firstTime,
							);
						}
						break;
					default:
						if (typeof obj[key] === "string") {
							void this.checkAndSetValue(
								`LocalPulse.${pulse}.PulseInfo.${prefix}${key}`,
								obj[key],
								this.adapter.config.PulseList[pulse].puName,
								`info.name`,
								false,
								false,
								firstTime,
							);
						} else {
							void this.checkAndSetValueNumber(
								`LocalPulse.${pulse}.PulseInfo.${prefix}${key}`,
								obj[key],
								this.adapter.config.PulseList[pulse].puName,
								"",
								`info.name`,
								false,
								false,
								firstTime,
							);
						}
				}
			}
		}
	}

	/**
	 * Retrieves data as a hex string from a specified pulse device.
	 *
	 * @param pulse - A number representing the index of the Pulse device in the PulseList configuration.
	 * @returns A Promise that resolves with the data as a hex string if successful.
	 * @throws Will throw an error if the HTTP request fails.
	 */
	private async getDataAsHexString(pulse: number): Promise<string> {
		const auth = `Basic ${Buffer.from(`admin:${this.adapter.config.PulseList[pulse].tibberBridgePassword}`).toString("base64")}`;
		const options: AxiosRequestConfig = {
			method: "GET",
			url: `http://${this.adapter.config.PulseList[pulse].tibberBridgeUrl}/data.json?node_id=${this.adapter.config.PulseList[pulse].tibberPulseLocalNodeId}`,
			headers: {
				Authorization: auth,
			},
			responseType: "arraybuffer", // important for handling binary data
		};
		try {
			const response: AxiosResponse<ArrayBuffer> = await axios(options);
			const buffer = Buffer.from(response.data);
			const hexString = buffer.toString("hex");
			return hexString;
		} catch (error) {
			this.adapter.log.error(`An error occured during local poll of Pulse data (getDataAsHexString)`);
			throw error;
		}
	}

	/**
	 * Extracts and parses Mode 3 energy meter messages from a hexadecimal string.
	 *
	 * @param pulse - An identifier for the pulse.
	 * @param transfer - A string representing the hexadecimal mode 3 message to be parsed.
	 * @param forceMode - An optional boolean indicating whether to force the mode (default is false).
	 */
	private extractAndParseSMLMessages(pulse: number, transfer: string, forceMode = false): void {
		/**
		 * Represents the result of parsing a pulse signal.
		 */
		interface PulseParseResult {
			/**
			 * The name or identifier of the pulse signal.
			 */
			name: string;

			/**
			 * The numeric value of the pulse.
			 */
			value: number;

			/**
			 * The unit of measurement for the pulse value (optional).
			 */
			unit?: string;
		}
		const messages = transfer.matchAll(
			/7707(0100[0-9a-fA-F].{5}?ff).{4,28}62([0-9a-fA-F]{2})52([0-9a-fA-F]{2})([0-9a-fA-F]{2})((?:[0-9a-fA-F]{2}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8}|[0-9a-fA-F]{10}|[0-9a-fA-F]{8}|[0-9a-fA-F]{16}))01(?=(77)|(0101)|(\n))/g,
		);
		const output: string[] = [];
		for (const match of messages) {
			const result: PulseParseResult = { name: "", value: 0 };
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
			//result.value = parseSignedHex(match[5]); // #704
			result.value = match[1] === "0100020800ff" ? parseInt(match[5], 16) : parseSignedHex(match[5]); // code 208 always unsigned !! #704
			const decimalCode = parseInt(match[2], 16);
			result.unit = findDlmsUnitByCode(decimalCode);

			const scalingFactors = { ff: 10, fe: 100, fd: 1000, fc: 10000 };
			const scaleFactor = scalingFactors[match[3].toLowerCase()];
			if (scaleFactor) {
				result.value /= scaleFactor;
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
				// WiP result.value = Math.round(result.value / 10) / 100;
				result.value = Math.round(result.value) / 1000;
			}
			void this.checkAndSetValueNumber(
				`LocalPulse.${pulse}.${result.name}`,
				result.value,
				this.adapter.config.PulseList[pulse].puName,
				result.unit,
				`info.name`,
				false,
				false,
				forceMode,
			);
			this.adapter.log.debug(`Pulse mode 3 parse result: ${JSON.stringify(result)}`);
			const formattedMatch = match[0].replace(/(..)/g, "$1 ").trim();
			// WiP  output.push(`${getCurrentTimeFormatted()}: ${formattedMatch}\n`);
			output.push(`${format(new Date(), "HH:mm:ss.SSS")}: ${formattedMatch}\n`);
		}
		if (output.length > 0) {
			this.adapter.log.debug(`Format for https://tasmota-sml-parser.dicp.net :\n ${output.join("")}`);
		}
	}

	/**
	 * Extracts and parses Mode 1 and 4 energy meter messages from a hexadecimal string.
	 *
	 * This method takes a hexadecimal string representing Mode 1 or 4 meter messages, converts it to an ASCII string,
	 * and then parses the string to extract relevant measurement data. The extracted data includes the name,
	 * value, and unit of each measurement, which are then processed and logged.
	 *
	 * @param pulse - An identifier for the pulse.
	 * @param transfer - A string representing the hexadecimal Mode 1 or 4 messages to be parsed.
	 * @param forceMode - An optional boolean indicating whether to force the mode (default is false).
	 */
	private extractAndParseMode1_4Messages(pulse: number, transfer: string, forceMode = false): void {
		/**
		 * Represents the result of parsing a pulse signal.
		 */
		interface PulseParseResult {
			/**
			 * The name or identifier of the pulse signal.
			 */
			name: string;

			/**
			 * The numeric value of the pulse.
			 */
			value: number;

			/**
			 * The unit of measurement for the pulse value (optional).
			 */
			unit?: string;
		}

		const PulseParseResults: PulseParseResult[] = [];
		// example HEX strings  -  meter mode 1 e.g. for "ZPA GH305" meters
		// transfer = `2f5a50413547483330352e76322d32302e30302d470d0a0d0a02312d303a432e312e302a32353528315a504130303235313337353738290d0a312d303a312e382e302a323535283031383131362e333030322a6b5768290d0a312d303a312e382e312a323535283030303030302e303030302a6b5768290d0a312d303a312e382e322a323535283031383131362e333030322a6b5768290d0a312d303a322e382e302a323535283031393330362e303938392a6b5768290d0a312d303a31362e372e302a323535282d3030333039342a57290d0a312d303a33322e372e302a323535283233332e352a56290d0a312d303a35322e372e302a323535283233332e332a56290d0a312d303a37322e372e302a323535283233332e392a56290d0a312d303a33312e372e302a323535283030322e39382a41290d0a312d303a35312e372e302a323535283030352e33302a41290d0a312d303a37312e372e302a323535283030352e33302a41290d0a312d303a38312e372e312a323535283132302a646567290d0a312d303a38312e372e322a323535283234302a646567290d0a312d303a38312e372e342a323535283139342a646567290d0a312d303a38312e372e31352a323535283138362a646567290d0a312d303a38312e372e32362a323535283139342a646567290d0a312d303a31342e372e302a3235352835302e302a487a290d0a312d303a302e322e302a323535287665722e32302c44363841393343372c3230323030343039290d0a312d303a432e39302e322a323535284436384139334337290d0a312d303a462e462a32353528303030303030290d0a312d303a432e352e302a323535283030314337393034290d0a312d303a33362e372e302a323535282d3030303637332a57290d0a312d303a35362e372e302a323535282d3030313232322a57290d0a312d303a37362e372e302a323535282d3030313139312a57290d0a312d303a312e382e302a39362830303030392e382a6b5768290d0a312d303a312e382e302a39372830303037362e302a6b5768290d0a312d303a312e382e302a39382830303334372e342a6b5768290d0a312d303a312e382e302a39392830383136392e312a6b5768290d0a312d303a312e382e302a3130302831383131362e332a6b5768290d0a210d0a033c`;
		// transfer = `2f5a50413547483330352e76322d32302e30302d470d0a0d0a02312d303a432e312e302a32353528315a504130303235313337353738290d0a312d303a312e382e302a323535283031383138332e363136372a6b5768290d0a312d303a312e382e312a323535283030303030302e303030302a6b5768290d0a312d303a312e382e322a323535283031383138332e363136372a6b5768290d0a312d303a322e382e302a323535283031393336372e343232382a6b5768290d0a312d303a31362e372e302a323535282d3030303032362a57290d0a312d303a33322e372e302a323535283233302e312a56290d0a312d303a35322e372e302a323535283232392e302a56290d0a312d303a37322e372e302a323535283232392e382a56290d0a312d303a33312e372e302a323535283030322e30382a41290d0a312d303a35312e372e302a323535283030312e31322a41290d0a312d303a37312e372e302a323535283030322e30302a41290d0a312d303a38312e372e312a323535283132302a646567290d0a312d303a38312e372e322a323535283234302a646567290d0a312d303a38312e372e342a323535283139382a646567290d0a312d303a38312e372e31352a323535283332312a646567290d0a312d303a38312e372e32362a323535283330302a646567290d0a312d303a31342e372e302a3235352835302e302a487a290d0a312d303a302e322e302a323535287665722e32302c44363841393343372c3230323030343039290d0a312d303a432e39302e322a323535284436384139334337290d0a312d303a462e462a32353528303030303030290d0a312d303a432e352e302a323535283030314331393034290d0a312d303a33362e372e302a323535282d3030303432332a57290d0a312d303a35362e372e302a323535283030303138372a57290d0a312d303a37362e372e302a323535283030303232312a57290d0a312d303a312e382e302a39362830303030342e302a6b5768290d0a312d303a312e382e302a39372830303037392e342a6b5768290d0a312d303a312e382e302a39382830303339392e362a6b5768290d0a312d303a312e382e302a39392830383138312e352a6b5768290d0a312d303a312e382e302a3130302831383138332e362a6b5768290d0a210d0a0334`;

		// example HEX string  -  meter mode 4 e.g. for "eBZ DD3" meters
		// transfer = `2f45425a35444433325230364454415f3130370d0a312d303a302e302e302a323535283145425a30313031303033313331290d0a312d303a39362e312e302a323535283145425a30313031303033313331290d0a312d303a312e382e302a323535283030373435392e37383437313635322a6b5768290d0a312d303a312e382e312a323535283030303030312e3030332a6b5768290d0a312d303a312e382e322a323535283030373435382e3738312a6b5768290d0a312d303a322e382e302a323535283032373532312e33393931323739342a6b5768290d0a312d303a31362e372e302a323535283030303030322e36392a57290d0a312d303a33362e372e302a323535283030303133352e39352a57290d0a312d303a35362e372e302a323535283030303233392e39312a57290d0a312d303a37362e372e302a323535282d3030303337332e31372a57290d0a312d303a33322e372e302a323535283233362e312a56290d0a312d303a35322e372e302a323535283233352e372a56290d0a312d303a37322e372e302a323535283233392e312a56290d0a312d303a39362e352e302a323535283030314334313034290d0a302d303a39362e382e302a323535283036344641453235290d0a210d0a`;

		const asciTransfer = hexToAscii(transfer);
		const lines = asciTransfer.split("\r\n");
		for (const line of lines) {
			// Check if the line is not empty
			if (line.trim() !== "") {
				// Parse the line to extract name, value, and unit
				const match = line.match(/1-0:([0-9.]+)\*255\(([^*]+)\*([^*]+)\)/);
				//	1-0:1.8.2*255(007458.781*kWh)\r\n
				//	1-0:2.8.0*255(027521.39912794*kWh)\r\n

				if (match) {
					const name: string = findObisCodeName(match[1]);
					if (name.startsWith(`Found invalid OBIS-Code:`)) {
						this.adapter.log.debug(name);
						continue;
					}
					if (name.startsWith(`Found unknown OBIS-Code:`)) {
						this.adapter.log.info(name);
						continue;
					}
					const value: number = Math.round(Number(match[2]) * 10) / 10;
					const unit: string = match[3];

					// Push the parsed measurement into the measurements array
					PulseParseResults.push({ name, value, unit });
					void this.checkAndSetValueNumber(
						`LocalPulse.${pulse}.${name}`,
						value,
						this.adapter.config.PulseList[pulse].puName,
						unit,
						`info.name`,
						false,
						false,
						forceMode,
					);
				}
			}
		}
		this.adapter.log.debug(`Pulse mode 1 or 4 parse result: ${JSON.stringify(PulseParseResults)}`);
	}

	/**
	 * Validates a Unix timestamp and converts it to a German date-time string.
	 *
	 * @param n - A number representing the Unix timestamp to validate and convert.
	 * @returns A string representing the date-time in German format if the timestamp is valid, otherwise returns false.
	 */
	private isValidUnixTimestampAndConvert(n: number): false | string {
		// Typüberprüfung und Bereichsüberprüfung (optional)
		const currentTime = Math.floor(Date.now() / 1000);
		if (typeof n !== "number" || n < 0 || n > currentTime || !Number.isInteger(n)) {
			return false;
		}
		// convert to German format
		const date = new Date(n * 1000);
		return date.toLocaleString("de-DE"); // WiP: use system string instead of always German; use date-fns
	}
}

/**
 * Converts a hexadecimal string to its ASCII representation.
 * This method takes a hexadecimal string as input and converts each pair of hexadecimal digits to their corresponding ASCII character, constructing the resulting ASCII string.
 *
 * @param hex - A string representing the hexadecimal values to be converted.
 * @returns A string containing the ASCII representation of the hexadecimal input.
 */
function hexToAscii(hex: string): string {
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
function parseSignedHex(hexStr: string): number {
	let num = BigInt(`0x${hexStr}`);
	const bitLength = hexStr.length * 4;
	if (bitLength <= 4) {
		// Behandlung als 4-Bit-Zahl
		if (num > 0x7) {
			num = num - 0x1n;
		}
	} else if (bitLength <= 8) {
		// Behandlung als 8-Bit-Zahl
		if (num > 0x7f) {
			num = num - 0x100n;
		}
	} else if (bitLength <= 16) {
		// Behandlung als 16-Bit-Zahl
		if (num > 0x7fff) {
			num = num - 0x10000n;
		}
	} else if (bitLength <= 24) {
		// Behandlung als 16-Bit-Zahl
		if (num > 0x7fffff) {
			num = num - 0x1000000n;
		}
	} else if (bitLength <= 32) {
		// Behandlung als 32-Bit-Zahl
		if (num > 0x7fffffff) {
			num = num - 0x100000000n;
		}
	} else {
		// Behandlung als 64-Bit-Zahl
		if (num > 0x7fffffffffffffffn) {
			num = num - 0x10000000000000000n;
		}
	}
	return Number(num.toString());
}

/**
 * Retrieves the current time formatted as a string in "HH:mm:ss.SSS" format.
 *
 * @returns A string representing the current time in "HH:mm:ss.SSS" format.
 */
//WiP   function getCurrentTimeFormatted(): string {
//	const now = new Date();
//	return format(now, "HH:mm:ss.SSS");
//}
//WiP   function getCurrentTimeFormatted(): string {
//	return format(new Date(), "HH:mm:ss.SSS");
//}

/**
 * Finds the DLMS unit corresponding to a given decimal code.
 *
 * @param decimalCode - A number representing the DLMS code to look up.
 * @returns A string representing the unit associated with the DLMS code, or an empty string if the code is not found.
 */
function findDlmsUnitByCode(decimalCode: number): string {
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
	const found = dlmsUnits.find(item => item.code === decimalCode);
	return found ? found.unit : "";
}

/**
 * Finds the name corresponding to a given OBIS code.
 *
 * @param code - A string representing the OBIS code to look up.
 * @returns A string representing the name associated with the OBIS code, or "Unknown" if the code is not found.
 */
function findObisCodeName(code: string): string {
	// Check if the provided OBIS code is valid
	if (!isValidObisCode(code)) {
		return `Found invalid OBIS-Code: ${code}`;
	}
	// https://github.com/Apollon77/smartmeter-obis/blob/master/lib/ObisNames.js
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
	const found = obisCodesWithNames.find((item: any) => item.code === code);
	return found ? found.name : `Found unknown OBIS-Code: ${code}`;
}

/**
 * Checks if the provided OBIS code is valid.
 *
 * This function verifies whether a given OBIS code conforms to one of two possible formats:
 * - Hexadecimal format: exactly 12 hexadecimal characters.
 * - Decimal format: three groups of digits separated by dots.
 *
 * @param code - The OBIS code to be validated.
 * @returns Returns true if the code matches either the hexadecimal or decimal format, false otherwise.
 */
function isValidObisCode(code: string): boolean {
	// Regex for hexadecimal format: exactly 12 hexadecimal characters
	const hexRegex = /^[0-9a-f]{12}$/;
	// Regex for decimal format: three groups of digits separated by dots
	const decRegex = /^\d{1,2}\.\d\.\d{1,2}$/;
	// Check if the code matches either of the two formats
	return hexRegex.test(code) || decRegex.test(code);
}
