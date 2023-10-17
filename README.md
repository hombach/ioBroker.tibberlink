![Logo](admin/tibberlink.png)

# ioBroker.tibberlink

[![NPM version](https://img.shields.io/npm/v/iobroker.tibberlink.svg)](https://www.npmjs.com/package/iobroker.tibberlink)
![NPM version (stable)](https://iobroker.live/badges/tibberlink-stable.svg)
[![Downloads](https://img.shields.io/npm/dm/iobroker.tibberlink.svg)](https://www.npmjs.com/package/iobroker.tibberlink)
![Number of Installations (latest)](https://iobroker.live/badges/tibberlink-installed.svg)
[![Known Vulnerabilities](https://snyk.io/test/github/hombach/ioBroker.tibberlink/badge.svg)](https://snyk.io/test/github/hombach/ioBroker.tibberlink)

**CI-Tests:**
![Test and Release](https://github.com/hombach/ioBroker.tibberlink/workflows/Test%20and%20Release/badge.svg)
[![CodeQL](https://github.com/hombach/ioBroker.tibberlink/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/hombach/ioBroker.tibberlink/actions/workflows/codeql-analysis.yml)
[![Appveyor-CI](https://ci.appveyor.com/api/projects/status/github/hombach/ioBroker.tibberlink?branch=master&svg=true)](https://ci.appveyor.com/project/hombach/iobroker-tibberlink)

[![NPM](https://nodei.co/npm/iobroker.tibberlink.png?downloads=true)](https://nodei.co/npm/iobroker.tibberlink/)

## Adapter for utilizing TIBBER energy data in ioBroker

This adapter connects data from your Tibber account API for use in ioBroker. It can be used for single or multiple homes.

If you're not a Tibber user currently, it would be greatly appreciated if you use my referral link:
[https://invite.tibber.com/2gwuign3.](https://invite.tibber.com/2gwuign3.)

## Standard Configuration

-   Create a new instance of the adapter
-   You will also need an API token from Tibber. Get it here: [https://developer.tibber.com/](https://developer.tibber.com/)
-   Enter your Tibber API token in the standard settings and create at least one line for live feed configuration (select "None available").
-   Save the settings and exit the configaration to restart the adapter (your home(s) will now be queried from the Tibber server).
-   Return to the configuration screen and select the homes from which you want to pull real-time data from your Tibber Pulse or select homes and disable the feed - (!! Only works if hardware is installed and the Tibber server has verified the connection to Pulse).
-   Save the settings.

## Calculator Configuration

-   Since the Tibber connection is up and running, you can also use the Calculator to include some automation add-ons in the TibberLink adapter.
-   The Calculator works with channels. Each channel is linked to a selected home.
-   Channels can be activated or deactivated in a corresponding state.
-   All states of a calculator channel are placed near the homes states, named by the channel number.
-   The behavior of a channel is defined by its type: "best cost"; "best single hours"; "best hours block" - not implemented yet.
-   Each channel has an external state as output, which can be chosen in the settings tab. This state could be, for example, "0_userdata.0.example_state" or any other writable external state.
-   The values to be written to the output state can be defined in "value YES" and "value NO," e.g., "true" for boolean states, or a number or text to be written.
-   Outputs:
    -   "Best cost": Uses the "TriggerPrice" state as input - output is "YES" every hour the current Tibber energy cost is below the trigger price.
    -   'Best single hours' - output is 'YES' in the cheapest number of hours. Number is defined in state 'AmountHours'.
    -   "Best hours block" - not implemented yet.

## Notes

This adapter uses Sentry libraries to automatically report exceptions and code errors to the developers. For more details and information on how to disable the error reporting; see the [Sentry-Plugin Documentation](https://github.com/ioBroker/plugin-sentry#plugin-sentry)! Sentry reporting is used starting with js-controller 3.0.

## Changelog

! Note that missing version entries are typically dependency updates for improved security.

### 1.2.0 (2023-10-1x) WORK in PROGRESS

-   (HombachC) implement tibber calculator mode "best single hours" (#16)
-   (HombachC) changed i18n files to inline translations, single files aren't update compatible (#128)
-   (HombachC) fixed error in initial read of calculator states

### 1.1.2 (2023-10-15)

-   (HombachC) fix timing error in calculator

### 1.1.1 (2023-10-14)

-   (HombachC) fix error in startup of additional channels

### 1.1.0 (2023-10-14)

-   (HombachC) implement tibber calculator mode "best price" (#16)
-   (HombachC) precised pull times of current cost
-   (HombachC) reduced error messages (#80)
-   (HombachC) extend documentation
-   (HombachC) update adapter-core

### 1.0.0 (2023-10-05)

-   (HombachC) Increase to the first major release, as now a stable level is reached
-   (HombachC) Code cleanup

### 0.4.2 (2023-10-03)

-   (HombachC) fixed error with polling multiple homes live data (#108)
-   (HombachC) Lots of dependency updates; code optimizations

### 0.4.1 (2023-09-24)

-   (HombachC) Hardened 2 typeerrors uppon sentry recognition
-   (HombachC) Fix error with not deleted averages of tomorrow pricing (#95)
-   (HombachC) preparations for tibber calculator

### 0.4.0 (2023-09-20)

-   (HombachC) Added daily average price values (#89)

### 0.3.3 (2023-09-17)

-   (HombachC) Fixed false positive connection message (#87)
-   (HombachC) Updated translations with ChatGPT
-   (HombachC) preparations for tibber calculator

### 0.3.2 (2023-09-14)

-   (HombachC) Fixed error when starting adapter first time (#82)
-   (HombachC) Fixed error in admin config from 0.3.0 (#81)

### 0.3.1 (2023-09-13)

-   (HombachC) Mitigate error in admin config from 0.3.0 (#81)
-   (HombachC) Change logging of TibberFeed errors from type error to type warn - because of too many downtimes of Tibber server (#80)

### 0.3.0 (2023-09-12)

-   (HombachC) BREAKING: change Pulse usage to be configurable for all homes seperately (#41)
-   (HombachC) optimize code again to mitigate set state timing for long JSON states (#68)
-   (HombachC) preparations for tibber calculator

### 0.2.7 (2023-09-07)

-   (HombachC) reducing polls at Tibber server by precheck of current price data
-   (HombachC) preparations for tibber calculator

### 0.2.6 (2023-09-04)

-   (HombachC) fix error with boolean states

### 0.2.5 (2023-09-03)

-   (HombachC) optimize code to mitigate set state timing for long JSON states (#68)

### 0.2.4 (2023-08-30)

-   (HombachC) enable correct price poll also for adapter running in different timezones (#63)

### 0.2.3 (2023-08-27)

-   (HombachC) fix error in 0.2.2 in start conditions of adapter

### 0.2.2 (2023-08-24)

-   (HombachC) reducing polls at Tibber server by precheck of known data
-   (HombachC) code optimizations
-   (HombachC) fix config screen (#55)

### 0.2.1 (2023-08-21)

-   (HombachC) double timeout for Tibber server queries

### 0.2.0 (2023-08-18)

-   (HombachC) introduces JSONs for prices sorted by price ascending
-   (HombachC) fix stupid error for obsolete next day pricing (#23, #50)

### 0.1.10 (2023-08-15)

-   (HombachC) bump dependencies, code cleanups
-   (HombachC) preparations for tibber calculator
-   (HombachC) mitigate multi homes & pulse problems (#41)
-   (HombachC) add documentation to config screen (#47)

### 0.1.9 (2023-08-14)

-   (HombachC) optimizing fetching homes list (#32) after Tibber server error, restart adapter in case of trouble

### 0.1.8 (2023-08-12)

-   (HombachC) bump dev-dependencies, fix eslint/prettier issue

### 0.1.7 (2023-08-11)

-   (HombachC) code cleanup, fix error for obsolete next day pricing (#23)
-   (HombachC) add another try/catch while fetching homes list (#32)

### 0.1.6 (2023-07-30)

-   (HombachC) add units for live data, bump adapter-core to 3.x

### 0.1.5 (2023-07-18)

-   (HombachC) fix error in sentry logging

### 0.1.4 (2023-07-17)

-   (HombachC) BREAKING: encrypted API-Token in ioBroker
-   (HombachC) rearranged configuration options
-   (HombachC) fixed bug in state generation

### 0.1.3 (2023-07-17)

-   (HombachC) all log messages in English
-   (HombachC) remove unused state change handler
-   (HombachC) fixed state roles

### 0.1.2 (2023-07-17)

-   (HombachC) round grid consumption meter values to Wh accuracy
-   (HombachC) hide unused checkboxes in config
-   (HombachC) fix snyc and appveyor

### 0.1.1 (2023-07-16)

-   (HombachC) remove release script and dev-server

### 0.1.0 (2023-07-14)

-   (HombachC) initial version

## License

GNU General Public License v3.0 only

Copyright (c) 2023 Hombach <TibberLink@homba.ch>
