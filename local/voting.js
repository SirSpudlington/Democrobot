const { Events, StringSelectMenuBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle } = require('discord.js');
const commands = require('./votes.json');
const { promises: fs } = require('fs');
const render = require('svg-render');
const { randomUUID } = require('crypto');
const { Channels, VoteMinTime, Server } = require('../config.json');
var escape = require('escape-html');
const simpleGit = require('simple-git');
const exec = require('child_process').exec;

var db;
var client;

function voting_init(_client, _db) {
    db = _db;
    client = _client;
    client.on(Events.InteractionCreate, handle_interaction)
}

async function handle_interaction(interaction) {
    if (interaction.isButton()) {
        if (interaction.customId === 'create_vote') {
            let select_menu = new StringSelectMenuBuilder()
                .setCustomId('vote_create_type')
                .setPlaceholder('Select a vote type')
                .addOptions(commands.map(command => {
                    return {
                        label: command.name,
                        description: command.description,
                        value: command.name
                    }
                }));

            let row = new ActionRowBuilder().addComponents(select_menu);

            await interaction.reply({ content: 'Select a vote type', components: [row], ephemeral: true});
        }
    } else if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'vote_create_type') {
            let command = commands.find(command => command.name === interaction.values[0]);
            if (!command) {
                await interaction.reply({ content: 'An error occured', ephemeral: true });
                return;
            } else {
                let modal = new ModalBuilder()
                    .setCustomId('vote_create_modal__' + command.name)
                    .setTitle(command.name);
                

                for (let i = 0; i < command.inputs.length; i++) {
                    let input = command.inputs[i];
                    if (input.type === 'string') {
                        modal.addComponents(new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId(input.name)
                                .setLabel(input.description)
                                .setStyle(TextInputStyle.Paragraph)
                        ));
                    } else if (input.type === 'user') {
                        modal.addComponents(new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId(input.name)
                                .setLabel(input.description + " (i.e. Democrobot#9833)")
                                .setStyle(TextInputStyle.Short)
                        ));
                    }
                }
                
                await interaction.showModal(modal);
            }
        }
    } else if (interaction.isModalSubmit()) {
        let command = commands.find(command => interaction.customId.startsWith('vote_create_modal__' + command.name));
        if (!command) {
            return;
        } else {
            let superm = command.supermajority;
            let name = command.name;
            let fields = {};
            let id = randomUUID();
            interaction.fields.fields.forEach(field => {
                fields[field.customId] = field.value;
            });

            fields["type"] = name;
            fields["supermajority"] = superm;

            let template = (await fs.readFile('./assets/vote_menu.svg')).toString();

            template = template.replace(/{VOTE TITLE}/g, escape(interaction.user.displayName) + "'s vote");
            template = template.replace(/{VOTE TYPE}/g, name);
            
            let description = escape(fields["Reason"])

            if (superm) {
                description+= " (Supermajority)";
            }

            if ("User" in fields) {
                description += " (Reguarding User: " + fields["User"] + ")";
            }

            template = template.replace(/{DESCRIPTION}/g, description);

            template = template.replace(/{PCT1}/g, "0");
            template = template.replace(/{PCT2}/g, "0");
            template = template.replace(/{PCT3}/g, "0");

            let users = await new Promise((resolve, reject) => {
                db.all("SELECT * FROM roles WHERE role = ?", ["votersCommitee"], (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows);
                    }
                });
            });

            fields["votes"] = []

            users = users.map((user) => {
                let id = user.user;
                
                let username = (client.users.cache.get(id)).displayName;
                if (id == client.user.id) {
                    fields["votes"].push(0)
                } else {
                    fields["votes"].push(1)
                }
                return escape(username);
            })


            // ⌛ ✅ ❌

            template = template.replace(/{USER1}/g, users[0]);
            template = template.replace(/{USER2}/g, users[1]);
            template = template.replace(/{USER3}/g, users[2]);
            template = template.replace(/{USER4}/g, users[3]);

            for (let i = 0; i < users.length; i++) {
                let type = "";
                if (fields["votes"][i] == 0) {
                    type = "Abstained 🟡"
                } else if (fields["votes"][i] == 1) {
                    type = "Pending ⌛"
                }

                template = template.replace(new RegExp("{EMOJI" + (i+1) + "}", 'g'), type);
            }

            template = template.replace(/{VOTE_PCT_1}/g, 5);
            template = template.replace(/{VOTE_PCT_2}/g, 5);
            template = template.replace(/{VOTE_PCT_3}/g, 5);

            let time_string = (new Date((new Date().getTime()) + VoteMinTime).toISOString()).split(".")[0].replace("T", " ") + "UTC";
            template = template.replace(/{VOTE END}/g, time_string);

            const outputBuffer = await render({
                buffer: Buffer.from(template, "utf-8"),
                width: 512
            });

            fields["voted"] = []
            fields["cvotes"] = {
                "for": 0,
                "against": 0,
                "abstain": 0
            }

            const vote_for = new ButtonBuilder()
                .setCustomId('vote_for_' + id)
                .setLabel('Vote For')
                .setStyle(ButtonStyle.Success);

            const vote_against = new ButtonBuilder()
                .setCustomId('vote_against_' + id)
                .setLabel('Vote Against')
                .setStyle(ButtonStyle.Danger);

            const abstain_from_vote = new ButtonBuilder()
                .setCustomId('vote_abstain_' + id)
                .setLabel('Abstain From Vote')
                .setStyle(ButtonStyle.Secondary);

            const row = new ActionRowBuilder().addComponents(vote_for, vote_against, abstain_from_vote);

            let message = await client.channels.cache.get(Channels.Votes).send({ files: [{ attachment: outputBuffer, name: 'VoteStatus.png' }], components: [row]});

            fields["msg_id"] = message.id;
            fields["title"] = interaction.user.displayName + "'s vote"

            await db.run("INSERT INTO votes (name, fields, time, id) VALUES (?, ?, ?, ?)", [name, JSON.stringify(fields), new Date().getTime(), id]);
            await interaction.reply({ content: 'Vote created', ephemeral: true});
        }
    }
}

async function process_vote(interaction) {
    let id = interaction.customId.split('_')[2];
    let vote = await (new Promise((resolve, reject) => {
        db.get("SELECT * FROM votes WHERE id = ?", [id], (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row);
            }
        });
    }));

    let type = interaction.customId.split("_")[1];
    vote.fields = JSON.parse(vote.fields);

    let vc = await new Promise((resolve, reject) => {
        db.all("SELECT * FROM roles WHERE role = ?", ["votersCommitee"], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });

    vc = vc.map((user) => {
        let id = user.user;
        return id;
    })

    
    if (vc.indexOf(interaction.user.id) != -1) {
        if (type == "for") {
            vote.fields.votes[vc.indexOf(interaction.user.id)] = 3;
        } else if (type == "against") {
            vote.fields.votes[vc.indexOf(interaction.user.id)] = 2;
        } else if (type == "abstain") {
            vote.fields.votes[vc.indexOf(interaction.user.id)] = 0;
        }
    } else if (vote.fields.voted.indexOf(interaction.user.id) == -1) {
        vote.fields.voted.push(interaction.user.id);

        if (type == "for") {
            vote.fields.cvotes.for++;
        } else if (type == "against") {
            vote.fields.cvotes.against++;
        } else if (type == "abstain") {
            vote.fields.cvotes.abstain++;
        }
    } else {
        interaction.reply({ content: "You have already voted.", ephemeral: true});
        return;
    }

    let template = (await fs.readFile('./assets/vote_menu.svg')).toString();

    template = template.replace(/{VOTE TITLE}/g, vote.fields["title"]);
    template = template.replace(/{VOTE TYPE}/g, vote.fields["type"]);

    let time_string = new Date(vote.time + VoteMinTime).toISOString().split(".")[0].replace("T", " ") + "UTC";
    template = template.replace(/{VOTE END}/g, time_string);
            
    let description = vote.fields["Reason"]

    if (vote.supermajority) {
        description+= " (Supermajority)";
    }

    if ("User" in vote.fields) {
        description += " (Reguarding User: " + vote.fields["User"] + ")";
    }

    template = template.replace(/{DESCRIPTION}/g, description);

    let total_votes = vote.fields.cvotes.for + vote.fields.cvotes.against + vote.fields.cvotes.abstain;

    if (total_votes == 0) {
        total_votes = 1;
    }

    let pct1 = Math.round(vote.fields.cvotes.for / total_votes * 100);
    let pct2 = Math.round(vote.fields.cvotes.against / total_votes * 100);
    let pct3 = Math.round(vote.fields.cvotes.abstain / total_votes * 100);

    template = template.replace(/{VOTE_PCT_1}/g, ((vote.fields.cvotes.for / total_votes) * 85) + 5);
    template = template.replace(/{VOTE_PCT_2}/g, ((vote.fields.cvotes.against / total_votes) * 85) + 5);
    template = template.replace(/{VOTE_PCT_3}/g, ((vote.fields.cvotes.abstain / total_votes) * 85) + 5);

    template = template.replace(/{PCT1}/g, pct1);
    template = template.replace(/{PCT2}/g, pct2);
    template = template.replace(/{PCT3}/g, pct3);

    vc = vc.map((id) => {
        let username = (client.users.cache.get(id)).displayName;
        return escape(username);
    })


    template = template.replace(/{USER1}/g, vc[0]);
    template = template.replace(/{USER2}/g, vc[1]);
    template = template.replace(/{USER3}/g, vc[2]);
    template = template.replace(/{USER4}/g, vc[3]);

    for (let i = 0; i < vc.length; i++) {
        let type = "";
        if (vote.fields["votes"][i] == 0) {
            type = "Abstained 🟡"
        } else if (vote.fields["votes"][i] == 1) {
            type = "Pending ⌛"
        } else if (vote.fields["votes"][i] == 2) {
            type = "Against ❌"
        } else if (vote.fields["votes"][i] == 3) {
            type = "For ✅"
        }
        template = template.replace(new RegExp("{EMOJI" + (i+1) + "}", 'g'), type);
    }

    const outputBuffer = await render({
        buffer: Buffer.from(template, "utf-8"),
        width: 512
    });

    const vote_for = new ButtonBuilder()
        .setCustomId('vote_for_' + id)
        .setLabel('Vote For')
        .setStyle(ButtonStyle.Success);

    const vote_against = new ButtonBuilder()
        .setCustomId('vote_against_' + id)
        .setLabel('Vote Against')
        .setStyle(ButtonStyle.Danger);

    const abstain_from_vote = new ButtonBuilder()
        .setCustomId('vote_abstain_' + id)
        .setLabel('Abstain From Vote')
        .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(vote_for, vote_against, abstain_from_vote);

    await db.run("UPDATE votes SET fields = ? WHERE id = ?", [JSON.stringify(vote.fields), id]);
    await interaction.message.edit({ files: [{ attachment: outputBuffer, name: 'VoteStatus.png' }], components: [row]});

    interaction.reply({ content: 'Vote processed', ephemeral: true});
}

async function voting_pulse() {
    // process votes

    let votes = await new Promise((resolve, reject) => {
        db.all("SELECT * FROM votes", (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });

    for (let i = 0; i < votes.length; i++) {
        
        let vote = votes[i];
        vote.fields = JSON.parse(vote.fields);


        if (vote.time + VoteMinTime > new Date().getTime()) {
            continue;
        }

        let vc = await new Promise((resolve, reject) => {
            db.all("SELECT * FROM roles WHERE role = ?", ["votersCommitee"], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    
    
        vc = vc.map((user) => {
            let id = user.user;
            return id;
        })

        let result = "";

    
        let template = (await fs.readFile('./assets/vote_menu.svg')).toString();

        let time_string = new Date(vote.time + VoteMinTime).toISOString().split(".")[0].replace("T", " ") + " UTC";
        template = template.replace(/{VOTE END}/g, time_string);
    
        template = template.replace(/{VOTE TITLE}/g, vote.fields["title"]);
        template = template.replace(/{VOTE TYPE}/g, vote.fields["type"]);
                
        let description = vote.fields["Reason"]
    
        if (vote.supermajority) {
            description+= " (Supermajority)";
        }
    
        if ("User" in vote.fields) {
            description += " (Reguarding User: " + vote.fields["User"] + ")";
        }
    
        template = template.replace(/{DESCRIPTION}/g, description);
    
        let total_votes = vote.fields.cvotes.for + vote.fields.cvotes.against + vote.fields.cvotes.abstain;
        if (total_votes == 0) {
            total_votes = 1;
        }
        let pct1 = Math.round(vote.fields.cvotes.for / total_votes * 100);
        let pct2 = Math.round(vote.fields.cvotes.against / total_votes * 100);
        let pct3 = Math.round(vote.fields.cvotes.abstain / total_votes * 100);

        template = template.replace(/{VOTE_PCT_1}/g, ((vote.fields.cvotes.for / total_votes) * 85) + 5);
        template = template.replace(/{VOTE_PCT_2}/g, ((vote.fields.cvotes.against / total_votes) * 85) + 5);
        template = template.replace(/{VOTE_PCT_3}/g, ((vote.fields.cvotes.abstain / total_votes) * 85) + 5);
    
        template = template.replace(/{PCT1}/g, pct1);
        template = template.replace(/{PCT2}/g, pct2);
        template = template.replace(/{PCT3}/g, pct3);

        vc = vc.map((id) => {
            let username = (client.users.cache.get(id));
            if (username == null) {
                return "Unknown";
            }
            return escape(username.displayName);
        })
    
    
        template = template.replace(/{USER1}/g, vc[0]);
        template = template.replace(/{USER2}/g, vc[1]);
        template = template.replace(/{USER3}/g, vc[2]);
        template = template.replace(/{USER4}/g, vc[3]);
    
        for (let i = 0; i < vc.length; i++) {
            let type = "";
            if (vote.fields["votes"][i] == 0) {
                type = "Abstained 🟡"
            } else if (vote.fields["votes"][i] == 1) {
                type = "Pending ⌛"
            } else if (vote.fields["votes"][i] == 2) {
                type = "Against ❌"
            } else if (vote.fields["votes"][i] == 3) {
                type = "For ✅"
            }
            template = template.replace(new RegExp("{EMOJI" + (i+1) + "}", 'g'), type);
        };
    
        const outputBuffer = await render({
            buffer: Buffer.from(template, "utf-8"),
            width: 512
        });

        let msg = Array.from((await client.channels.cache.get(Channels.Votes).messages.fetch(vote.message)).values())[0];

        let weight_of_vc = Math.ceil(total_votes / 4);

        let total_for = 0
        let total_against = 0

        for (let i = 0; i < vc.length; i++) {
            if (vote.fields["votes"][i] == 3) {
                total_for += weight_of_vc
            } else if (vote.fields["votes"][i] == 2) {
                total_against += weight_of_vc
            }
        }

        total_for+=vote.fields.cvotes.for
        total_against+=vote.fields.cvotes.against

        result = "Vote results: " + total_for + " for, " + total_against + " against. ";

        let majority = total_for / (total_for + total_against);

        let passed = false;

        if (vote.fields.supermajority && majority > 0.66) {
            result += "Supermajority vote passed. ";
            passed = true;
        } else if (vote.fields.supermajority) {
            result += "Supermajority vote failed. ";
        } else if (majority > 0.5) {
            passed = true;
            result += "Vote passed. ";
        } else if (majority < 0.5) {
            result += "Vote failed. ";
        }

        if (vote.fields.type == "Kick" && passed) {
            let username = vote.fields["User"];
            let member = Array.from((await client.guilds.cache.get(Server).members.fetch()).values());
            let sel_member;

            for (let i = 0; i < member.length; i++) {
                let user = member[i].user;
                let _username = user.username;
                if (_username == username) {
                    sel_member = member[i];
                    break;
                }
            }

            if (sel_member == undefined) {
                result += "User not found. Vote deleted.";
                await msg.edit({ files: [{ attachment: outputBuffer, name: 'VoteStatus.png'}], components: [], content: result});
                await db.run("DELETE FROM votes WHERE id = ?", [vote.id]);
                return
            }
            await sel_member.kick("A vote has kicked you from the server.");
        } else if (vote.fields.type == "Ban" && passed) {
            let username = vote.fields["User"];

            let member = Array.from((await client.guilds.cache.get(Server).members.fetch()).values());
            let sel_member;

            for (let i = 0; i < member.length; i++) {
                let user = member[i].user;
                let _username = user.username;
                if (_username == username) {
                    sel_member = member[i];
                    break;
                }
            }

            if (sel_member == undefined) {
                result += "User not found. Vote deleted.";
                await msg.edit({ files: [{ attachment: outputBuffer, name: 'VoteStatus.png'}], components: [], content: result});
                await db.run("DELETE FROM votes WHERE id = ?", [vote.id]);
                return
            }

            await sel_member.ban({ deleteMessageSeconds: 60 * 60 * 24 * 7, reason: "A vote has banned you from the server. You have been banned for 1 week." });
        } else if (vote.fields.type == "Unban" && passed) {
            let username = vote.fields["User"];

            let member = Array.from((await client.guilds.cache.get(Server).bans.fetch()).values());
            let sel_member;

            for (let i = 0; i < member.length; i++) {
                let user = member[i].user;
                let _username = user.username;
                if (_username == username) {
                    sel_member = member[i];
                    break;
                }
            }

            if (sel_member == undefined) {
                result += "User not found. Vote deleted.";
                await msg.edit({ files: [{ attachment: outputBuffer, name: 'VoteStatus.png'}], components: [], content: result});
                await db.run("DELETE FROM votes WHERE id = ?", [vote.id]);
                return
            }

            await client.guilds.cache.get(Server).members.unban(sel_member)
        } else if (vote.fields.type == "Delete Builderman" && passed) {
            let role = await client.guilds.cache.get(Server).roles.fetch(Roles.Builderman)
            await role.delete()
        } else if (vote.fields.type == "Update Democrobot" && passed) {
            setTimeout(async () => {
                let time_string = new Date(vote.time + VoteMinTime).toISOString().split(".")[0].replace("T", " ") + " UTC";
                let channel = client.guilds.cache.get(Server).channels.cache.get(Channels.Announcements)
                let msg = await channel.send("Democrobot Update (" + time_string + "):\n  Core files: ❌\n  Dependencies: ❌");
                let startTime = new Date();
                await simpleGit().pull();
                let total_core = (new Date()).getTime() - startTime.getTime();
                await msg.edit("Democrobot Update (" + time_string + "):\n  Core files: ✅ ( " + Math.round(total_core / 100) / 10 + "s )\n  Dependencies: ❌")
                startTime = new Date();
                await exec("bun i");
                let total_dep = (new Date()).getTime() - startTime.getTime();
                await msg.edit("Democrobot Update (" + time_string + "):\n  Core files: ✅ ( " + Math.round(total_core / 100) / 10 + "s )\n  Dependencies: ✅ ( " + Math.round(total_dep / 100) / 10 + "s )")
                process.exit(0);
            }, 1000);
        }

        await msg.edit({ files: [{ attachment: outputBuffer, name: 'VoteStatus.png'}], components: [], content: result});
        await db.run("DELETE FROM votes WHERE id = ?", [vote.id]);

        if ((vote.fields.type == "Delete Builderman" && passed)) {
            // exit program
            process.exit(0);
        }
    }
}

module.exports = {voting_init, process_vote, voting_pulse}