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

var Twitter = require('twit');

var newStateGrabber = require("../lib/newWorldState");
var newWorldState = new newStateGrabber("http://content.warframe.com/dynamic/worldState.php", "pc");

var master;
if (process.env.id == 0) {
  master = true;
}

var twitter;

var request = require('request');

var DBEventState = require('../lib/dbEventState');

module.exports = class Warframe {
  constructor(e) {
    this.dbEvents = new DBEventState(e);
    this.client = e.client;
    this.config = e.configDB;
    this.raven = e.raven;
    this.alerts = [];
    this.rebuildAlerts = () => {
      this.alerts = [];
      for (var item in this.config.data) {
        if (this.config.data.hasOwnProperty(item) && this.config.data[item].hasOwnProperty("warframeAlerts")) {
          if (this.client.channels.get("id", this.config.data[item]["warframeAlerts"].channel) != null) {
            this.alerts.push(this.config.data[item].warframeAlerts);
          } else {
            //TODO: notify the server owner their mod alerts channel has been removed and that //setalerts false will make that permanent.
          }
        }
      }
    };
    if (master) {
      var twitter_auth = e.auth.get("twitter", false);
      if (twitter_auth) {
        console.log(`Found twitter auth, starting twitter stream`.blue);
        this.twitter = new Twitter(twitter_auth);
        this.stream = this.twitter.stream('statuses/filter', {follow: "1344755923"});
      }
    }
    this.onAlert = new Promise((resolve)=> {
      global.conn.then((con)=> {
        let dbReady;
        if (!global.cluster.worker || global.cluster.worker.id == 1) {
          dbReady = createDBIfNotExists("alerts", con);
        } else {
          dbReady = Promise.resolve();
        }
        return dbReady.then(()=> {
          /*global.r.table(this.table).insert([{id: "*", prefix: "//", "changeThresh": 1}]).run(this.con).then((res)=>{
           console.log(res);
           });*/
          console.log("Did, DB Thing");
          if (master) {
            console.log(`Shard ${process.env.id} is the Master Shard!`);
            if (twitter_auth) {
              //build the map of server id's and logging channels.
              console.log(this.alerts);
              console.log("twitter auth found, declaring onAlert");
              resolve(
                (tweet) => {
                  if (tweet.user.id_str === '1344755923' && !tweet.retweeted_status) {
                    console.log("Tweet Found");
                    let alert = tweet.text.match(/(.*?): (.*?) - (.*?) - (.*)/);
                    if (alert) {
                      alert = alert.slice(1, 5);
                      alert.invasion = false;
                    } else {
                      alert = tweet.text.match(/(.*?): (.*?) (VS\.) (.*)/);
                      if (alert) {
                        alert = alert.slice(1, 5);
                        alert.invasion = true;
                      }
                    }
                    if (alert) {
                      console.log("Logging tweet");
                      global.r.table('alerts').insert(alert.reduce((o, v, i) => {
                        o[i] = v;
                        return o;
                      }, {})).run(con).then(console.log);
                    }
                  }
                })
            }
          }
          global.r.table('alerts').changes().run(con, (err, cursor)=> {
            if (err) {
              console.error(err);
              return;
            }
            this.cursor = cursor;
            cursor.each((err, alert)=> {
              try {
                alert = alert.new_val;
                if (alert) {
                  console.dir(this.alerts, {depth: 2});
                  this.alerts.forEach((server, i) => setTimeout(()=> {
                    try {
                      let channel = this.client.channels.get("id", server.channel);
                      if (!channel || !server.tracking === true) return;
                      let things = [];
                      let madeMentionable = [];
                      for (let thing in server.items) {
                        if (server.items.hasOwnProperty(thing) && channel.server.roles.has("id", server.items[thing])) {
                          if (alert["3"].toLowerCase().indexOf(thing) > -1 && channel.server.roles.has("id", server.items[thing])) {
                            things.push(server.items[thing]);
                            madeMentionable.push(this.client.updateRole(server.items[thing], {
                              mentionable: true
                            }));
                          }
                          if (alert.invasion && alert["2"].toLowerCase().indexOf(thing) > -1  && channel.server.roles.has("id", server.items[thing])) {
                            things.push(server.items[thing]);
                            madeMentionable.push(this.client.updateRole(server.items[thing], {
                              mentionable: true
                            }));
                          }
                        }
                      }
                      let sendAlert = () => {
                        return this.client.sendMessage(channel, `\`\`\`xl\n${alert["0"]}\n${alert["1"]}\n${alert["2"]}\n${alert["3"]}\n\`\`\`${things.map((thing)=> {
                          return `<@&${thing}>`;
                        })}`);
                      };
                      let makeUnmentionable = () => {
                        for (let thing in things) {
                          if (things.hasOwnProperty(thing)) {
                            let role = channel.server.roles.get("id", things[thing]);
                            if (role) {
                              this.client.updateRole(role, {
                                mentionable: false
                              }).catch(console.error);
                            }
                          }
                        }
                      };
                      Promise.all(madeMentionable).then(()=> {
                        sendAlert().then(makeUnmentionable).catch(console.error);
                      }).catch((error)=> {
                        console.error(error);
                        this.client.sendMessage(channel, "Unable to make role mentionable, please contact @```Macdja38#7770 for help after making sure the bot has sufficient permissions").catch(console.error);
                        sendAlert().then(makeUnmentionable).catch(console.error);
                      });
                    } catch (error) {
                      console.error(error);
                      if (this.raven) {
                        this.raven.captureException(error);
                      }
                    }
                  }, i*5000));
                }
              } catch (error) {
                console.error(error);
              }
            });
          })
        }).catch(error => {
          console.error(error);
          if (this.raven) {
            this.raven.captureException(error);
          }
        });
      });
    });
  }

  onReady() {
    this.rebuildAlerts();
    if (this.twitter && master) {
      this.onAlert.then((alerts)=> {
        this.stream.removeListener('tweet', alerts);
        this.stream.on('tweet', alerts);
        this.stream.start();
      })
    }
  }

  onDisconnect() {
    if (this.twitter && master) {
      this.onAlert.then((alerts)=> {
        this.stream.removeListener('tweet', alerts);
        this.stream.stop();
      });
    }
    if (this.cursor) {
      this.cursor.close();
    }
  }

  getCommands() {
    return ["setupalerts", "alert", "fissure", "rift", "deal", "darvo", "trader", "voidtrader", "baro", "trial", "raid", "trialstat", "wiki", "sortie", "farm", "damage", "primeacces", "acces", "update", "update", "armorstat", "armourstat", "armor", "armour"];
  }

  onServerCreated() {
    this.rebuildAlerts();
  }

  checkMisc(msg, perms) {
    if (msg.content.toLowerCase().indexOf("soon") == 0 && msg.content.indexOf(":tm:") < 0 && perms.check(msg, "warframe.misc.soon")) {
      this.client.sendMessage(msg.channel, "Soon:tm:");
      return true;
    }
    return false;
  }

  onCommand(msg, command, perms) {
    if ((command.commandnos === 'deal' || command.command === 'darvo') && perms.check(msg, "warframe.deal")) {
      worldState.get((state) => {
        this.client.sendMessage(msg.channel, "```xl\n" + "Darvo is selling " +
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

    if (command.commandnos === "alert") {
      if (command.args[0] === "list" && perms.check(msg, "warframe.alerts.list")) {
        let roles = this.config.get("warframeAlerts", {items: {}}, {server: msg.server.id}).items;
        let coloredRolesList = "";
        for (var role in roles) {
          if (roles.hasOwnProperty(role) && role != "joinrole") {
            coloredRolesList += `${role}\n`;
          }
        }
        if (coloredRolesList != "") {
          msg.channel.sendMessage(`Available alerts include \`\`\`xl\n${coloredRolesList}\`\`\``)
        } else {
          msg.reply(`No alerts are being tracked.`)
        }
        return true;
      }
      if (command.args[0] === "join" && perms.check(msg, "warframe.alerts.join")) {
        let roles = this.config.get("warframeAlerts", {items: {}}, {server: msg.server.id}).items;
        if (!command.args[1] || !roles[command.args[1]]) {
          msg.reply(`Please supply an item to join using \`${command.prefix}alert join \<rank\>\`, for a list of items use \`${command.prefix}alert list\``);
          return true;
        }
        let rankToJoin = command.args[1].toLowerCase();
        role = msg.server.roles.get("id", roles[rankToJoin]);
        if (role) {
          this.client.addMemberToRole(msg.author, role, (error)=> {
            let logChannel = this.config.get("msgLog", false, {server: msg.server.id});
            if (error) {
              if (logChannel) {
                logChannel = msg.server.channels.get("id", logChannel);
                if (logChannel) {
                  this.client.sendMessage(logChannel, `Error ${error} promoting ${utils.removeBlocks(msg.author.username)} try redefining your rank and making sure the bot has enough permissions.`).catch(console.error)
                } else {
                  msg.reply(`Error ${error} promoting ${utils.removeBlocks(msg.author.username)} try redefining your rank and making sure the bot has enough permissions.`)
                }
              }
            } else {
              if (logChannel) {
                logChannel = msg.server.channels.get("id", logChannel);
                if (logChannel) {
                  this.client.sendMessage(logChannel, `${utils.removeBlocks(msg.author.username)} added themselves to ${utils.removeBlocks(role.name)}!`)
                }
              }
              msg.reply(":thumbsup::skin-tone-2:");
            }
          })
        } else {
          msg.reply(`Role could not be found, have an administrator use \`${command.prefix}tracking --add <item>\` to add it.`);
        }
        return true;
      }
      if (command.args[0] === "leave" && perms.check(msg, "warframe.alerts.leave")) {
        let roles = this.config.get("warframeAlerts", {items: {}}, {server: msg.server.id}).items;
        if (!command.args[1] || !roles[command.args[1]]) {
          msg.reply(`Please supply a rank to leave using \`${command.prefix}alerts leave \<rank\>\`, for a list of items use \`${command.prefix}alerts list\``);
          return true;
        }
        role = msg.server.roles.get("id", roles[command.args[1]]);
        if (role) {
          this.client.removeMemberFromRole(msg.author, role, (error)=> {
            let logChannel = this.config.get("msgLog", false, {server: msg.server.id});
            if (error) {
              if (logChannel) {
                logChannel = msg.server.channels.get("id", logChannel);
                if (logChannel) {
                  this.client.sendMessage(logChannel, `Error ${error} demoting ${utils.removeBlocks(msg.author.username)} try redefining your rank and making sure the bot has enough permissions.`).catch(console.error)
                }
              }
            } else {
              if (logChannel) {
                logChannel = msg.server.channels.get("id", logChannel);
                if (logChannel) {
                  this.client.sendMessage(logChannel, `${utils.removeBlocks(msg.author.username)} removed themselves from ${utils.removeBlocks(role.name)}!`)
                }
              }
              msg.reply(":thumbsup::skin-tone-2:");
            }
          })
        } else {
          msg.reply(`Role could not be found, have an administrator use \`${command.prefix}alerts add <item>\` to add it.`);
          return true;
        }
        return true;
      }

      if ((command.args[0] === "enable" || command.args[0] === "disable") && perms.check(msg, "admin.warframe.alerts")) {
        let config = this.config.get("warframeAlerts",
          {
            "tracking": true,
            "channel": "",
            "items": {}
          }, {
            server: msg.server.id
          }
        );
        config.tracking = command.args[0] === "enable";
        if (command.channel) {
          config.channel = command.channel.id;
        } else {
          config.channel = msg.channel.id;
        }
        if (!config.items) {
          config.items = {};
        }
        this.config.set("warframeAlerts", config, {server: msg.channel.server.id});
        this.rebuildAlerts();
        msg.reply(":thumbsup::skin-tone-2:");
        return true;
      }

      if (command.args[0] === "add" && perms.check(msg, "admin.warframe.alerts")) {
        if (command.args[1]) {
          let config = this.config.get("warframeAlerts",
            {
              "tracking": false,
              "channel": "",
              "items": {}
            }

            , {server: msg.server.id});
          if (typeof(config.tracking) !== "boolean") {
            config.tracking = false;
          }
          if (!config.items) {
            config.items = {};
          }
          if (config.items.hasOwnProperty(command.args[1].toLowerCase())) {
            msg.reply(`Resource is already being tracked, use \`${command.prefix}alert join ${utils.clean(command.args[1])}\` to join it.`);
            return;
          }
          msg.channel.server.createRole({
            name: command.args[1].toLowerCase(),
            permissions: [],
            mentionable: true
          }, (error, role) => {
            if (error) {
              if (error.status == 403) {
                msg.reply("Error, insufficient permissions, please give me manage roles.");
              }
              else {
                msg.reply("Unexpected error please report the issue https://pvpcraft.ca/pvpbot");
                console.log(error);
                console.log(error.stack);
              }
              return;
            }
            config.items[role.name] = role.id;
            this.config.set("warframeAlerts", config, {server: msg.channel.server.id});
            msg.reply("Created role " + utils.clean(role.name) + " with id `" + role.id + "`");
          });
          return true;
        }
        msg.reply("invalid option's please specify the name of a resource to track to change tracking options");
        return true;
      }

      if (command.args[0] === "remove" && perms.check(msg, "admin.warframe.alerts")) {
        if (command.args[1]) {
          let config = this.config.get("warframeAlerts",
            {
              "tracking": false,
              "channel": "",
              "items": {}
            }

            , {server: msg.server.id});
          if (typeof(config.tracking) !== "boolean") {
            config.tracking = false;
          }
          if (!config.items) {
            config.items = {};
          }
          if (!config.items.hasOwnProperty(command.args[1])) {
            msg.reply(`Resource is not being tracked, use \`${command.prefix}alert add ${utils.clean(command.args[1])}\` to add it.`);
            return;
          }
          let role = msg.server.roles.get("name", command.args[1]);
          if (role) {
            this.client.deleteRole(role, (error) => {
              if (error) {
                if (error.status == 403) {
                  msg.reply("Error, insufficient permissions, please give me manage roles.");
                }
                else {
                  msg.reply("Unexpected error please report the issue https://pvpcraft.ca/pvpbot");
                  console.log(error);
                  console.log(error.stack);
                }
                return;
              }
              delete config.items[command.args[1]];
              this.config.set("warframeAlerts", config, {server: msg.channel.server.id, conflict: "replace"});
              msg.reply("Deleted role " + utils.clean(command.args[1]) + " with id `" + role.id + "`");
            });
            return true;
          } else {
            delete config.items[command.args[1]];
            this.config.set("warframeAlerts", config, {server: msg.channel.server.id, conflict: "replace"});
            msg.reply("Role not found, removed " + utils.clean(command.args[1]) + " from list.");
            return true;
          }
        }
        msg.reply("Invalid option's please specify the name of a resource to track to change tracking options");
        return true;
      }
    }

    if ((command.commandnos === 'trader' || command.commandnos === 'voidtrader' || command.commandnos === 'baro') && perms.check(msg, "warframe.trader")) {
      worldState.get((state) => {
        if (state.VoidTraders[0].Manifest) {
          var rep = "```xl\nBaro leaving " + state.VoidTraders[0].Node + " in " +
            utils.secondsToTime(state.VoidTraders[0].Expiry.sec - state.Time) + "\n";
          for (var item of state.VoidTraders[0].Manifest) {
            rep += "item: " + parseState.getName(item.ItemType) + " - price:" + item.PrimePrice + " ducats " + item.RegularPrice + "cr\n";
          }
          rep += "```";
          this.client.sendMessage(msg.channel, rep);
        }
        else {
          this.client.sendMessage(msg.channel, "```xl\nBaro appearing at " + state.VoidTraders[0].Node + " in " +
            utils.secondsToTime(state.VoidTraders[0].Activation.sec - state.Time) + "\n```");
        }
      });
      return true;
    }

    else if ((command.commandnos === 'trial' || command.commandnos === 'raid' || command.commandnos === 'trialstat') && perms.check(msg, "warframe.trial")) {
      this.client.sendMessage(msg.channel,
        "Hek: \<http://tinyurl.com/qb752oj\> Nightmare: \<http://tinyurl.com/p8og6xf\> Jordas: \<http://tinyurl.com/prpebzh\>");
      return true;
    }

    else if (command.commandnos === 'alert' && perms.check(msg, "warframe.alert")) {
        worldState.get((state) => {
            if (state.Alerts) {
                let alertStringArray = [];
                for (var alert of state.Alerts) {
                    var rewards = "";
                    if (alert.MissionInfo.missionReward) {
                        if (alert.MissionInfo.missionReward.items) {
                            for (let reward of alert.MissionInfo.missionReward.items) {
                                if (rewards != "") rewards += " + ";
                                rewards += parseState.getName(reward);
                            }
                        }
                        if (alert.MissionInfo.missionReward.countedItems) {
                            for (let reward of alert.MissionInfo.missionReward.countedItems) {
                                if (rewards != "") rewards += " + ";
                                rewards += reward.ItemCount + " " + parseState.getName(reward.ItemType);
                            }
                        }
                        if (rewards != "") rewards += " + ";
                        if (alert.MissionInfo.missionReward.credits) rewards += alert.MissionInfo.missionReward.credits + " credits";
                    }
                    alertStringArray.push("```\n" +
                      parseState.getNodeName(alert.MissionInfo.location) + " levels " + alert.MissionInfo.minEnemyLevel + "-" + alert.MissionInfo.maxEnemyLevel + "\n" +
                      parseState.getFaction(alert.MissionInfo.faction) + " " + parseState.getMissionType(alert.MissionInfo.missionType) + "\n" +
                      rewards +
                      "\nExpires in " + utils.secondsToTime(alert.Expiry.sec - state.Time) +
                      "\n```"
                    );
                }
                this.client.sendMessage(msg.channel,
                    alertStringArray.join("\n")
                );
            }
        });
        return true;
    }

    else if (command.commandnos === 'rift' || command.commandnos === 'fissure' && perms.check(msg, "warframe.rift")) {
      worldState.get((state) => {
        if (state.ActiveMissions) {
          let string = "";
          for (let mission of state.ActiveMissions) {
            let node = parseState.getNode(mission.Node);
            if (node) {
              let nodeFaction = parseState.getFaction(node.faction);
              let nodeMission = parseState.getMissionType(node.missionType);
              string += `\`\`\`xl\n${parseState.getTierName(mission.Modifier).name} (${mission.Modifier.slice(4)}) rift active on ${parseState.getNodeName(mission.Node)} (${nodeFaction} ${nodeMission}) for ${utils.secondsToTime(mission.Expiry.sec - state.Time)}\n\`\`\``;
            } else {
              string += `\`\`\`xl\n${parseState.getTierName(mission.Modifier).name} (${mission.Modifier.slice(4)}) rift active for ${utils.secondsToTime(mission.Expiry.sec - state.Time)}\n\`\`\``;
            }
          }
          this.client.sendMessage(msg.channel, string);
        }
      });
      return true;
    }

    else if (command.command === 'wiki' && perms.check(msg, "warframe.wiki")) {
      //use wikia's api to search for the item.
      if (command.args.length === 0) {
        this.client.sendMessage(msg.channel, "Please provide something to search for!");
        return true;
      }
      request.post("http://warframe.wikia.com/api/v1/Search/List", {
        form: {
          query: command.args.join(' '),
          limit: 1
        }
      }, (err, response, body) => {
        if (err || response.statusCode === 404) {
          this.client.sendMessage(msg.channel, "Could not find **" + utils.clean(command.args.join(' ')) + "**");
        } else if (response.statusCode !== 200) {
          console.error(' returned HTTP status ' + response.statusCode);
        } else {
          try {
            this.client.sendMessage(msg.channel, JSON.parse(body).items[0].url);
          } catch (e) {
            console.error('Invalid JSON from http://warframe.wikia.com/api/v1/Search/List while searching the wiki');
          }
        }
      });
      return true;

    }

    else if (command.commandnos === 'sortie' && perms.check(msg, "warframe.sortie")) {
      worldState.get((state) => {
        if (state.Sorties[0]) {
          var boss = parseState.getBoss(state.Sorties[0].Variants[0].bossIndex);
          var text = "```xl\n" + utils.secondsToTime(state.Sorties[0].Expiry.sec - state.Time) + " left to defeat " +
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
          this.client.sendMessage(msg.channel, text);
          return true;
        }
      });
      return true;
    }

    else if (command.command === 'farm' && perms.check(msg, "warframe.farm")) {
      this.client.sendMessage(msg.channel, "You can probably find that resource here: \<https://steamcommunity.com/sharedfiles/filedetails/?id=181630751\>");
      return true;
    }

    else if ((command.commandnos === 'damage' || command.command === 'element') && perms.check(msg, "warframe.damage")) {
      this.client.sendMessage(msg.channel, "```xl\nDamage 2.0: https://pvpcraft.ca/wfd2.png Thanks for image Telkhines\n```");
      return true;
    }

    else if ((command.command === 'primeaccess' || command.command === 'access') && perms.check(msg, "warframe.access")) {
      worldState.get((state) => {
        var text = "```xl\n";
        for (var event of state.Events) {
          if (event.Messages[0].Message.toLowerCase().indexOf("access") > -1) {
            text += event.Messages[0].Message.toUpperCase()
              + " since " + utils.secondsToTime(state.Time - event.Date.sec) + " ago\n";
          }
        }
        if (text != "```xl\n") {
          this.client.sendMessage(msg.channel, text + "```")
        }
      });
      return true;
    }

    else if ((command.commandnos === 'update') && perms.check(msg, "warframe.update")) {
      worldState.get((state) => {
        var String = "```xl\n";
        var checks = ["update", "hotfix"];
        for (var event of state.Events) {
          for (var l of checks) {
            if (event.Messages[0].Message.toLowerCase().indexOf(l) > -1) {
              String += event.Messages[0].Message.toUpperCase() + " since " +
                utils.secondsToTime(state.Time - event.Date.sec) + " ago \n learn more here: " + event.Prop + "\n";
              checks.slice(l);
            }
          }
        }
        if (String !== "```xl\n") {
          this.client.sendMessage(msg.channel, String + "```");
        }
      });
      return true;
    }

    else if ((command.commandnos === 'armorstat' || command.commandnos === 'armor' ||
      command.commandnos === 'armourstat' || command.commandnos === 'armour') && perms.check(msg, "warframe.armor")) {
      (() => {
        if (command.args.length < 1 || command.args.length == 2 || command.args.length > 3) {
          this.client.sendMessage(msg.channel, "```xl\npossible uses include:\n" +
            command.prefix + "armor (Base Armor) (Base Level) (Current Level) calculate armor and stats.\n" +
            command.prefix + "armor (Current Armor)\n```");
          return true;
        }
        var text = "```xl\n";
        let armor;
        if (command.args.length == 3) {
          if ((parseInt(command.args[2]) - parseInt(command.args[1])) < 0) {
            this.client.sendMessage(msg.channel, "```xl\nPlease check your input values\n```");
            return true;
          }
          armor = parseInt(command.args[0]) * (1 + (Math.pow((parseInt(command.args[2]) - parseInt(command.args[1])), 1.75) / 200));
          text += "at level " + command.args[2] + " your enemy would have " + armor + " Armor\n";
        }
        else {
          armor = parseInt(command.args[0]);
        }
        text += armor / (armor + 300) * 100 + "% damage reduction\n";
        this.client.sendMessage(msg.channel, text + "```");
      })();
      return true;
    }
    return false;
  }
};

function createDBIfNotExists(name, con) {
  return global.r.tableList().contains(name)
  .do((databaseExists) => {
    return global.r.branch(
      databaseExists,
      {dbs_created: 0},
      global.r.tableCreate(name)
    );
  }).run(con)
}
