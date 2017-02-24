/**
 * Created by macdja38 on 2016-04-25.
 */
"use strict";

let utils = require('../lib/utils');

module.exports = class template {
  constructor(e) {
    //save the client as this.client for later use.
    this.client = e.client;
    //save the bug reporting thing raven for later use.
    this.raven = e.raven;
  }

  getCommands() {
    //this needs to return a list of commands that should activate the onCommand function
    //of this class. array of strings with trailing s's removed.
    return ["ao"];
  }

  //if this exists it will be called on every message unless it contains a command that is
  //consumed by another module.
  checkMisc(msg, perms) {
    return false;
  }

  onCommand(msg, command, perms) {
    //log that the module was called.
    console.log("Template initiated");

    //check if this is a command we should handle and if the user has permissions to execute it.
    if (command.command === "ao" && perms.check(msg, "template.ao")) {
      //provide user feedback.
      msg.channel.createMessage(msg.author.mention + ", " + "eo");
      //return true, which tells the command dispatcher that we processed the command.
      return true;
    }
    //return false, telling the command dispatcher the command was not handled and to keep looking,
    //or start passing it to misc responses.
    return false;
  }
};