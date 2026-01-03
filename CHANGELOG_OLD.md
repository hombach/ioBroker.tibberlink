![Logo](admin/tibberlink.png)

# ioBroker.tibberlink

## Versions

![Beta](https://img.shields.io/npm/v/iobroker.tibberlink.svg?color=red&label=beta)
![Stable](https://iobroker.live/badges/tibberlink-stable.svg)
![Installed](https://iobroker.live/badges/tibberlink-installed.svg)

[![NPM](https://nodei.co/npm/iobroker.tibberlink.png?downloads=true)](https://nodei.co/npm/iobroker.tibberlink/)

## Adapter for Utilizing TIBBER energy data in ioBroker

This adapter facilitates the connection of data from your Tibber account's API to be used within ioBroker, whether for a single home or multiple residences.

If you're not currently a Tibber user, I would greatly appreciate it if you could use my referral link: [Tibber Referral Link](https://invite.tibber.com/mu8c82n5).

## Changelog - OLD CHANGES

## 5.0.4 (2025-09-27)

- (HombachC) prepared price updates to 15 minutes resolution (#384)
- (HombachC) update tibber-api to 5.4.2
- (HombachC) update chai system

## 5.0.3 (2025-09-17)

- (HombachC) fix jsonconfig schema definition (#762)
- (HombachC) optimize cron jobs
- (HombachC) update axios

## 5.0.2 (2025-08-29)

- (HombachC) min admin 7.6.17 as recommended (#754)
- (HombachC) update adapter-core
- (HombachC) bump typescript

### 5.0.1 (2025-08-15)

- (HombachC) add decoder for EMH eHZB IMSys
- (HombachC) remove creation of not feeded states
- (HombachC) fix typo in error message (#731)
- (HombachC) fix vulnerability
- (HombachC) change power production to be polled by default (#721)

### 5.0.0 (2025-05-30)

- (HombachC) BREAKING: dropped node.js 18 support (#703)
- (HombachC) BREAKING: dropped js-controller 5 support (#703)
- (HombachC) add tests for node.js 24 (#717)

### 4.5.4 (2025-05-18)

- (HombachC) fix special cases of local export value (#704)
- (HombachC) remove tests for node.js 18
- (HombachC) optimize asynchron code

### 4.5.3 (2025-05-17)

- (HombachC) optimize shutdown-logic (#707)
- (HombachC) update tibber-api

### 4.5.2 (2025-04-18)

- (HombachC) fix jsonConfig error (#686)
- (HombachC) add statevalue range to projectUtils
- (HombachC) code optimizations

### 4.5.1 (2025-03-23)

- (HombachC) fix Smart Battery Buffer JSON2 (#676)
- (HombachC) fix not visible SBB LTF output 2 (#681)
- (HombachC) enable JSON5 parsing starting with admin 7.5.3
- (HombachC) fix vulnerability in axios <1.8.2 (#673)

### 4.5.0 (2025-03-05)

- (HombachC) add calculator channel 'smart battery buffer LTF' (#668)
- (HombachC) rearrange calculator channels in configuration
- (HombachC) improve debugging messages, code optimisations
- (HombachC) fix 2 errors in enable/disable FlexCharts

### 4.4.0 (2025-03-01)

- (HombachC) add generation time cutoffs for graph outputs (#643)
- (HombachC) set admin to minimum 7.4.10 as recommended by ioBroker (#651)
- (HombachC) Code optimisations, preparations to switch to ESM module
- (HombachC) bump cron to 4.x.x (#648)
- (HombachC) bump axios from 1.8.x (#664)

### 4.3.1 (2025-02-23)

- (HombachC) Bump "@iobroker/adapter-dev" to 1.4.0 (#653)
- (HombachC) start using "@alcalzone/release-script" (#650)
- (HombachC) add option to enable/disable FlexCharts-JSON for each channel (#642)
- (HombachC) fix logging for multiple homes (#647)
- (HombachC) fix encrypted element "tibberBridgePassword" (#652)

### 4.3.0 (2025-02-09)

- (HombachC) added ioBroker.FlexCharts - JSON
- (HombachC) Update tibber-api to 5.2.1 - handle obsolete data as default, remove option
- (HombachC) Calculate outputJSON prior to time frame for channels of type 'BestSingleHours', 'BestHoursBlock', 'BestPercentage', 'BestCost' and their LTF variants (#592)
- (HombachC) add outputJSON and outputJSON2 for 'SmartBatteryBuffer' channels (#592)
- (HombachC) calculator and projectUtils code optimizations
- (HombachC) correct role of stats states to json

### 4.2.3 (2025-01-14)

- (HombachC) bump cron to 3.5

### 4.2.2 (2025-01-14)

- (HombachC) max API-Token lenght now 80 to meet newest Tibber accounts (#627)

### 4.2.1 (2025-01-08)

- (HombachC) fix missing translation

### 4.2.0 (2025-01-08)

- (HombachC) fix error in BestHoursBlock LTF intruduced in 4.x (#618)
- (HombachC) add new calculator channels 'BestPercentage' and 'BestPercentageLTF' (#616)
- (HombachC) add outputJSON for 'BestSingleHours', 'BestHoursBlock', 'BestPercentage', 'BestCost' and their LTF variants (#592)
- (HombachC) fixed some i18n translations
- (HombachC) year 2025 changes
- (HombachC) code optimization

### 4.1.1 (2024-12-21)

- (HombachC) code cleanup
- (HombachC) fix translations
- (HombachC) fix chai-as-promised

### 4.1.0 (2024-12-15)

- (HombachC) enable local poll also without Token (#613)
- (HombachC) split jsonConfig.json to multiple files
- (HombachC) fix typo in translation handling
- (HombachC) bump cron

### 4.0.0 (2024-12-08)

- (HombachC) BREAKING: dropped support for ioBroker.admin < 7.0.0 because of ioBroker Responsive Design Initiative (#544)
- (HombachC) redesigned admin tab for calculator
- (HombachC) optimize translations, added more tooltips
- (HombachC) fix repeated calculation of LTF channels (#593)
- (HombachC) added BlockStart / BlockEnd as date string (#516)
- (HombachC) throttle sentry messaging
- (HombachC) add prices yesterday (#600)

### 3.5.4 (2024-12-01)

- (HombachC) add warning when LTF stop time isn't same or next day and provide docu
- (HombachC) fix error in calculator channel 'best single hours' (#594)
- (HombachC) intruduce 'iobroker/eslint-config' (#591)
- (HombachC) performance optimizations

### 3.5.3 (2024-11-23)

- (HombachC) fix edge case in output state setup and usage
- (HombachC) optimzed state subscription
- (HombachC) update deprecated state calls
- (HombachC) add await to delObjectAsync
- (HombachC) harmonize project tools

### 3.5.2 (2024-10-30)

- (HombachC) add verification for YES/NO 2 values in calculator (#547)
- (HombachC) optimized responsive design (#544)
- (HombachC) migrate eslint to >9.x
- (HombachC) switch to ES2022 code
- (HombachC) adapted to new API constraints (#546)
- (HombachC) replace deprecated setStateAsync by setState

### 3.5.1 (2024-10-05)

- (HombachC) changed to less feed disconnection warnings in log (#445)
- (HombachC) fix error in output2 of smart battery buffer (#538)
- (HombachC) update deprecated state calls

### 3.5.0 (2024-10-02)

- (HombachC) update adapter core
- (HombachC) fix error in SML decoder
- (HombachC) add 2 new SML scale factor codes (#535)

### 3.4.10 (2024-09-16)

- (HombachC) add verification of poll interval (#518)
- (HombachC) bumb date-fns to 4.0.0

### 3.4.9 (2024-09-15)

- (HombachC) add adjustable Bridge poll intervall (#518)
- (HombachC) add node.js 22 to the adapter testing (#519)
- (HombachC) add docu link to config screen (#504)
- (HombachC) repository cleanup

### 3.4.8 (2024-08-16)

- (HombachC) updated axios because of vulnerability
- (HombachC) added tests for Node.js 22

### 3.4.7 (2024-08-10)

- (HombachC) adapter checker detected optimizations (#493)
- (HombachC) improved error message (#490)

### 3.4.6 (2024-08-07)

- (HombachC) Catch wrong OBIS Codes, probably caused by Pulse communication errors
- (HombachC) code cleanup

### 3.4.5 (2024-07-31)

- (HombachC) decode meter mode 4 for local Tipper Pulse poll (#477)
- (HombachC) decode meter mode 1 for local Tipper Pulse poll (#478)
- (HombachC) fixed wrong Pulse local status names (voltage)
- (HombachC) add docu on local Pulse poll config screen (#479)
- (HombachC) code cleanup

### 3.4.4 (2024-07-28)

- (HombachC) local poll of data - change units Wh to kWh and round to 0,1kWh (#469)

### 3.4.3 (2024-07-14)

- (HombachC) added unit to Pulse temperature and round to 0,1°C
- (HombachC) added unit to Pulse battery voltage and round to 100mV
- (HombachC) added unit to Pulse uptime
- (HombachC) added state with Pulse uptime as human readable string
- (HombachC) reinitialize some TibberLocal states upon adapter startup
- (HombachC) code optimisation

### 3.4.2 (2024-07-13)

- (HombachC) fix typos in units
- (HombachC) fix type mismatch for state objects (#455)
- (HombachC) code optimisation

### 3.4.1 (2024-07-13)

- (HombachC) fix logging error

### 3.4.0 (2024-07-12)

- (HombachC) add mode for local poll of Pulse data (#201)

### 3.3.3 (2024-07-04)

- (HombachC) fix sentry notified possible error
- (HombachC) try to fix startup error (#444)

### 3.3.2 (2024-06-21)

- (HombachC) fix 2 security issues in dependencies
- (HombachC) fix sentry notified possible error

### 3.3.1 (2024-06-13)

- (HombachC) fix small sentry discovered error (#418)
- (HombachC) added note for multihomes to documentation (#422)

### 3.3.0 (2024-06-05)

- (HombachC) implements optional, obsolete api call for total historical cost, incl. grid fees (#405)
- (HombachC) Updates @iobroker/adapter-core from 3.1.6
- (HombachC) Updates @iobroker/types from 5.0.19 to 6.0.0

### 3.2.1 (2024-06-03)

- (HombachC) added unique endpoint string

### 3.2.0 (2024-06-03)

- (HombachC) IMPORTANT: adapter components had been blocked by Tibber - you have to update!
- (HombachC) adapter will use internal output states for calculator if none defined in configuration (#325)
- (HombachC) implement first run mode in calculator to reduce system load
- (HombachC) internal optimisations

### 3.1.2 (2024-05-20)

- (HombachC) deleting unused temp home objects after adapter config (#393)

### 3.1.1 (2024-05-16)

- (HombachC) throttle down reconnection speed
- (HombachC) logging optimizations (#396; #217)
- (HombachC) adaptations to newer environment (#394; #395)

### 3.1.0 (2024-05-07)

- (HombachC) enable manual control of configured outputs when automation is deactivated (#334)
- (HombachC) fix not working LTF Channel when using too short LTF (#383)
- (HombachC) code optimisations
- (HombachC) update adapter-core to 3.1.4

### 3.0.1 (2024-04-20)

- (HombachC) updated adapter testing

### 3.0.0 (2024-04-15)

- (HombachC) BREAKING: dropped support for node.js 16 (#368)
- (HombachC) BREAKING: js-controller >= 5 is required
- (HombachC) changed to tier 2 as data provider
- (HombachC) corrected io-package.json according to new schema (#368)
- (HombachC) update typescript to 5.4.5
- (HombachC) update adapter-core to 3.0.6

### 2.3.2 (2024-03-17)

- (HombachC) code optimizations
- (HombachC) fix undefined force mode (#349)
- (HombachC) fix poll of not existing current price state (#348)
- (HombachC) fix current price poll when configured as not to poll (#350)

### 2.3.1 (2024-03-10)

- (HombachC) BREAKING: Calculator channels of type 'smart battery buffer' will now switch outputs to 'OFF' only once, directly after setting the channel to Active=false (#332)
- (HombachC) Fixed error in jsonConfig.json (#329)
- (HombachC) deleted feed disconnect debug-message, cause warn message already exists
- (HombachC) bump typescript-eslint to gen 7

### 2.2.2 (2024-02-19)

- (HombachC) simplify internal state handling
- (HombachC) shorten home string in Calculator screen (#317)
- (HombachC) fix feedback loop trap (#321)
- (HombachC) add some tooltips to config screen (#317)

### 2.2.1 (2024-02-08)

- (HombachC) fix edge case problems with defect feed data from Tibber server (#312)

### 2.2.0 (2024-02-04)

- (HombachC) add data points for BestHoursBlock results - period and average cost (#240)
- (HombachC) fixed wrong error message texts
- (HombachC) fix some possible edge cases in internal support functions
- (HombachC) internal code docu optimization

### 2.1.1 (2024-01-27)

- (HombachC) fix reconnect error for Pulse feed (#300)
- (HombachC) new error message handler
- (HombachC) internal code docu optimization

### 2.1.0 (2024-01-21)

- (HombachC) add repeatablity for LTF channels (#289)
- (HombachC) tweak Smart Battery Buffer documentation

### 2.0.1 (2024-01-15)

- (HombachC) modify timing in Tibber Pulse feed connect (#271)

### 2.0.0 (2023-12-23)

- (HombachC) BREAKING: dropped support for js-controller 3.x (#247)
- (HombachC) diversificate Tibber server polls to prevent potential DDoS reactions (#252)
- (HombachC) add data point for averageRemaining of todays prices (#254)
- (HombachC) add 2 data points for last successfull update of today and tomorrow prices (#261)
- (HombachC) year 2024 changes
- (HombachC) fix small error in dynamic feed timing

### 1.8.1 (2023-12-16)

- (HombachC) add notice about changes in configuration

### 1.8.0 (2023-12-14)

- (HombachC) implement optional disable of price pull (#232)
- (HombachC) implement price categorization algorithm for battery buffer applications (#193)
- (HombachC) Fix 2 errors in pull of prices tomorrow (#235, #232)
- (HombachC) changed Tibber link in config

### 1.7.2 (2023-12-07)

- (HombachC) implemented dynamic raise of feed reconnect (#225)
- (HombachC) small bugfix in pricecalls
- (HombachC) first changes for "smart battery buffer" (#193)
- (HombachC) update typescript to 5.3.3

### 1.7.1 (2023-12-04)

- (HombachC) added hint for consumption data in documentation (#223)
- (HombachC) mitigate error handling (#217)
- (HombachC) added description to object Features/RealTimeConsumptionEnabled (#224)

### 1.7.0 (2023-11-30)

- (HombachC) implement getting historical consumption data from Tibber Server (#163)
- (HombachC) fix error in adapter unload
- (HombachC) some code optimisations

### 1.6.1 (2023-11-26)

- (HombachC) cleanup in documentation and translation handling

### 1.6.0 (2023-11-26)

- (HombachC) fixed major bug in 1.5.0, not working calculator channels (#212)
- (HombachC) implement limit calculations to a time frame (#153)
- (HombachC) fix error of missing price data upon not working tibber server connect at adapter start (#204)
- (HombachC) fixed possible error with wrong price date in multi home systems
- (HombachC) fixed possible type error, notified by Sentry
- (HombachC) added some documentation for inverse use of channels (#202)
- (HombachC) added Sentry statistics
- (HombachC) optimize translation handling

### 1.5.0 (2023-11-13)

- (HombachC) implement calculator channel names (#186)
- (HombachC) fix error in cron jobs (#190)
- (HombachC) remove not used calculator channel state objects (#188)
- (HombachC) optimize translation handling

### 1.4.3 (2023-11-08)

- (HombachC) fix possible type error in first calculator calls notified by Sentry
- (HombachC) change state object description of production values (#167)
- (HombachC) optimize pulse feed error message in case of error as object (#176)
- (HombachC) preparations for calculator object names (#186)

### 1.4.2 (2023-11-03)

- (HombachC) complete rework of task scheduling for more precise pull timing (#149)
- (HombachC) critical vulnerability fix for axios
- (HombachC) fix debug message typos, code optimisations in calculator
- (HombachC) fix type error in price average calculation notified by Sentry
- (HombachC) fix error in update prices tomorrow - possible false positive

### 1.4.1 (2023-10-25)

- (HombachC) implement forced update of all data after adapter restart (#155)
- (HombachC) Bump actions/setup-node from 3.8.1 to 4.0.0 (#157)
- (HombachC) remove node.js 16 actions - dependency updates

### 1.4.0 (2023-10-24)

- (HombachC) implement min/max states (#131)
- (HombachC) fix error with ignored calculator channel deaktivations (#143)
- (HombachC) optimize translation handling, code cleanup

### 1.3.1 (2023-10-21)

- (HombachC) fix initialisiation of channel states (#141)
- (HombachC) change message "reconnect successful" to level info (#80)
- (HombachC) documentation tweaks - dependency updates

### 1.3.0 (2023-10-20)

- (HombachC) implement tibber calculator mode "best hours block" (#16)
- (HombachC) handle empty calculator destination states - detected by sentry

### 1.2.0 (2023-10-18)

- (HombachC) implement tibber calculator mode "best single hours" (#16)
- (HombachC) changed i18n files to inline translations, single files aren't update compatible (#128)
- (HombachC) fixed error in initial read of calculator states (#129)

### 1.1.2 (2023-10-15)

- (HombachC) fix timing error in calculator

### 1.1.1 (2023-10-14)

- (HombachC) fix error in startup of additional channels

### 1.1.0 (2023-10-14)

- (HombachC) implement tibber calculator mode "best price" (#16)
- (HombachC) precised pull times of current cost
- (HombachC) reduced error messages (#80)
- (HombachC) extend documentation
- (HombachC) update adapter-core

### 1.0.0 (2023-10-05)

- (HombachC) Increase to the first major release, as now a stable level is reached
- (HombachC) Code cleanup

### 0.4.2 (2023-10-03)

- (HombachC) fixed error with polling multiple homes live data (#108)
- (HombachC) Lots of dependency updates; code optimizations

### 0.4.1 (2023-09-24)

- (HombachC) Hardened 2 typeerrors uppon sentry recognition
- (HombachC) Fix error with not deleted averages of tomorrow pricing (#95)
- (HombachC) preparations for tibber calculator

### 0.4.0 (2023-09-20)

- (HombachC) Added daily average price values (#89)

### 0.3.3 (2023-09-17)

- (HombachC) Fixed false positive connection message (#87)
- (HombachC) Updated translations with ChatGPT
- (HombachC) preparations for tibber calculator

### 0.3.2 (2023-09-14)

- (HombachC) Fixed error when starting adapter first time (#82)
- (HombachC) Fixed error in admin config from 0.3.0 (#81)

### 0.3.1 (2023-09-13)

- (HombachC) Mitigate error in admin config from 0.3.0 (#81)
- (HombachC) Change logging of TibberFeed errors from type error to type warn - because of too many downtimes of Tibber server (#80)

### 0.3.0 (2023-09-12)

- (HombachC) BREAKING: change Pulse usage to be configurable for all homes seperately (#41)
- (HombachC) optimize code again to mitigate set state timing for long JSON states (#68)
- (HombachC) preparations for tibber calculator

### 0.2.7 (2023-09-07)

- (HombachC) reducing polls at Tibber server by precheck of current price data
- (HombachC) preparations for tibber calculator

### 0.2.6 (2023-09-04)

- (HombachC) fix error with boolean states

### 0.2.5 (2023-09-03)

- (HombachC) optimize code to mitigate set state timing for long JSON states (#68)

### 0.2.4 (2023-08-30)

- (HombachC) enable correct price poll also for adapter running in different timezones (#63)

### 0.2.3 (2023-08-27)

- (HombachC) fix error in 0.2.2 in start conditions of adapter

### 0.2.2 (2023-08-24)

- (HombachC) reducing polls at Tibber server by precheck of known data
- (HombachC) code optimizations
- (HombachC) fix config screen (#55)

### 0.2.1 (2023-08-21)

- (HombachC) double timeout for Tibber server queries

### 0.2.0 (2023-08-18)

- (HombachC) introduces JSONs for prices sorted by price ascending
- (HombachC) fix stupid error for obsolete next day pricing (#23, #50)

### 0.1.10 (2023-08-15)

- (HombachC) preparations for tibber calculator
- (HombachC) mitigate multi homes & pulse problems (#41)
- (HombachC) add documentation to config screen (#47)

### 0.1.9 (2023-08-14)

- (HombachC) optimizing fetching homes list (#32) after Tibber server error, restart adapter in case of trouble

### 0.1.8 (2023-08-12)

- (HombachC) fix eslint/prettier issue

### 0.1.7 (2023-08-11)

- (HombachC) code cleanup, fix error for obsolete next day pricing (#23)
- (HombachC) add another try/catch while fetching homes list (#32)

### 0.1.6 (2023-07-30)

- (HombachC) add units for live data, bump adapter-core to 3.x

### 0.1.5 (2023-07-18)

- (HombachC) fix error in sentry logging

### 0.1.4 (2023-07-17)

- (HombachC) BREAKING: encrypted API-Token in ioBroker
- (HombachC) rearranged configuration options
- (HombachC) fixed bug in state generation

### 0.1.3 (2023-07-17)

- (HombachC) all log messages in English
- (HombachC) remove unused state change handler
- (HombachC) fixed state roles

### 0.1.2 (2023-07-17)

- (HombachC) round grid consumption meter values to Wh accuracy
- (HombachC) hide unused checkboxes in config
- (HombachC) fix snyc and appveyor

### 0.1.0 (2023-07-14)

- (HombachC) initial version
