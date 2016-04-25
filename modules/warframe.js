/**
 * Created by macdja38 on 2016-04-17.
 */
"use strict";

var StateGrabber = require("../lib/worldState.js");
var worldState = new StateGrabber();

var ParseState = require('../lib/parseState');
var parseState = new ParseState();

var Utils = require('../lib/utils');
var utils = new Utils();

var request = require('request');

var _ = require('underscore');

var Warframe = function (cl) {
    Warframe.client = cl;
};

var commands = ["deal", "darvo", "trader", "voidtrader", "baro", "trial", "raid", "trialstat", "wiki", "sortie", "farm", "damage", "primeacces", "acces", "update", "update", "armorstat", "armourstat", "armor", "armour"];

Warframe.prototype.getCommands = function() {
    return commands
};

Warframe.prototype.checkMisc = function(msg, perms, l) {
    if(msg.content.toLowerCase().indexOf("soon") == 0 && msg.content.indexOf(":tm:") < 0 && perms.check(msg, "warframe.misc")){
        msg.reply("Soon:tm:");
        return true;
    }
    return false;
};

Warframe.prototype.onCommand = function(msg, command, perms, l) {
    console.log("WARFRAME initiated");
    //console.log(command);
    if ((command.commandnos === 'deal' || command.command === 'darvo') && perms.check(msg, "warframe.deal")) {
        worldState.get(function (state) {
            Warframe.client.sendMessage(msg.channel, "```xl\n" + "Darvo is selling " +
                parseState.getName(state.DailyDeals[0].StoreItem) +
                " for " + state.DailyDeals[0].SalePrice +
                "p (" +
                state.DailyDeals[0].Discount + "% off, " + (state.DailyDeals[0].AmountTotal - state.DailyDeals[0].AmountSold) +
                "/" + state.DailyDeals[0].AmountTotal + " left, refreshing in " + utils.secondsToTime(state.DailyDeals[0].Expiry.sec - state.Time) +
                ")" +
                "\n```");
        });
        return true;
    }

    else if ((command.commandnos ==='trader' || command.commandnos ==='voidtrader' || command.commandnos ==='baro') && perms.check(msg, "warframe.trader")) {
        worldState.get(function (state) {
            if (state.VoidTraders[0].Manifest) {
                var rep = "```xl\nBaro leaving " + state.VoidTraders[0].Node + " in " +
                   utils.secondsToTime(state.VoidTraders[0].Expiry.sec - state.Time) + "\n";
                for (var item of state.VoidTraders[0].Manifest) {
                    rep += "item: " + parseState.getName(item.ItemType) + " - price:" + item.PrimePrice + " ducats " + item.RegularPrice + "cr\n";
                }
                rep += "```"
                Warframe.client.sendMessage(msg.channel, rep);
            }
            else {
                Warframe.client.sendMessage(msg.channel, "```xl\nBaro appearing at " + state.VoidTraders[0].Node + " in " +
                    utils.secondsToTime(state.VoidTraders[0].Activation.sec - state.Time) + "\n```");
            }
        });
        return true;
    }

    else if ((command.commandnos ==='trial' || command.commandnos ==='raid' || command.commandnos ==='trialstat') && perms.check(msg, "warframe.trial")) {
        Warframe.client.sendMessage(msg.channel,
            "Hek: \<http://tinyurl.com/qb752oj\> Nightmare: \<http://tinyurl.com/p8og6xf\> Jordas: \<http://tinyurl.com/prpebzh\>");
        return true;
    }
    else if (command.command ==='wiki' && command.arguments.length > 0 && perms.check(msg, "warframe.wiki")) {
        // check if page exists, kinda
        var url = 'https://warframe.wikia.com/wiki/';
        url += _.map(command.arguments, function (n) {
            return n[0].toUpperCase() + n.substring(1);
        }).join('_');
        request.head(url, function (error, response) {
            if (error || response.statusCode !== 200) {
                Warframe.client.sendMessage(msg.channel, "could not find **" + command.arguments.join(" ") + "**.");
                return true;
            }
            Warframe.client.sendMessage(msg.channel, url);
        });
        return true;
    }

    else if (command.commandnos ==='sortie' && perms.check(msg, "warframe.sortie")) {
        worldState.get(function (state) {
            var boss = parseState.getBoss(state.Sorties[0].Variants[0].bossIndex);
            var text = "```xl\n" +utils.secondsToTime(state.Sorties[0].Expiry.sec - state.Time) + " left to defeat " +
                boss.name + " of the " + boss.faction + "\n";
            for (var Variant of state.Sorties[0].Variants) {
                var Region = parseState.getRegion(Variant.regionIndex);
                if (Region.missions[Variant.missionIndex] != "Assassination") {
                    text += Region.missions[Variant.missionIndex] + " on " + Region.name + " with " +
                        parseState.getModifiers(Variant.modifierIndex) + "\n";
                }
                else {
                    text += "Assassinate " + boss.name + " on " + Region.name + " with " +
                        parseState.getModifiers(Variant.modifierIndex) + "\n";
                }
            }
            text += "```";
            Warframe.client.sendMessage(msg.channel, text);
            return true;
        });
        return true;
    }

    else if (command.command === 'farm' && perms.check(msg, "warframe.farm")) {
        Warframe.client.sendMessage(msg.channel, "You can probably find that resource here: \<https://steamcommunity.com/sharedfiles/filedetails/?id=181630751\>");
        return true;
    }

    else if ((command.commandnos === 'damage' || command.command === 'element') && perms.check(msg, "warframe.trader")) {
        Warframe.client.sendMessage(msg.channel, "```xl\nDamage 2.0: https://pvpcraft.ca/wfd2.png Thanks for image Telkhines\n```");
        return true;
    }

    else if ((command.command === 'primeaccess' || command.command === 'access')  && perms.check(msg, "warframe.access")) {
        worldState.get(function (state) {
            var text = "```xl\n";
            for (var event of state.Events) {
                if (event.Messages[0].Message.toLowerCase().indexOf("access") > -1) {
                    text += event.Messages[0].Message.toUpperCase()
                        + " since " +utils.secondsToTime(state.Time - event.Date.sec) + " ago\n";
                }
            }
            if (text != "```xl\n") {
                Warframe.client.sendMessage(msg.channel, text + "```")
            }
        });
        return true;
    }

    else if ((command.commandnos === 'update') && perms.check(msg, "warframe.update")) {
        worldState.get(function (state) {
            console.log(state.Events);
            var String = "```xl\n";
            var checks = ["update", "hotfix"];
            for (var event of state.Events) {
                for(var l of checks) {
                    if (event.Messages[0].Message.toLowerCase().indexOf(l) > -1) {
                        String += event.Messages[0].Message.toUpperCase() + " since " +
                           utils.secondsToTime(state.Time - event.Date.sec) + " ago \n learn more here: " + event.Prop + "\n";
                        checks.slice(l);
                    }
                }
            }
            if(String !== "```xl\n") {
                Warframe.client.sendMessage(msg.channel, String + "```");
            }
        });
        return true;
    }

    else if ((command.commandnos === 'armorstat' || command.commandnos === 'armor' ||
             command.commandnos === 'armourstat' || command.commandnos === 'armour')  && perms.check(msg, "warframe.armor")) {
        (function() {
            if(command.arguments.length < 1 || command.arguments.length == 2 || command.arguments.length > 3) {
                Warframe.client.sendMessage(msg.channel, "```xl\npossible uses include:\n" +
                    command.prefix + "armor (Base Armor) (Base Level) (Current Level) calculate armor and stats.\n" +
                    command.prefix + "armor (Current Armor)\n```");
                return true;
            }
            var text = "```xl\n";
            if(command.arguments.length == 3) {
                if((parseInt(command.arguments[2]) - parseInt(command.arguments[1])) < 0) {
                    Warframe.client.sendMessage(msg.channel, "```xl\nPlease check your input values\n```");
                    return true;
                }
                var armor = parseInt(command.arguments[0]) * (1 + (Math.pow((parseInt(command.arguments[2]) - parseInt(command.arguments[1])),1.75) / 200));
                text += "at level " + command.arguments[2] + " your enemy would have " + armor + " Armor\n";
            }
            else{
                var armor = parseInt(command.arguments[0]);
            }
            text += armor / (armor + 300) * 100 + "% damage reduction\n";
            Warframe.client.sendMessage(msg.channel, text + "```");
        })();
        return true;
    }
    return false;
};

module.exports = Warframe;