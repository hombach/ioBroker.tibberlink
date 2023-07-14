![Logo](admin/tibberconnect.png)

# ioBroker.tibberconnect

![![NPM version](https://img.shields.io/npm/v/iobroker.tibberconnect.svg)](https://www.npmjs.com/package/iobroker.tibberconnect)
![![Downloads](https://img.shields.io/npm/dm/iobroker.tibberconnect.svg)](https://www.npmjs.com/package/iobroker.tibberconnect)
![Number of Installations](https://iobroker.live/badges/tibberconnect-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/tibberconnect-stable.svg)
[![Dependency Status](https://img.shields.io/david/Codibris/iobroker.tibberconnect.svg)](https://david-dm.org/Codibris/iobroker.tibberconnect)

[![NPM](https://nodei.co/npm/iobroker.tibberconnect.png?downloads=true)](https://nodei.co/npm/iobroker.tibberconnect/)

**Tests:** ![Test and Release](https://github.com/Codibris/ioBroker.tibberconnect/workflows/Test%20and%20Release/badge.svg)

Willkommen beim ioBroker Adapter für Tibber. Ich freue mich, dass Du diesen Adapter einsetzen möchtest. 
Falls du noch zu Tibber wechseln und mich dabei mit unterstützen möchstest kannst Du gerne meinen Einladungslink verwenden:

https://invite.tibber.com/hgg53izs

## tibberconnect adapter for ioBroker

connects tibber API and ioBroker

## Changelog
### 0.0.10 (2023-04-04)
- check current issues and update packages
- fixed issue #181 'Error in Tibber Feed on "undefined" with message "undefined"'
- fixed issue #130 pulse stream is not working

### 0.0.9 (2022-12-10)
- try automatically reconnecting websocket connection (pulse data) in 5s interval
- add some technical improvements on api calls
- add some debug logs

### 0.0.8 (2022-12-02)
- add some error handling while api calls

### 0.0.7 (2022-11-19)
- change connection state with live measurement
- Tibber API: breaking change in websocket subscriptions December 2022

### 0.0.6 (2022-11-19)
- quick temp. implementation of new tibber api Package

### 0.0.3 (2022-02-27)
- get prices of today and tomorrow

### 0.0.2 (2022-02-26)
- switch from schedule to deamon
- Load current energy price on 5 min interval
- optimize structure and internal objects
- connects tibber pulse and get data
- configurate fields for tibber pulse feed

### 0.0.1 (2022-02-18)
Reading data from tibber API:

- list and details of homes
- details of metering point
- features of account
- current energy price
- energy prices of today
- energy prices of tomorrow
- acitvate or deaktivate pulse (no data at the moment)

## License

GNU GENERAL PUBLIC LICENSE
Version 3, 29 June 2007

Copyright (c) 2023 Codibris <email@codibris.de>
